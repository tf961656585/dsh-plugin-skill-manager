/**
 * Skill Manager — Host half.
 *
 * Turns individual skills off for DSH only. Nothing is written to a skill file:
 * the switch lives in a JSON state file owned by this plugin.
 *
 * Skills are discovered by the filesystem provider mounted INSIDE each agent
 * preset, so a host-level registration can never shadow them: the registry gives
 * the nearest scope the final word. This plugin therefore registers one shadow
 * provider per Agent, on that Agent's own context — the exact scope the model
 * catalog, the `skill` tool and the `/` menu all read through. A disabled skill
 * reappears there as a non-invocable entry, which every consumer already drops.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

export const name = 'skillManager'
export const inject = ['skills']

const ROUTE_BASE = '/plugin/skill-manager'
const MAX_BODY_BYTES = 64 * 1024
const STATE_VERSION = 1
const PROVIDER_NAME = 'skill-manager'
const SHADOW_RANK = 0
const SOURCE_ORDER = ['project-dsh', 'project-agents', 'custom', 'user-dsh', 'user-agents', 'bundled']

/** State directory: the profile when launched by one, otherwise the harness home. */
function stateFile() {
  const profile = process.env.DSH_PROFILE_DIR
  if (typeof profile === 'string' && profile !== '') return path.join(profile, 'skill-manager.json')
  const home = process.env.DSH_HOME
  if (typeof home === 'string' && home !== '') return path.join(home, 'skill-manager.json')
  return path.join(homedir(), '.dsh', 'skill-manager.json')
}

/**
 * Group one skill file under the directory it was discovered in.
 * @param file - absolute path of the skill file (`<root>/<name>/SKILL.md` or `<root>/<name>.md`).
 * @returns the discovery root path.
 */
function rootOf(file) {
  const directory = path.dirname(file)
  if (path.basename(directory) === 'skills') return directory
  if (path.basename(file) === 'SKILL.md') return path.dirname(directory)
  return directory
}

function sourceScope(source) {
  if (typeof source !== 'string') return 'other'
  if (source === 'project-dsh' || source === 'project-agents') return 'project'
  if (source === 'user-dsh' || source === 'user-agents') return 'user'
  return source
}

function sourceOrder(source) {
  const index = SOURCE_ORDER.indexOf(source)
  return index === -1 ? SOURCE_ORDER.length : index
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

function sendMethodNotAllowed(res, allow) {
  res.statusCode = 405
  res.setHeader('allow', allow)
  res.end()
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

class SkillManager {
  constructor(ctx) {
    this.ctx = ctx
    this.file = stateFile()
    this.disabled = new Set()
    /** agent id → { control } */
    this.agents = new Map()
    this.nested = new AsyncLocalStorage()
    this.writing = Promise.resolve()
    this.load()
  }

  /** Read persisted state; a missing file is the normal empty state. */
  load() {
    let raw
    try {
      raw = readFileSync(this.file, 'utf8')
    } catch (error) {
      if (error?.code !== 'ENOENT') this.ctx.logger.warn(`skill-manager: cannot read ${this.file}: ${String(error)}`)
      return
    }
    try {
      const parsed = JSON.parse(raw)
      const disabled = parsed?.disabled
      if (Array.isArray(disabled)) {
        for (const entry of disabled) if (typeof entry === 'string' && entry !== '') this.disabled.add(entry)
      }
    } catch (error) {
      this.ctx.logger.warn(`skill-manager: ignoring malformed state in ${this.file}: ${String(error)}`)
    }
  }

  /** Persist state atomically, serialized so overlapping toggles cannot interleave. */
  save() {
    const payload = `${JSON.stringify({ version: STATE_VERSION, disabled: [...this.disabled].sort() }, null, 2)}\n`
    this.writing = this.writing.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true })
      const temporary = `${this.file}.${process.pid}.tmp`
      await writeFile(temporary, payload, 'utf8')
      await rename(temporary, this.file)
    }).catch((error) => {
      this.ctx.logger.warn(`skill-manager: cannot save ${this.file}: ${String(error)}`)
    })
    return this.writing
  }

  /**
   * Register the shadow provider on one Agent's own scope.
   *
   * The Agent object is the scope key every skill consumer passes to the
   * registry, so a registration here is the nearest layer for exactly that
   * Agent's reads and nobody else's.
   */
  attach(agent) {
    if (this.agents.has(agent.id)) return
    const registry = agent.ctx.get('skills')
    if (registry === undefined) return
    const record = { control: undefined }
    this.agents.set(agent.id, record)
    agent.ctx.effect(() => registry.registerProvider((control) => {
      record.control = control
      control.signal.addEventListener('abort', () => {
        if (this.agents.get(agent.id) === record) this.agents.delete(agent.id)
      }, { once: true })
      return {
        name: PROVIDER_NAME,
        list: (options) => this.list(agent, registry, options),
        get: (candidate) => this.get(candidate),
      }
    }), 'skill-manager: agent shadow provider')
  }

  /** Attach to Agents that existed before this plugin loaded (plugin reload). */
  attachLive() {
    const agents = this.ctx.get('agents')
    if (agents === undefined) return
    try {
      for (const agent of agents.list()) this.attach(agent)
    } catch (error) {
      this.ctx.logger.warn(`skill-manager: cannot attach to live agents: ${String(error)}`)
    }
  }

  /**
   * Publish shadow candidates for the skills this Agent must not see.
   *
   * The name list comes from the same registry and scope. The nested read is
   * marked so this provider contributes nothing to it; without the marker the
   * call would recurse into itself.
   */
  async list(agent, registry, options) {
    if (this.nested.getStore() === true) return []
    if (this.disabled.size === 0) return []
    const disabled = new Set(this.disabled)
    const snapshot = await this.nested.run(true, () => registry.snapshot({
      cwd: options.cwd,
      scope: agent,
      signal: options.signal,
    }))
    const candidates = []
    for (const summary of snapshot.skills) {
      if (typeof summary.path !== 'string' || summary.path === '') continue
      if (!disabled.has(summary.path)) continue
      candidates.push({
        name: summary.name,
        description: summary.description,
        ...(summary.whenToUse === undefined ? {} : { whenToUse: summary.whenToUse }),
        invocation: { modelInvocable: false, userInvocable: false },
        source: summary.source,
        provider: PROVIDER_NAME,
        rank: SHADOW_RANK,
        path: summary.path,
        locator: {
          name: summary.name,
          description: summary.description,
          whenToUse: summary.whenToUse,
          source: summary.source,
          path: summary.path,
        },
      })
    }
    return candidates
  }

  /** A disabled skill is never loaded by a consumer that honours the policy; keep the answer explicit. */
  async get(candidate) {
    const locator = candidate.locator
    return {
      name: locator.name,
      description: locator.description,
      ...(locator.whenToUse === undefined ? {} : { whenToUse: locator.whenToUse }),
      invocation: { modelInvocable: false, userInvocable: false },
      source: locator.source,
      provider: PROVIDER_NAME,
      content: [
        `<skill_disabled name="${locator.name}">`,
        'This skill is turned off in DSH Skill Manager.',
        'Turn it back on in the Skill Manager panel of the DSH sidebar to load it again.',
        '</skill_disabled>',
      ].join('\n'),
      path: locator.path,
    }
  }

  /** Refresh every attached Agent's catalog after a state change. */
  invalidateAll() {
    for (const record of this.agents.values()) {
      try {
        record.control?.invalidate()
      } catch (error) {
        this.ctx.logger.warn(`skill-manager: cannot invalidate an agent catalog: ${String(error)}`)
      }
    }
  }

  /** Workspaces the panel offers as project scope. */
  workspaces() {
    const registry = this.ctx.get('workspaceRegistry')
    if (registry === undefined) return []
    try {
      return registry.list().map((workspace) => ({
        id: String(workspace.id),
        path: workspace.path,
        title: typeof workspace.title === 'string' && workspace.title !== '' ? workspace.title : path.basename(workspace.path),
      }))
    } catch (error) {
      this.ctx.logger.warn(`skill-manager: cannot list workspaces: ${String(error)}`)
      return []
    }
  }

  /** Default project directory when the panel opens: the first workspace, else the harness directory. */
  defaultCwd(workspaces) {
    if (workspaces.length > 0) return workspaces[0].path
    const working = this.ctx.get('workingDirectory')
    const fallback = typeof working?.defaultDirectory === 'string' ? working.defaultDirectory : undefined
    return fallback !== undefined && fallback !== '' ? fallback : undefined
  }

  /**
   * Read the roster through a scope that actually has skills: a live Agent, or
   * else the default preset's cold-read lease. The host's own scope has no
   * filesystem provider because presets mount it.
   */
  async roster(cwd) {
    const presets = this.ctx.get('agentPresets')
    const agents = this.ctx.get('agents')
    let live
    try {
      live = agents?.list()[0]
    } catch {
      live = undefined
    }
    const registry = this.ctx.get('skills')
    if (live !== undefined) {
      const scoped = presets?.serviceFor(live, 'skills') ?? registry
      return await scoped.snapshot({ cwd, scope: live })
    }
    if (presets !== undefined) {
      const preset = await presets.resolve()
      const lease = await presets.acquireScope(preset.id)
      try {
        return await registry.snapshot({ cwd, scope: lease.key })
      } finally {
        await lease[Symbol.asyncDispose]?.()
      }
    }
    return await registry.snapshot({ cwd })
  }

  /** Inventory for the panel, grouped by discovery root. */
  async catalog(cwd) {
    const snapshot = await this.roster(cwd)
    const groups = new Map()
    for (const summary of snapshot.skills) {
      if (typeof summary.path !== 'string' || summary.path === '') continue
      const root = rootOf(summary.path)
      let group = groups.get(root)
      if (group === undefined) {
        group = {
          key: root,
          root,
          source: summary.source,
          scope: sourceScope(summary.source),
          skills: [],
        }
        groups.set(root, group)
      }
      const byUs = this.disabled.has(summary.path)
      group.skills.push({
        name: summary.name,
        description: summary.description,
        path: summary.path,
        enabled: byUs ? false : summary.invocation.modelInvocable,
        byUs,
        byFile: !byUs && summary.invocation.modelInvocable === false,
      })
    }
    const ordered = [...groups.values()]
      .map((group) => ({
        ...group,
        skills: group.skills.sort((left, right) => left.name.localeCompare(right.name)),
      }))
      .sort((left, right) => sourceOrder(left.source) - sourceOrder(right.source) || left.root.localeCompare(right.root))
    return { groups: ordered, complete: snapshot.complete }
  }

  /**
   * Flip one skill and refresh every attached Agent.
   * @returns the effective state after the write.
   */
  async toggle(file, enabled) {
    if (enabled) this.disabled.delete(file)
    else this.disabled.add(file)
    await this.save()
    this.invalidateAll()
    // The `/` menu caches `skills/list` per Session in the Client and only
    // drops it on this event; the model catalog refreshes by itself on the next
    // step. Best effort: a missing listener costs nothing.
    try {
      this.ctx.emit('plugin-manager/changed', { reason: 'skill-manager' })
    } catch (error) {
      this.ctx.logger.warn(`skill-manager: cannot announce the catalog change: ${String(error)}`)
    }
    return enabled
  }
}

export function apply(ctx) {
  const manager = new SkillManager(ctx)

  ctx.on('agent/created', ({ agent }) => {
    try {
      manager.attach(agent)
    } catch (error) {
      ctx.logger.warn(`skill-manager: cannot attach to agent ${agent.id}: ${String(error)}`)
    }
  })
  manager.attachLive()

  const rejectionOf = (req, res) => {
    const connection = ctx.get('connection')
    if (connection === undefined || typeof connection.requestRejection !== 'function') return false
    const rejection = connection.requestRejection(req)
    if (rejection === undefined) return false
    res.statusCode = rejection
    res.end()
    return true
  }

  ctx.inject(['webServer'], (web) => {
    web.effect(() => {
      const disposers = [
        web.webServer.register({
          kind: 'exact',
          path: `${ROUTE_BASE}/catalog`,
          handler: async (req, res) => {
            if (rejectionOf(req, res)) return
            if (req.method !== 'GET') {
              sendMethodNotAllowed(res, 'GET')
              return
            }
            try {
              const url = new URL(String(req.url ?? '/'), 'http://localhost')
              const requested = url.searchParams.get('cwd')
              const workspaces = manager.workspaces()
              const fallback = manager.defaultCwd(workspaces)
              const cwd = typeof requested === 'string' && requested !== '' ? requested : fallback
              const catalog = await manager.catalog(cwd)
              sendJson(res, 200, {
                cwd: cwd ?? null,
                workspaces,
                defaultCwd: fallback ?? null,
                ...catalog,
              })
            } catch (error) {
              ctx.logger.warn(`skill-manager: catalog failed: ${String(error)}`)
              sendJson(res, 500, { error: 'catalog-failed' })
            }
          },
        }),
        web.webServer.register({
          kind: 'exact',
          path: `${ROUTE_BASE}/toggle`,
          handler: async (req, res) => {
            if (rejectionOf(req, res)) return
            if (req.method !== 'POST') {
              sendMethodNotAllowed(res, 'POST')
              return
            }
            let body
            try {
              body = JSON.parse(await readBody(req))
            } catch {
              sendJson(res, 400, { error: 'invalid-body' })
              return
            }
            const file = body?.path
            const enabled = body?.enabled
            if (
              typeof file !== 'string'
              || !path.isAbsolute(file)
              || !file.endsWith('.md')
              || typeof enabled !== 'boolean'
            ) {
              sendJson(res, 400, { error: 'invalid-request' })
              return
            }
            try {
              const effective = await manager.toggle(file, enabled)
              sendJson(res, 200, { ok: true, path: file, enabled: effective })
            } catch (error) {
              ctx.logger.warn(`skill-manager: toggle failed: ${String(error)}`)
              sendJson(res, 500, { error: 'toggle-failed' })
            }
          },
        }),
      ]
      return () => { for (const dispose of disposers) dispose?.() }
    }, 'skill-manager: routes')
  })
}
