# TypeScript 服务端与统一搜索迁移

首次迁移：2026-10-15；现状同步：2026-10-17。当前用户指令取代此前 Go、独立下拉筛选与不使用分类胶囊的设计选择。本文件在实施期间记录范围；运行结果另写验收记录。

## 迁移范围与后续修订

- 完成阅读详情与 Markdown 精修；去掉空态末尾句号；分类采用轻量胶囊。
- 隐藏可见窗口标题“资讯”，保留全部/未读/收藏；搜索和分类/标签/关注合并成 Spotlight 式面板，设置位于右侧。
- TypeScript + Hono 共享应用，Node.js 24 LTS 与 Cloudflare Workers 独立入口。自托管使用 PostgreSQL，Cloudflare 使用 SQLite Durable Objects，无外部数据库依赖。
- 迁移初期以 P-256 挑战登录为入口；随后 ADR-017 改为服务器协商 methods/preferred，可用密码、API Key、浏览器或身份密钥。仅在启用 key 时使用按 origin/server_id 隔离的可同步 Keychain，短期会话留在设备；不假定所有服务器都有同一默认方式。
- 保留现有所有权、分页快照、幂等、refresh 轮换、changes 提交顺序；旧数据库先备份，再通过增量 SQL 迁移。
- Node Dockerfile/Compose、自托管运行文档、Workers 配置与插件预检；本机服务、数据库和 Workers 模拟器均通过 Apple Container 运行。

当前 UI 以 [11 v1.0](11-ui-design-system.md)为准：品牌移到连接表单标题上方，工作台无品牌，连接仅短淡化，文末字段/来源与三组设置替代早期原型。搜索面板组件存在但主窗口未挂载，见 [当前复核](13-design-review.md)。本文件的部署迁移不代表 UI 全项验收。

## 框架与平台边界

[Hono 官方基准](https://hono.dev/docs/concepts/benchmarks)及[路由实现](https://hono.dev/docs/concepts/routers)支持选择低开销的跨运行时路由。框架自身的路由微基准不能证明带 TLS、鉴权和数据库的整体吞吐是 Node 生态绝对最快。选型以同一 TypeScript 业务逻辑在 Node/Workers 运行、低路由开销和可维护性为约束；实际性能单独测量，不宣传无依据的“全生态最快”。Node 使用[官方适配器](https://hono.dev/docs/getting-started/nodejs)。

Cloudflare 采用官方推荐的 [SQLite Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)。AccountStore 按账户隔离正文、词表、会话、变化序号、幂等记录和查询快照；ControlStore 保存限流窗口和短期浏览器流程。`transactionSync` 内禁止网络/异步操作。状态写入、幂等响应、变化序号在同一事务提交；refresh 重放的撤销先提交再返回 401。Cloudflare 不配置 Hyperdrive，也不依赖外部 PostgreSQL。

SQLite DO 单行受平台上限约束，快照按独立文档行保存而不是一个大 JSON；当前每查询最多 2,000 条、8 MiB、TTL 5 分钟，每账户最多 8 个快照。权限/隐藏状态在翻页时再次校验。PG 与 DO 共用 fixture 和 API 集成测试，不共享 SQL 语句。Cloudflare 的浏览器授权码消费与账户会话创建跨两个 DO，失败时须重启登录；不会恢复已消费的授权码以换取重放风险。

| 能力 | 自托管 | Cloudflare | 本轮状态 |
| --- | --- | --- | --- |
| HTTP / 鉴权 / 内容 | Node 24 + Hono | Workers + Hono | 已实现 |
| 账户事务存储 | PostgreSQL | SQLite AccountStore | 已实现 |
| 限流 / 浏览器流程 | PostgreSQL 表 | ControlStore + Alarms | 已实现 |
| 附件 | 持久卷 / S3 接口 | R2 | 后续接入，当前无上传接口 |
| 后台采集任务 / 死信 | 独立 worker + PG 持久任务 | Queues + DO 状态/outbox | RSSHub 已接入；通用 AI 管线后续 |
| 定时 / 长流程 | worker 内调度循环 | AccountStore Alarms | RSSHub 定时/恢复已接入，并整合过期清理；长流程后续 |
| 可选向量 / 模型 | pgvector / provider | Vectorize / Workers AI 或授权 provider | 后续评估 |

Cloudflare 是完整独立部署目标；不会要求用户额外购买数据库、Redis、S3 或 VPS。外部来源、可选 OIDC/AI provider 属业务连接，密码、API Key、密钥登录与阅读不依赖它们；方法由服务器声明，详见 [认证配置](../server/docs/authentication.md)。

服务器启用密钥登录时，凭据证明私钥持有权，不能证明 Apple 身份。[可同步 Keychain](https://developer.apple.com/documentation/security/ksecattrsynchronizable)随用户已启用的 iCloud Keychain 同步；普通客户端无法读取 Apple 账号作为服务器身份凭证。真实 Apple 身份须配置 Sign in with Apple / 对应 OIDC。不同服务器使用不同密钥，不能跨服务器关联。正式签名、共享 access group 和实体设备上的同步必须另验收；当前本机采用 Apple Development 签名，仍不等于 iCloud 同步已验证；固定 Bundle ID 为 com.alkinum.melted。

浏览器登录由 [ASWebAuthenticationSession](https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession) 发起；固定回调、state、nonce、PKCE、一次性短期授权码和 issuer/audience 验证缺一不可。身份关联使用 issuer + subject，不根据相同邮箱自动合并账户。未配置提供方时不显示可用的浏览器登录。

插件兼容性检查是部署能力检查，不是任意代码安全证明。Node 的本地进程、文件系统、原生扩展与常驻任务不能直接进入 Workers；需要远程 HTTPS 插件或明确的 Workers 实现。部署命令先检查 manifest 和实际 Worker bundle，未知能力默认拒绝。当前仅执行内置 RSSHub `collector.poll`；第三方任意插件引擎尚未开放。配置与验证见 [采集指南](../server/docs/rsshub.md)。


## 部署

### Cloudflare

所有本机 Node/Workers 命令由 Apple Container 执行：先运行 `python3 scripts/dev.py setup`。编辑 `server/wrangler.jsonc` 顶层 vars 为稳定的 server ID、运营者、实际 HTTPS origin。保持两个 SQLite DO bindings 和迁移标签；后续改表使用明确的内部 schema 迁移，不能删除 namespace 代替迁移。

在容器内执行 `npm run worker:check` 做预检和 dry-run。需要实际发布时，以只对目标 Worker/DO 授权的 `CLOUDFLARE_API_TOKEN` 和账户 ID 注入容器环境，然后运行 `npm run worker:deploy`。不要提交 token，不打开记录完整 OAuth 回调 URL 的访问日志。首次 workers.dev 地址与 PUBLIC_ORIGIN 必须一致；自定义域名在 Cloudflare 控制台配置。仓库没有代替用户实际发布公网服务。

可选 OIDC 使用 `OIDC_ISSUER`、`OIDC_CLIENT_ID`，秘密通过 `wrangler secret put OIDC_CLIENT_SECRET` 存入 Workers Secrets。提供方登记回调为 `https://你的域名/v1/auth/browser/callback`。需要支持 authorization code、S256、openid、RS256/ES256/PS256 之一；带 client secret 时当前发送方式为 client_secret_post。未配置提供方不显示浏览器登录。Sign in with Apple 还需 Apple 开发者配置及短期 client secret 管理，不能把一般 OIDC 预支持称为 Apple 登录已开通。

本地模拟：`python3 scripts/dev.py worker`，地址 `http://127.0.0.1:8787`，实际 workerd 跑在 melted-tools 容器；SQLite 状态位于 `server/.wrangler/local`。本地环境只用于测试，`worker:deploy` 固定顶层正式配置，不发布 local 环境。生产数据通过 Cloudflare DO 的 PITR/导出策略管理；跨后端自动迁移尚未提供。

### Docker / PostgreSQL

复制根目录 `.env.example` 为 `.env`，生成 URL-safe 随机数据库密码，设置稳定 server ID、PUBLIC_ORIGIN。执行 `docker compose up --build -d`；migrate 服务成功后才启动 API 和独立 collector。数据库不发布端口，API 默认映射主机 loopback 8421；公网通过 HTTPS 反向代理。镜像以 node 用户运行；不在镜像里保存密码。现有安装升级先 pg_dump，迁移使用同一事务与 advisory lock，重复执行安全；失败回滚，不自动降级 schema。

旧 Go 数据库的 001 schema 保留，002 使邮箱/密码可空并增加密钥/OIDC 表。003 新增 sources、任务、原始条目、revision 和幂等表；DO 在账户首次访问时事务增量建表。已有账户和内容保留；旧会话在未过期/撤销时继续有效。管理员可通过 `node dist/server/src/entrypoints/cli.js bind-key ACCOUNT_ID PUBLIC_KEY` 将已经核对的公钥绑定旧账户，避免创建新身份后误以为旧内容丢失。禁止按邮箱自动合并。旧 SQL dump 和源码归档只放 `.local`，不进入镜像。

### 本机调试

`python3 scripts/dev.py up` 启动 Apple Container 内的 PostgreSQL 和 Node API；`worker` 启动 workerd；`check` 执行两后端测试（测试自行启动隔离 workerd）；`down` 仅停止本项目容器，不删除卷。Swift 仍原生构建。`.local/node.env`、数据库环境文件均 0600；主机不运行 Node/Go/PG 服务。初次构建需要从官方镜像仓库下载 Node/PG 与 Apple builder。
