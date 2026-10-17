# Bluesky、Fediverse 与 Nostr

三个独立 `collector.poll` 插件均继承 `BaseCollectorPlugin`，支持 Node/PostgreSQL 和 Cloudflare Workers/SQLite DO。每个订阅独立启停、轮询、去重、修订与查询 receipt；账号/话题/Feed 是来源目标，不是 Melted 登录身份。当前只采集公开内容到原始库，不发布内容、不自动生成简报。

## 运营者配置

`server/plugins.json` 已启用随包实现；实际可用性由 `PLUGIN_CONFIG`（Node YAML 为 `plugins`）决定。API 与独立 collector 进程必须使用相同配置：

```json
{
  "bluesky": {"service_url": "https://public.api.bsky.app"},
  "fediverse": {"instances": [{"origin": "https://mastodon.social"}]},
  "nostr": {"relays": [{"url": "wss://nos.lol"}]}
}
```

Bluesky 配置 `{}` 也会使用上述公共 AppView。Fediverse 与 Nostr 分别允许最多 50 个不同实例/relay；服务器把选项和默认值放入 DSL select，客户端没有硬编码站点。一个来源只选择一个实例或 relay，多个目标创建多条订阅。

Fediverse 实例可单独配置 `access_token`，用于关闭匿名公开预览的实例；秘密只在服务端对应实例的 Authorization header 中发送。没有客户端 token/密码/私钥字段。Bluesky 首版不使用登录，Nostr 不发送 AUTH/EVENT，不接受 nsec 或私钥，受限 relay 返回明确的 `relay_access_required`。

公开实例仅允许 HTTPS、默认端口和非本地域名；relay 仅允许 WSS，可含显式路径，但不能有查询串、fragment 或凭据。Node 内网测试需要在 `bluesky`、每个 Fediverse instance 或 Nostr relay 条目上显式配置 `allow_private:true`；生产 Cloudflare 预检拒绝。所有请求禁止重定向；帖子中的链接、relay 提示、媒体只存为数据，不触发额外请求。允许列表是管理员信任边界，不是 DNS 固定或网络沙箱，生产应配合 egress 管理。

本机开发配置放 `.local/plugins.env` 的 `PLUGIN_CONFIG` map，保留已有 rsshub/feed 项，执行 `dev.py up`，并重启使用同一配置的独立 collector。不要提交秘密。未配置的插件仍有描述，界面显示未配置且不可新增。

## 订阅设置

共同设置为名称、启停、默认每 15 分钟、最短 5 分钟。同账户并发 2，沿用持久任务、租约/fencing、配置代际、停用/删除栅栏、事务去重和 outbox。

| 插件 | DSL 设置 | 范围 |
| --- | --- | --- |
| Bluesky | `mode=author/feed`、`target`、`include_replies`、`include_reposts`、`max_items`（1–100，默认 50） | 账号 target 为 handle/DID；自定义 Feed 为 `at://…/app.bsky.feed.generator/…`。默认包含回复、不包含转发 |
| Fediverse | `instance`、`mode=account/hashtag`、`target`、`include_replies`、`include_boosts`、`max_items`（1–40，默认 40） | Mastodon 兼容 API；账号填写 `name` 或 `name@domain`，话题不带 `#`。远程账号须已被实例发现，默认不包含转嘟 |
| Nostr | `relay`、`mode=author/hashtag`、`target`、`kind=notes/articles`、`max_items`（1–100，默认 50） | 作者 target 为 npub 或 64 位 hex 公钥；话题不带 `#`，按 NIP-01 `#t` 原文匹配；kind 1 短帖 / 30023 长文 |

所有字段、实例/relay 选项、固定表格列与 collect/validate 动作均通过已有有限 DSL 下发，不增加脚本或专用页面。`validate` 只验证配置/授权，不代表真实采集成功。HTTP 输入示例：

```json
{"plugin":"bluesky","config_version":1,"name":"Bluesky 官方","configuration":{"mode":"author","target":"bsky.app"},"interval_seconds":900}
```

```json
{"plugin":"fediverse","config_version":1,"name":"文化话题","configuration":{"instance":"https://mastodon.social","mode":"hashtag","target":"culture"},"interval_seconds":900}
```

```json
{"plugin":"nostr","config_version":1,"name":"Nostr 话题","configuration":{"relay":"wss://nos.lol/","mode":"hashtag","target":"nostr","kind":"notes"},"interval_seconds":900}
```

创建带 Idempotency-Key 的 `POST /v1/sources` 后，sync/actions、receipts、items/raw-items 继续使用现有账户 API。

## 内容与失败语义

- Bluesky 使用 `getAuthorFeed`/`getFeed`，post URI 为稳定 ID；保存文本、作者、声明语言、发布时间、图片/视频/外链引用，不把点赞/转发数变化当内容修订。AT DID/Feed 参数只作为固定 AppView 请求参数，不解析任意 DID 服务地址。
- Fediverse 使用固定实例的 accounts/lookup、accounts/:id/statuses 或 timelines/tag；不自动访问返回的远程账号 URL。仅保留 visibility=public，明确排除私密和 unlisted；status URI 为 ID，保留未信任 HTML、CW（标题）、语言、发布时间、编辑时间与媒体。Mastodon API 兼容不等于支持全部 ActivityPub 实现，也不包含私人时间线。
- Nostr 查询到 EOSE 后关闭；逐条重新计算 NIP-01 ID，并以 BIP-340 Schnorr 验证 pubkey/signature，复核作者/话题/kind 和未来时间。无效事件为 partial，不能伪装成空 feed。kind 1 以事件 ID 去重；kind 30023 使用 kind/pubkey/d 地址建立修订，同一窗口优先取最新有效版本（同时间取较小事件 ID）。长文 `published_at` 缺失保留 null，事件 created_at 是修订时间；正文以原始文本保存，不解释为可执行 Markdown。不会补抓作者 profile 或附件。
- 三者轮询最新窗口，不把上游分页 cursor 持续向过去翻；不保证停机不漏项、完整回填或传播删除/撤回。长文 revision 是观测到的有效内容版本，不是全网最终版本仲裁；不同 relay 的观察和返回窗口可能不同。
- 全程 30 秒，HTTP 响应/relay 累计消息最多 4 MiB，单条入库最多 256 KiB，最多 100 条（Mastodon 上限 40）。Nostr 最多 1,000 帧，返回超过所请求条数明确失败；Node 帧上限 512 KiB，Worker 帧由运行时接收后再限额。
- HTTP/upgrade 的 401/403/重定向阻塞来源等待修正或手动重试；429/5xx 遵守 Retry-After，网络/超时/EOSE 前断开走 host 持久退避。Nostr CLOSED 的 auth-required/restricted/blocked 明确阻塞，rate-limited 可重试。原始错误消息、token、响应正文不进入日志或 receipt。

## 验证

`tests/unit/social.test.ts` 覆盖配置、参数、字段映射、缺日期、partial、签名/哈希/过滤/长文修订；`nostr-relay.test.ts` 使用真实本地 WebSocket 验证协议关闭、限额、取消与握手限流。`tests/integration/social-runtime.test.ts` 在 Apple Container 的真实 PostgreSQL 与 workerd/SQLite DO/Queues 上运行同套入库、重复、修订、partial、鉴权、重定向和跨账户负例。Swift 从共享 `plugin-settings.json` 验证三种插件的有限控件与选项。

真实公开源验证（会在专用测试库/临时 DO 建立并清理测试账户；不修改已有订阅）：

```sh
rtk proxy python3 scripts/dev.py exec npm run build
rtk proxy python3 scripts/dev.py exec npx wrangler deploy --dry-run --env= --outdir .wrangler/test-build
rtk proxy python3 scripts/dev.py exec node --import tsx tests/live/social.ts ../.agents/validation/2026-10-17/social-collectors/live.json
```

与其他使用同一测试数据库的后台 worker 测试串行运行，避免不同运营配置的 worker 竞争任务。本地 workerd CA 补充方式见 [Feed 指南](feed.md)；不关闭 TLS 验证。真实数据持续变化，第二次可能正常新增；报告分别保留新增与重复数。

协议参考（2026-10-17 核对）：[Bluesky API](https://endpoints.bsky.app/)、[Mastodon accounts](https://docs.joinmastodon.org/methods/accounts/)、[Mastodon timelines](https://docs.joinmastodon.org/methods/timelines/)、[NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)、[NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md)、[NIP-23](https://github.com/nostr-protocol/nips/blob/master/23.md)。
