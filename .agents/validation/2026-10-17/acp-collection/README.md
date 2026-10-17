# DeepSeek Harness ACP 采集验收

日期：2026-10-17；基线 `6c82f70`。新增独立 `deepseek-harness` collector、Node ACP 网关、工具证据选择、执行账本与原生 DSL。配置见 [Agent 指南](../../../../server/docs/agent-collection.md)。

## 实现范围

- Node 与 Worker 仅以 HTTPS/明确授权的开发容器地址调用网关；不在 Worker 中启动进程。原账户来源/receipt/任务/原始入库复用，无新主数据库迁移。
- 固定 DSH `0.2.0-rc.2`，独立 lock。每次生成最小 profile，只挂载 Agent kernel、ACP、模型和两个 run-scoped MCP 工具；不使用日常 DSH home。自由文本/思考不入库。
- 实际抓取证据的 stable IDs 由工具登记，模型只选 IDs；原文、缺日期、来源 URL、去重/revision 和 partial 由代码处理。
- execution ID 由 owner/receipt/generation hash 派生。网关 SQLite 先登记后执行，相同 ID 复用、不同输入拒绝、崩溃未知状态不再次调用模型。配置目的地、权限拒绝、请求/输出限额和费用边界在指南中逐项记录。

## 已执行

所有 Node、PostgreSQL、workerd 和 DSH 进程都在 Apple Container 中运行。

| 检查 | 结果 |
| --- | --- |
| `npm run check` / `format:check` | 通过 |
| `npm test` | 58 单元 + 49 集成通过；真实 PG 与 workerd / SQLite DO / Queues / Alarms |
| `npm run test:acp` | 1 项通过；真实 DSH `0.2.0-rc.2`、真实 ACP stdio/MCP HTTP、合成 Messages 模型 |
| Node build / Node 插件预检 / Worker 预检与 dry-run | 通过，6 个已注册 enabled 插件；未配置插件保持 unavailable |
| 固定 Harness lock `npm ci --prefix agent-runtime --ignore-scripts --dry-run` | 通过；本机已安装该固定版本 runtime |
| Swift MeltedCore | 21 项通过，含新增 Agent DSL 字段/profile/范围/确认动作测试 |
| Swift DesignSystem / macOS | 4 / 21 项通过；包含工作区已有 UI 改动 |
| 静态设计链接/JSON/颜色检查 | 通过；不是原生 UI 或 AI 质量证明 |

真实 Harness 的合成模型测试执行 3 次 Messages 请求：先调用 `collect_url`、再调用 `submit_collection`、最后结束 turn。模型每一步只看到这两个工具；返回 1 条工具抓取的原始公告。测试不访问真实 DeepSeek 模型，不消耗真实模型额度，不把这个结果当成真实来源/模型质量验收。

双后端新增契约覆盖原始入库、重复、修订、partial、跨账户读取拒绝、停用期间迟到结果拒绝。单元/子进程验证覆盖实际 ACP framing、权限请求拒绝、未完成 turn、无效协议、虚构 evidence ID、取消、重启后结果复用、未知执行拒绝、每日预算、origin/重定向/超大响应与 token 不外泄。既有主库回滚、删除栅栏、队列恢复与迁移重放随完整测试运行。

第一次 Worker 测试暴露了将原生 fetch 作为对象方法调用的问题，改为独立函数调用后双后端重跑通过。新增 opaque execution context 同步了 SDK 的显式能力面测试，没有移除原账户隔离断言。

## 未验证与交付边界

- 未收到可用 Harness/DeepSeek 模型凭据或配置路径，未执行真实模型 + 真实网页联合采集；召回、筛选质量、实际 tokens/成本与长时间运行尚待验收。
- 本次没有修改生产 Swift View；DSL 使用已有 select/text/integer/list/confirmation。验证了新共享 fixture 与原生编译测试，未重新截取这组配置表单的亮暗/200%/VoiceOver 画面。
- Dockerfile/Compose 入口已提供，未执行镜像构建、部署或公网发布；固定 runtime 在 Apple Container 已实际运行，不能替代镜像运行证明。
- 没有持久修改本机插件秘密配置或为现有账户创建 Agent 来源。临时测试账户/数据目录已清理。
- 源码中的其他阅读滚动、底栏 UI 和设计文档改动不属于本次交付。无远端 CI 工作流，本地通过不称为远端 CI 通过。
- 原始数据入库后尚不自动进入聚类、核验或 AI 简报。网关结果缓存与模型数据保留、崩溃临时目录清理、DNS/IP 固定及金额预算限制以指南为准。
