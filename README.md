# 技能管理（DSH 插件）

DSH 侧栏里的一块「技能」面板：把发现的每个 skill 列出来，逐个开关。关掉只对你这一台机器上的 DSH 生效——不删文件、不改 `SKILL.md`、不影响其他客户端。

## 为什么需要

skill 是磁盘上的文件，想停用一个通常只有两条路：把目录挪走，或者去改 `SKILL.md` 里的声明。两条路都不适合「这个我先不用，可能过两天再开」：挪走了就忘了放在哪，改文件则要重新读一遍 frontmatter。装了一堆 skill 之后，更难看清的是**一个 skill 到底从哪个目录被读进来的**——项目里的 `.dsh/skills`、`.agents/skills`，用户级目录，还是随 DSH 一起发的那批。

这个插件把两件事一起解决：按来源目录分组列出所有 skill，每个一行开关，关掉之后它不再出现在模型可见的技能目录里。

## 安装

需要先有 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）。

在 DSH 的插件安装界面里填这份仓库的地址：

```text
github:tf961656585/dsh-plugin-skill-manager
```

也可以填这份仓库在本机的绝对路径。装完重启 DSH，左侧栏就会出现「技能」。

## 用起来是什么样

- 左侧栏出现「技能」图标，点开是按发现目录分组的清单：
  - **项目**：工作区里的 `.dsh/skills` 和 `.agents/skills`；
  - **用户**：`~/.dsh` 下的用户级技能目录，以及共享 agent 目录；
  - **随 DSH 提供**：DSH 自带的那批。
- 每组标题旁显示「3/8 已开启」，开关就在每行右侧；改动即时保存，不需要重启。
- 关掉之后：模型可见的技能目录里不再列出它，`skill` 工具加载不了，`/` 菜单也不再出现。面板里它仍在原位、标为「已关闭」，随时可以打开。
- 有些 skill 在自己的 `SKILL.md` 里声明了停用，面板会标成「SKILL.md 中已关闭」并禁用开关——那是文件说了算，得改文件才能开启。
- 顶部的「刷新」重新扫描一次目录；新放进来的 skill 会自动出现。

## 怎么做到不改文件

skill 的发现逻辑挂在每个 Agent 自己的作用域上，外层注册覆盖不了它。所以插件不是去「隐藏」别人列出的技能，而是给每个 Agent 注册一个同作用域的 provider：对被关掉的 skill，它返回一条**不可调用**的条目（`modelInvocable` / `userInvocable` 都为 false）。模型的技能目录、`skill` 工具和 `/` 菜单本来就只收可调用的条目，于是它自然消失——同时 skill 文件一个字节都没动。

关掉之后如果真有消费者点名要它，返回的是一段明确的说明（这份 skill 已在技能管理里关闭），而不是一份过期内容。

## 数据放在哪

`<DSH_PROFILE_DIR>/skill-manager.json`（没有 profile 时退回 `$DSH_HOME`，再退回 `~/.dsh`）。里面只有一份「被关闭的 skill 路径」列表，原子替换写入；文件损坏时按空状态处理并记一条日志，不会覆盖你的配置。

## 目录

- `host.js`：技能清单、开关状态、每个 Agent 的影子 provider、两条 HTTP 路由。
- `client.js`：侧栏图标、分组清单和开关。
- `locale/`：插件列表里显示的名称与描述。
- `cordis.patch.yml`：只插入本插件一行，不覆盖任何内置行。

## 边界

- 只影响 DSH。别的客户端读的是同一批文件，它们的状态由它们自己决定。
- 状态按 skill 的**绝对路径**记，所以同一个 skill 在不同工作区下算两个条目。
- DSH 启动时才发现的新技能目录，要等面板「刷新」或下次进入才出现。
- 这是本地开关，不是权限系统：它防的是「模型自己想起来用某个 skill」，不是防人能改回来。

## 协议

MIT，见 [LICENSE](LICENSE)。

> 同系列插件：[产品经理看板](https://github.com/tf961656585/dsh-plugin-pm-board)、[本机进程](https://github.com/tf961656585/dsh-plugin-process-guard)、[同步委派](https://github.com/tf961656585/dsh-plugin-sync-delegate)、[用户画像](https://github.com/tf961656585/dsh-plugin-user-persona)。
