# 社交来源插件验收

日期：2026-10-17；源码基线 `8bdef0e`，本次新增独立 Bluesky、Fediverse、Nostr collector。沿用同一 SDK、来源 API、任务/入库、有限原生 DSL；没有 Swift 插件 ID 分支、额外 SQL 表或旧版兼容代码。

## 自动验证

- Apple Container 中 `npm run check`、`npm run format:check`、Node build、Node/Cloudflare 插件预检、Worker dry run 通过。
- `npm test`：53 个单元测试、47 个集成测试全部通过。后者运行真实 PostgreSQL 和 workerd/SQLite DO + Queues/Alarms，包括迁移重放、竞争/重启恢复、代际栅栏、事务回滚和跨账户拒绝。
- 新增社交契约覆盖三插件入库、重复、修订、partial、Nostr 签名/ID/筛选、非公开内容排除、URL/relay 授权、实例秘密不外泄、握手重定向/限流、EOSE 前断开、关闭、取消与大小限制。
- Swift MeltedCore 20 项、macOS 21 项通过。新增共享 fixture 验证服务端字段与实例/relay select 可由当前客户端理解，未增加可执行 DSL。
- 原生 App 构建、签名验证通过；静态设计链接/JSON/颜色检查及 git diff 空白检查通过。这些不是远端 CI 或公网部署证据。

集成测试最初一次与真实采集脚本同时启动了指向同一专用测试库、但配置不同的 Node worker，导致互相领取任务；已改为串行运行并完整重跑通过。未修改生产租约规则或放宽地址授权来掩盖该测试安排问题。

## 真实公开来源

[最终运行记录](live.json)，2026-10-17 15:21:16–15:21:25 UTC。每个 backend 使用独立临时账户；Node 是编译产物，Worker 是实际打包后的 workerd，结束后清理测试账户。使用已有的公开根证书补充解决本地 workerd CA 差异，TLS 验证始终开启。

| 来源 | 目标 | Node 入库 / 重复 | Worker 入库 / 重复 |
| --- | --- | --- | --- |
| Bluesky | public.api.bsky.app，账号 bsky.app，最多 10 条 | 7 / 7 | 7 / 7 |
| Fediverse | mastodon.social，Mastodon 话题，最多 10 条 | 10 / 10 | 10 / 10 |
| Nostr | wss://nos.lol/，nostr 话题，kind 1，最多 10 条 | 10 / 10 | 10 / 10 |

所有最终 receipt 为 complete、无 invalid、重复请求新增为 0。Bluesky 默认排除转发，因此原始窗口中的部分条目不进入结果。真实帖子持续变化，不把一次重复为零解释为未来永远不会正常新增。

[初次原生 WebSocket 运行](live-initial-native-websocket.json) 中 Nostr 连接失败；增加明确的 Node ws / Worker upgrade transport 后，[Damus 重试](live-damus-522.json) 显示上游 HTTP 522，已按可重试错误保留。另行直接探测 Damus、nos.lol、Primal 均曾返回 5 条有效事件，说明 relay 可用性会变化；最终入库验收使用 nos.lol，没有自动切换未授权 relay。Node 与 Worker 模拟协议测试还发现并修复 EOSE 后过早 abort 影响 CLOSE 发送的问题。

## 原生配置 UI

- 新构建 `/Volumes/BRData/projects/melted/build/Melted.app`，Bundle ID `com.alkinum.melted`，版本 0.2.0（13）。
- 二进制 SHA256 `0757d7aa4b057f59a41be14756cde41940942fbe8ba286acfb949e603de81176`。
- macOS 27.0.1（26A434），620×520 pt 编辑 sheet，100% 字号，真实原生窗口与 AX 操作。
- 从更新后的本地服务器读取 5 个插件，三个新插件均有独立入口与可折叠分区。填写 Bluesky 账号后添加按钮启用；Fediverse 的实例为服务器 select；Nostr 可选作者/话题和短帖/长文。只操作临时草稿，未向现有账户添加测试订阅。
- 使用现有 MeltedScrollView 与统一字段/菜单/按钮，检查首屏及滚动到底；固定 footer 可达、上缘渐隐。深浅色检查后恢复深色。

| 表单 | 深色 | 浅色 |
| --- | --- | --- |
| Bluesky | [首屏](bluesky-dark.png)、[滚动到底](bluesky-scroll-dark.png) | [首屏](bluesky-light.png) |
| Fediverse | [首屏](fediverse-dark.png) | [首屏](fediverse-light.png) |
| Nostr | [首屏](nostr-dark.png) | [长文选项与底部](nostr-light.png) |

[浅色插件分区](plugins-light.png)。截图时 Nostr 的已授权选项为 Damus；最终本地配置增补已实测 nos.lol 为首个选项，保留 Damus 供独立选择。配置选项来自同一服务器 DSL，不来自客户端代码。

## 边界

Fediverse 当前支持 Mastodon 兼容公开 API，不宣称覆盖所有 ActivityPub 软件；Nostr 不认证、不发布、不处理私信，不补抓作者元数据。真实验收覆盖上表三条路径；Bluesky 自定义 Feed、Fediverse 账号查询、Nostr 作者/长文、受限实例 token 走合成协议/契约验证，未逐项真实授权验收。

采集只读当前窗口，无完整回填、撤回同步或全网最终版本仲裁；附件只保存引用，HTML/文本不执行；原始数据没有进入 AI 简报。未做公网 Worker 部署、最低 macOS、iOS、VoiceOver 或本次 200% 字号全矩阵。App 构建还包含工作树中已有的阅读滚动/底栏改动，它们不属于本次提交。
