/**
 * Skill Manager — Client half.
 *
 * Adds the Skills panel icon to the left sidebar and the management page it
 * opens. The page reads the Host through two same-origin routes; it keeps no
 * durable state of its own.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-skill-manager',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'skill-manager'
    const PANEL_ID = 'skill-manager'
    const ROUTE_CATALOG = '/plugin/skill-manager/catalog'
    const ROUTE_TOGGLE = '/plugin/skill-manager/toggle'

    const zh = {
      panel: '技能',
      title: '技能管理',
      subtitle: '开关只影响 DSH：不修改 skill 文件，也不影响其他客户端。',
      loading: '正在读取技能目录…',
      loadFailed: '读取技能目录失败。',
      retry: '重试',
      empty: '没有发现可管理的技能。',
      workspace: '工作区',
      userLevel: '用户级',
      count: '{on}/{total} 已开启',
      off: '已关闭',
      byFile: 'SKILL.md 中已关闭',
      byFileHint: '该技能在 SKILL.md 里声明了停用，需修改文件才能开启。',
      toggleFailed: '切换失败，已恢复原状态。',
      projectScope: '项目',
      userScope: '用户',
      note: '关闭后它不会出现在模型可见的技能目录里，`skill` 工具也无法加载，`/` 菜单不再列出。',
      refresh: '刷新',
      'source.project-dsh': '项目 · .dsh/skills',
      'source.project-agents': '项目 · .agents/skills',
      'source.user-dsh': '用户 · DSH',
      'source.user-agents': '用户 · 共享 agent 目录',
      'source.custom': '自定义目录',
      'source.bundled': '随 DSH 提供',
    }

    const en = {
      panel: 'Skills',
      title: 'Skill manager',
      subtitle: 'Switches affect DSH only: skill files stay untouched and other clients keep their own state.',
      loading: 'Reading the skill catalog…',
      loadFailed: 'Could not read the skill catalog.',
      retry: 'Retry',
      empty: 'No skills found.',
      workspace: 'Workspace',
      userLevel: 'User',
      count: '{on}/{total} on',
      off: 'Off',
      byFile: 'Off in SKILL.md',
      byFileHint: 'This skill disables itself in its SKILL.md; edit the file to turn it on.',
      toggleFailed: 'The switch failed and was restored.',
      projectScope: 'Project',
      userScope: 'User',
      note: 'A disabled skill leaves the model-visible catalog, the `skill` tool refuses it, and the `/` menu no longer lists it.',
      refresh: 'Refresh',
      'source.project-dsh': 'Project · .dsh/skills',
      'source.project-agents': 'Project · .agents/skills',
      'source.user-dsh': 'User · DSH',
      'source.user-agents': 'User · shared agent dir',
      'source.custom': 'Custom directory',
      'source.bundled': 'Bundled with DSH',
    }

    const CSS = `
.dsm-page{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
.dsm-head{padding:20px 24px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsm-title{margin:0;font-size:16px;font-weight:600;line-height:24px}
.dsm-sub{margin:6px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dsm-bar{display:flex;align-items:center;gap:8px;padding:10px 24px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsm-bar-label{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsm-select{height:28px;max-width:420px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px}
.dsm-btn{height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer}
.dsm-btn:hover{background:var(--dsw-alias-bg-layer-2)}
.dsm-body{flex:1;min-height:0;overflow:auto;padding:4px 24px 32px}
.dsm-group{margin-top:18px}
.dsm-group-head{display:flex;align-items:baseline;gap:8px;margin-bottom:8px}
.dsm-group-name{font-size:13px;font-weight:600}
.dsm-group-root{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsm-group-count{font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsm-tag{flex:none;padding:0 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;font-size:10px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.dsm-card{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.dsm-row{display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsm-row:last-child{border-bottom:none}
.dsm-row-main{flex:1;min-width:0}
.dsm-row-name{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600}
.dsm-row-desc{margin-top:3px;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dsm-row-path{margin-top:4px;font-size:11px;color:var(--dsw-alias-label-secondary);opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsm-row-off .dsm-row-name,.dsm-row-off .dsm-row-desc{color:var(--dsw-alias-label-secondary)}
.dsm-switch{flex:none;position:relative;width:34px;height:20px;margin-top:2px;border:none;border-radius:999px;background:var(--dsw-alias-border-l2);cursor:pointer;transition:background .15s ease;padding:0}
.dsm-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary)}
.dsm-switch:disabled{opacity:.45;cursor:not-allowed}
.dsm-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s ease;box-shadow:0 1px 2px rgba(0,0,0,.25)}
.dsm-switch[aria-checked="true"] .dsm-knob{transform:translateX(14px)}
.dsm-hint{margin-top:4px;font-size:11px;color:var(--dsw-alias-state-warn-primary)}
.dsm-note{padding:10px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dsm-error{margin-top:12px;padding:10px 16px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:8px;font-size:12px;color:var(--dsw-alias-state-error-primary)}
.dsm-center{display:flex;align-items:center;justify-content:center;min-height:160px;font-size:12px;color:var(--dsw-alias-label-secondary)}
`

    function SkillManagerIcon({ size }) {
      const edge = typeof size === 'number' && size > 0 ? size : 16
      return h(
        'svg',
        {
          width: edge,
          height: edge,
          viewBox: '0 0 16 16',
          fill: 'none',
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('path', {
          d: 'M8 1.8l1.7 3.6 3.9.5-2.9 2.7.8 3.9L8 10.6l-3.5 1.9.8-3.9L2.4 5.9l3.9-.5L8 1.8z',
          stroke: 'currentColor',
          strokeWidth: 1.2,
          strokeLinejoin: 'round',
        }),
      )
    }

    function format(t, key, params) {
      let text = t(key)
      for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, String(value))
      return text
    }

    function Switch({ checked, disabled, label, onChange }) {
      return h(
        'button',
        {
          type: 'button',
          className: 'dsm-switch',
          role: 'switch',
          'aria-checked': checked ? 'true' : 'false',
          'aria-label': label,
          disabled,
          onClick: () => onChange(!checked),
        },
        h('span', { className: 'dsm-knob' }),
      )
    }

    function SkillRow({ skill, busy, t, onToggle }) {
      const off = !skill.enabled
      return h(
        'div',
        { className: `dsm-row${off ? ' dsm-row-off' : ''}` },
        h(
          'div',
          { className: 'dsm-row-main' },
          h(
            'div',
            { className: 'dsm-row-name' },
            h('span', null, skill.name),
            skill.byFile ? h('span', { className: 'dsm-tag' }, t('byFile')) : null,
          ),
          skill.description ? h('div', { className: 'dsm-row-desc' }, skill.description) : null,
          skill.byFile ? h('div', { className: 'dsm-hint' }, t('byFileHint')) : null,
          h('div', { className: 'dsm-row-path', title: skill.path }, skill.path),
        ),
        h(Switch, {
          checked: skill.enabled,
          disabled: busy || skill.byFile,
          label: skill.name,
          onChange: (next) => onToggle(skill, next),
        }),
      )
    }

    function Group({ group, t, busy, onToggle, sourceLabel }) {
      const on = group.skills.filter((skill) => skill.enabled).length
      return h(
        'section',
        { className: 'dsm-group' },
        h(
          'div',
          { className: 'dsm-group-head' },
          h('span', { className: 'dsm-group-name' }, sourceLabel),
          h('span', { className: 'dsm-tag' }, group.scope === 'project' ? t('projectScope') : t('userScope')),
          h('span', { className: 'dsm-group-root', title: group.root }, group.root),
          h('span', { className: 'dsm-group-count' }, format(t, 'count', { on, total: group.skills.length })),
        ),
        h(
          'div',
          { className: 'dsm-card' },
          group.skills.map((skill) => h(SkillRow, {
            key: skill.path,
            skill,
            t,
            busy: busy.has(skill.path),
            onToggle,
          })),
        ),
      )
    }

    function SkillManagerPage({ t }) {
      const [state, setState] = React.useState({ status: 'loading', data: null })
      const [busy, setBusy] = React.useState(() => new Set())
      const [failure, setFailure] = React.useState(null)
      const abortRef = React.useRef(null)

      const load = React.useCallback(async (cwd) => {
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller
        setState((previous) => ({ status: 'loading', data: previous.data }))
        try {
          const query = typeof cwd === 'string' && cwd !== '' ? `?cwd=${encodeURIComponent(cwd)}` : ''
          const response = await fetch(`${ROUTE_CATALOG}${query}`, {
            signal: controller.signal,
            headers: { accept: 'application/json' },
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const data = await response.json()
          setState({ status: 'ready', data })
          setFailure(null)
        } catch (error) {
          if (controller.signal.aborted) return
          setState((previous) => ({ status: 'error', data: previous.data }))
        }
      }, [])

      React.useEffect(() => {
        void load()
        return () => { abortRef.current?.abort() }
      }, [load])

      const toggle = React.useCallback(async (skill, next) => {
        setFailure(null)
        setBusy((previous) => new Set(previous).add(skill.path))
        setState((previous) => {
          if (previous.data === null) return previous
          const groups = previous.data.groups.map((group) => ({
            ...group,
            skills: group.skills.map((entry) => (entry.path === skill.path ? { ...entry, enabled: next, byUs: !next } : entry)),
          }))
          return { status: previous.status, data: { ...previous.data, groups } }
        })
        try {
          const response = await fetch(ROUTE_TOGGLE, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: skill.path, enabled: next }),
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
        } catch {
          setFailure(t('toggleFailed'))
          await load(state.data?.cwd ?? undefined)
        } finally {
          setBusy((previous) => {
            const next = new Set(previous)
            next.delete(skill.path)
            return next
          })
        }
      }, [load, state.data?.cwd, t])

      const data = state.data
      const workspaces = Array.isArray(data?.workspaces) ? data.workspaces : []
      const groups = Array.isArray(data?.groups) ? data.groups : []

      return h(
        'div',
        { className: 'dsm-page' },
        h('style', null, CSS),
        h(
          'header',
          { className: 'dsm-head' },
          h('h1', { className: 'dsm-title' }, t('title')),
          h('p', { className: 'dsm-sub' }, t('subtitle')),
        ),
        h(
          'div',
          { className: 'dsm-bar' },
          workspaces.length > 0
            ? h(
              React.Fragment,
              null,
              h('label', { className: 'dsm-bar-label', htmlFor: 'dsm-workspace' }, t('workspace')),
              h(
                'select',
                {
                  id: 'dsm-workspace',
                  className: 'dsm-select',
                  value: data?.cwd ?? '',
                  onChange: (event) => { void load(event.target.value) },
                },
                workspaces.map((workspace) => h('option', { key: workspace.id, value: workspace.path }, `${workspace.title} — ${workspace.path}`)),
              ),
            )
            : null,
          h(
            'button',
            { type: 'button', className: 'dsm-btn', onClick: () => { void load(data?.cwd ?? undefined) }, disabled: state.status === 'loading' },
            t('refresh'),
          ),
        ),
        h(
          'div',
          { className: 'dsm-body' },
          state.status === 'loading' && data === null ? h('div', { className: 'dsm-center' }, t('loading')) : null,
          state.status === 'error' && data === null
            ? h(
              'div',
              { className: 'dsm-center' },
              h('div', null, t('loadFailed')),
            )
            : null,
          failure !== null ? h('div', { className: 'dsm-error' }, failure) : null,
          data !== null && groups.length === 0 && state.status !== 'loading' ? h('div', { className: 'dsm-center' }, t('empty')) : null,
          groups.map((group) => h(Group, {
            key: group.key,
            group,
            t,
            busy,
            onToggle: toggle,
            sourceLabel: t(`source.${group.source}`),
          })),
          data !== null
            ? h(
              'div',
              { className: 'dsm-group' },
              h('div', { className: 'dsm-note' }, t('note')),
            )
            : null,
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'skill-manager: dictionaries')
        const t = ctx.locale.bind(NS)

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
          inject: () => ({ t }),
        }, SkillManagerPage))

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 10,
          label: () => t('panel'),
          locale: NS,
        }, SkillManagerIcon))
      },
    }
  },
})
