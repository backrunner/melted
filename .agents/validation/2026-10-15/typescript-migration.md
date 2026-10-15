# TypeScript 双部署迁移验收

日期：2026-10-15，Apple Silicon / macOS 27.0.1，Apple Container 1.2.2。后端与数据库均在 Linux arm64 Apple Container 内；旧主机 Go API 与 PostgreSQL 已停止。Node 24.21.0、PostgreSQL 17.11、Hono 4.13.13、Wrangler 4.151.0，锁文件记录精确依赖。

## 已执行

- TypeScript strict check、构建、Prettier 检查；Worker 实际 bundle / dry-run，包约 918 KiB，gzip 157 KiB。
- 15 项服务端测试通过，包含两个后端同一套 HTTP 用例：P-256 签名、挑战重放、稳定身份/独立账户、未登录拒绝、内容/词表/changes 隔离、跨账户/跨查询 cursor 拒绝、中文与字面百分号搜索、组合过滤、非法参数、状态幂等/不同 payload 冲突、并发版本冲突、快照隐藏检查、变化序号、refresh 轮换/复用撤销、退出撤销。
- 真实 workerd / SQLite DO 测试（非存储 mock）：进程重建后授权码与身份保留、错误 PKCE 不消费正确代码、一次性代码拒绝重放、会话撤销重启后仍有效、关闭注册拒绝新身份但允许旧身份；过期挑战/分页拒绝；9 MB 文档集合触发容量错误。
- OIDC 由测试身份提供方签发 ES256 token，验证 state、nonce、issuer、audience、PKCE、流程/代码过期、代码复用、同一 subject 恢复与关闭注册。此项证明协议和本地控制流，不代表真实服务商已配置。
- 独立 JSON Schema 与 OpenAPI components 一致性、Swift 共用 fixture / 必需字段检查通过；修复迁移中独立 schema 的旧 discovery 定义残留。
- 插件预检拒绝 Cloudflare 不支持的进程/文件能力、未知字段/能力、缺失 bindings、非 HTTPS endpoint。当前执行引擎未实现，启用插件会阻止部署。
- 旧 PostgreSQL dump 已恢复至容器持久卷，001 + 002 迁移通过；并发/重复迁移通过。旧账户及 6 条样例保留，旧客户端会话曾连接新服务读取成功；默认新密钥是新身份，未自动合并旧账户。
- 根 Dockerfile 经 Apple Container builder 构建 Linux arm64 镜像，镜像内迁移运行成功；镜像以 node 用户启动 API，实际请求读写成功。Compose 配置已提供，但没有用 Docker Compose 引擎运行；amd64 镜像运行未验证。
- Swift 6 项共享测试通过，包含服务地址约束、契约、证据未知状态、安全链接、P-256 绑定服务器/挑战与 RFC PKCE 向量；macOS 构建成功。原生 UI/钥匙串限制见 [阅读验收](reader-refinement.md)。

## 性能记录

[node-baseline.json](node-baseline.json)：打包镜像实际 HTTP，PG 在另一个 Apple Container；6 条样例，16 并发，200 次请求，列表快照与详情各半，鉴权/限流均开启。634 请求/秒，P50 32.46 ms，P95 49.49 ms，0 错误。测试很短、数据很少、不含 TLS/AI/公网延迟；不是生产容量或不同框架的排名，更不能据此声称 Node 全生态最快。

## 边界

未发布 Cloudflare 公网 Worker，未配置真实 OIDC、Sign in with Apple、iCloud 跨设备同步或 APNs。R2/Queues/Workflows 等后续业务基础设施已有架构映射，当前没有附件/AI 任务 API，不宣称已完成这些链路。Cloudflare 和 PG 各自持久化，跨后端账户/数据自动迁移尚未实现。

后台任务、模型、采集器、偏好学习、插件执行、完整离线同步与账户恢复 UI 仍待实现。文档、检查脚本与 guard 已切换到当前 TypeScript/双部署规范；2026-10-14 的设计/验收材料保留历史上下文，不作为当前实现证据。
