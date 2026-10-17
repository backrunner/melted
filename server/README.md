# Melted 服务端

TypeScript + Hono，同一 HTTP 契约运行于 Node.js 24 / PostgreSQL 17 与 Cloudflare Workers / SQLite Durable Objects。通用信息模型和公开 API 保持一致，两种存储分别实现 SQL、事务及恢复语义。

## 工程目录

```text
server/
├── src/
│   ├── entrypoints/          # Node、Worker、管理 CLI、插件预检的启动与组装
│   ├── http/
│   │   ├── app.ts           # 路由组装，保留中间件与鉴权注册顺序
│   │   ├── context.ts       # Hono bindings 与请求变量类型
│   │   ├── middleware.ts    # 请求 ID、响应头、体积限制及错误映射
│   │   └── routes/          # discovery、auth、content、sync、sources
│   ├── modules/
│   │   ├── identity/        # 身份/会话契约、浏览器登录与 OIDC 适配
│   │   ├── content/         # 内容 schema、筛选、fixture 校验与存储接口
│   │   ├── sync/            # 变化日志契约
│   │   ├── sources/         # 来源、任务、原始条目与代际规则
│   │   ├── collectors/      # 汇总已配置插件的处理目的地声明
│   │   ├── ingest/          # 通用结果校验、Feed 解析与存储 hash
│   │   ├── jobs/            # 共享采集执行规则
│   │   └── plugins/         # SDK 基类、注册表、DSL、设置/动作及部署能力检查
│   ├── plugins/             # 已安装实现与组合根；rsshub 拥有路由策略，feed 拥有直接订阅配置
│   ├── storage/
│   │   ├── repository.ts    # 组合领域接口及基础运维接口
│   │   ├── postgres/        # 连接/事务、迁移、认证、内容、查询、登录流程
│   │   └── cloudflare/      # RPC、账户/控制 DO、SQLite、认证、内容与查询
│   ├── config/              # 共享配置 schema 与 Node YAML 加载
│   └── shared/              # 错误、加密原语与 schema 解析
├── tests/
│   ├── unit/               # 内容契约、fixture 与插件兼容性
│   ├── integration/        # 两后端一致性、DO 持久性与 OIDC
│   ├── live/               # 显式执行的真实 RSSHub 验收
│   └── benchmarks/         # 开发环境阅读链路基线
├── migrations/             # PostgreSQL 增量 SQL；发行时复制进 dist/server/
├── scripts/                # 部署/开发辅助脚本
├── templates/collector/    # 可生成、参与类型检查与测试的采集插件 boilerplate
├── config.example.yaml     # Node 配置示例
├── wrangler.jsonc          # Worker 入口、bindings 与 DO migration
└── package.json
```

共享协议和 fixture 位于仓库根 [contracts](../contracts)，不在服务端复制一套。

## 依赖与拆分规则

- `entrypoints` 组装运行时，`http` 只做认证、解析、调用与响应；HTTP 不直接操作 SQL。
- `modules` 保存领域类型、接口与规则，可依赖 `config` / `shared`，不得导入具体存储实现或 HTTP 层。
- `storage` 实现领域接口。PostgreSQL 与 Cloudflare 互不导入；fixture 等通用校验放 `modules`，不能从一个后端借用。
- `shared` 不导入领域、HTTP、数据库或平台绑定。YAML/文件读取只在 Node 配置加载器中使用；Worker 只依赖共享配置 schema。
- 文件按职责拆分。新增领域放进对应 `modules`，SQL 和平台细节留在适配目录；不预建尚未实现的业务模块，不增加转发旧路径的兼容大文件。
- 保留事务边界：PG mutation、变化序号及幂等响应同事务提交；SQLite DO 只在同步事务中写入，crypto 与外部 IO 在事务外准备。过期清理由运行时维护任务或 DO alarm 负责。
- 移动代码必须同步启动命令、Wrangler、容器、资源相对路径及测试。类型检查拒绝未使用的导入与参数。

## 本机开发与验证

本机 Node、PostgreSQL、workerd 全部通过 Apple Container 运行。以下命令从仓库根执行；环境要求 RTK 时加 `rtk proxy` 前缀：

```sh
python3 scripts/dev.py setup
python3 scripts/dev.py check
python3 scripts/dev.py exec npm run build
```

`check` 执行类型与格式检查、Worker 测试打包、单元/集成测试及插件/Worker 预检。集成测试要求独立的 `MELTED_TEST_DATABASE_URL`，开发脚本设置测试库，不使用开发库代替。DO 测试在隔离 workerd 中运行。

容器内可单独运行：

| 命令 | 用途 |
| --- | --- |
| `npm run check` | TypeScript 严格检查 |
| `npm run format:check` | 格式检查 |
| `npm test` | 测试 Worker 打包，再运行全部单元和集成测试 |
| `npm run test:unit` | 单元测试 |
| `npm run test:integration` | 集成测试；先由 `npm test` 生成测试 Worker bundle |
| `npm run build` | 编译源码/共享 JSON 并复制 SQL 迁移 |
| `npm run dev` / `npm start` | Node 源码开发入口 / 编译入口 |
| `npm run migrate` | 源码 CLI 执行迁移 |
| `npm run cli -- bind-key ACCOUNT_ID PUBLIC_KEY` | 绑定已核对的公钥 |
| `npm run cli -- import-demo ACCOUNT_ID FILE` | 开发用途：向指定账户导入 fixture 内容 |
| `npm run worker:check` | 插件预检及 Worker dry-run |
| `npm run worker` / `npm run worker:start` | 独立 Node 采集进程，源码 / 编译入口 |
| `npm run plugins:new -- culture-notes` | 生成基于 BaseCollectorPlugin 的插件源码与测试 |

编译后的入口为 `dist/server/src/entrypoints/node.js`、`dist/server/src/entrypoints/cli.js`；迁移目录为 `dist/server/migrations/`。Worker 的 Durable Object 导出名称保持 `AccountStore` / `ControlStore`，移动源码不创建新的 DO namespace。

Node 可仅通过环境变量启动。可选 YAML 按 `CONFIG_PATH`、`config.local.yaml`、`config.yaml` 读取；显式 `CONFIG_PATH` 不存在时直接报错，未指定时本机文件优先。显式环境变量覆盖 YAML 默认值，使 Compose 与 Apple Container 不依赖本机配置。配置包含凭据，应保存在本机且不提交。管理 CLI 使用环境变量连接数据库；Workers 使用 bindings。配置加载和部署操作详见 [迁移与部署](../.agents/15-typescript-transition.md) 和 [部署入口](../deploy/README.md)。

已实现内置 `rsshub` 的 `collector.poll`、来源与原始条目接口、PG 持久任务及 DO Alarms/outbox/Queues。RSSHub 与 boilerplate 使用同一 SDK 基类；新增受信任编译模块见 [插件开发指南](docs/plugin-development.md)，客户端设置接入见 [插件与 DSL](docs/plugins.md)。注册表与部署预检限制为同一已知版本，动态下载和任意代码执行未开放。配置、限制与真实验收见 [RSSHub 采集](docs/rsshub.md)。

独立 `feed` 插件直接采集 RSS 2.0、Atom 1.0 和 JSON Feed，设置通过同一 DSL 渲染；见 [Feed 指南](docs/feed.md)。

认证方式、预置账户与凭据生成见 [authentication.md](docs/authentication.md)。
