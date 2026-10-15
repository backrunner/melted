# 服务端目录重构验收

日期：2026-10-15（Asia/Singapore）。范围：服务端职责拆分、目录迁移、资源/运行入口调整及工程说明。

## 变更

- `server/src` 按 `entrypoints`、`http`、`modules`、`storage`、`config`、`shared` 分层；53 个 TypeScript 源码文件，最大文件 188 行。原 `cloudflare.ts` 为 810 行，原 `postgres.ts` 为 415 行。
- HTTP 按 discovery/auth/content/sync/development 拆路由，保留公开认证路由先于保护中间件的注册顺序。
- 两种存储均拆分认证、内容、分页查询、变化日志与浏览器登录存储；Cloudflare 的 AccountStore/ControlStore 名称、namespace、SQL 表和持久数据格式不变。
- `modules` 保存领域接口与通用校验，不导入具体 SQL/平台存储；Cloudflare 不再通过 PostgreSQL 文件取得 fixture 校验。
- 单元、集成与基准代码分别放 `tests/unit`、`tests/integration`、`tests/benchmarks`。默认测试仍覆盖全部原有场景。
- npm、Wrangler、Docker/Compose、Apple Container 开发脚本、编译后的入口及 SQL 迁移资源路径一起更新；TypeScript 启用未使用导入/参数检查。
- 文档：[服务端目录与约定](../../../server/README.md)、[架构](../../02-system-architecture.md)、[开发规范](../../12-development-standards.md)。

## 已执行

所有 Node/PostgreSQL/workerd 均在 Apple Container 内执行；Node 为 v24.21.0，PostgreSQL 使用项目独立测试库。

| 检查 | 结果 |
| --- | --- |
| 修改前 `npm run check` / `npm test` | 通过；15 项测试 |
| 修改后 `python3 scripts/dev.py check` | 类型、未使用代码、Prettier、测试及 Worker 预检全部通过 |
| 单元测试 | 2 项通过，契约/fixture 和插件能力检查 |
| 集成测试 | 13 项通过；PG/真实 workerd + SQLite DO、持久化重启、OIDC、所有权隔离、组合查询/游标、幂等/版本竞争和 refresh 重放撤销 |
| `npm run build` | 通过；生成新目录的 JavaScript、共享 JSON 与 SQL 迁移 |
| 编译后 CLI | `dist/server/src/entrypoints/cli.js migrate` 在独立测试库重复两次成功，验证迁移资源路径及重复执行 |
| 编译后 Node | 在工具容器 127.0.0.1:18421 临时运行；healthz 与 discovery 200，受保护 briefings 401，响应请求 ID/cache-control 正确，SIGTERM 正常退出 |
| SQL 与目录审查 | 对比改动前后 SQL 字面量（归一化 projection 变量改名）一致；本地 import 全部可解析；领域/基础工具及两个后端的依赖方向符合约定；发行 SQL 与源文件逐字节相同 |
| 设计文档静态检查 | 通过；26 Markdown、100 本地链接、5 JSON 示例 |

编译后启动使用临时配置和独立测试库，不修改现有服务配置；临时进程已停止，含连接信息的临时配置已删除。冒烟脚本保留于 `.local/server-structure-smoke.mjs`，重构前源码与生成物保留于 `.local/server-structure-before-20261015-032620/`。

## 验证边界

本次没有执行公网发布、Docker 镜像构建或 Swift 原生应用验收。Docker/Compose 更新了入口并复用了已验证的编译产物布局；不将本机编译产物验收描述为镜像/公网运行验证。公开 API、SQL 迁移内容及现有业务行为未有意更改。
