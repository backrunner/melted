# 偏好整理、可选凭据与原生界面验收

日期：2026-10-19。工作目录 `/Volumes/BRData/projects/melted`。以下保留阶段验收时的构建与测试事实；当时尚未提交、推送或发布。后续整体审查及分批提交见[复核记录](../review-and-push/README.md)。

## 实现与权限

- 服务端保存显式原文，生成可读整理规则，确认后启用；已有与新增文本进入分类、多标签、包含/排除、内容生成和材料忠实性检查。引用/数字/支持性失败不发布，filtered/held 保留原文。
- Node/PostgreSQL 与 workerd/SQLite DO 共用执行器，分别使用 worker、DO Alarm/outbox/Queues。任务固定偏好/原文/来源/模型配置版本，租约 fencing、检查点、并发和每日预留预算限制重复处理。删除来源清理派生正文和阶段缓存；偏好变更及原文修订撤下旧结果。
- 运营者选择 operator/byok/shared。operator 不下发凭据表单；byok 按账户独立；shared 仅 allowlist 管理员获得表单且每次 API 重验权限。无完整 BYOK 密钥不使用共享 fallback。客户端不能改变 provider endpoint 或自行提权。
- secret 表单与普通偏好分开，缺省保留/null 清除/string 替换，版本和幂等重试可追踪。AES-256-GCM 密文、随机 IV、按 server/scope/version 的 AAD，HKDF 分离 AES/HMAC 密钥；密钥不回显，不进入普通设置历史/模型阶段产物/日志。
- 共享凭据与账户内容跨 DO，不能声称原子撤销；每阶段和发布前检查，新的鉴权读取前撤下过期结果。已发出的请求无法保证撤回或不计费。
- 单个账户凭据无法解密时隔离其任务，避免阻塞其他账户；实际 Node runtime 有对应回归场景。

协议和运维见 [处理文档](../../../../server/docs/processing.md)及 [设置 DSL](../../../../server/docs/settings.md)。PG 004/005/006、共享 JSON Schema/OpenAPI/Swift fixtures 已同步。

## 自动检查

所有 Node、PostgreSQL、workerd 测试经 Apple Container。Swift 原生执行。

| 检查 | 结果 |
| --- | --- |
| TypeScript `npm run check`、构建 | 通过 |
| 完整 `npm test` | 67 单测、75 集成测试通过，见 [日志](server-tests.log) |
| 最终处理模块定向回归 | 28 项通过，见 [日志](processing-tests.log)；含两后端权限、加密、撤销、三个模式的实际 worker/Queue 路径 |
| macOS Swift 测试 | 28 项通过，见 [日志](macos-tests.log) |
| MeltedKit Swift 测试 | 34 项 Core 测试（公共 WebP 网络测试跳过）、4 项设计系统测试通过 |
| Worker 插件预检和 dry run | 6 个插件预检通过、实际 Worker 打包通过；不是云端部署 |
| Prettier、Git diff whitespace、共享契约 | 通过 |
| 设计静态检查 | 文档链接/JSON/34 对颜色/token 对照通过；不等于原生完整辅助功能矩阵 |

测试包含账户隔离、普通用户直接调用管理员端点、权限撤销、幂等重放/冲突、密文错 scope/master、换钥、旧指纹、引用/数字/支持性拒绝、原文修订、来源删除、租约 fencing、重复领取、预算耗尽和成功阶段复用。三个凭据模式都使用实际 Node worker 与 workerd Alarm/Queue 执行。

过程中修复了 Worker 原生 fetch 的接收者问题；交互验收服务与测试共用 public schema 的干扰改为独立 `melted_processing_preview` schema；Node 模式测试子进程补齐与 API 一致的 server_id，并增加坏账户凭据不阻塞其他账户的回归。最终通过记录不把这些早期失败计作通过。

## 原生界面与产物

macOS 27.0.1 (26A434)，Melted 0.2.0 (13)，Bundle ID `com.alkinum.melted`，原生构建并签名。只绑定 `build/Melted.app` 的绝对路径，不用同名旧 App 作为证据。

偏好页现在只含四项自然语言输入，短输入单行，内容增长时扩展；移除重复帮助段落，固定底栏保留状态和下一步。生成结果在独立“整理规则”页检查确认；统计/失败重试留在规则详情。已启用时主页面只保留简短状态与查看入口。

- [偏好页深色](preferences-dark.png)、[浅色](preferences-light.png)：四项输入完整显示，不再叠加规则与统计
- [规则页深色](rules-dark.png)、[浅色](rules-light.png)：固定标签列、统一行距、输出要求明确命名
- [凭据重新打开后](byok-saved-dark.png)：SecureField 为空，仅显示“已配置，密钥不回显”
- [实际阅读结果](generated-reading-light.png)：文化分类、新加坡标签、原文引用、尚未确认的限定词及单一来源状态

上述交互覆盖了输入/保存密钥、重新打开不回显、编辑/保存偏好、生成规则、检查/确认启用、后台发布与阅读，包含深浅色。使用独立本机合成模型服务器，不包含真实个人资料或真实模型凭据。

上述交互与视觉截图的 App executable SHA-256 为 `1d258ff26a1d6ecce50c46f44ede537e8b60a52729a4e0113ce23376cdcbdc15`。之后增加了关闭偏好页刷新目录以接收其他设备换钥后的新 DSL；不改变可见布局。

最终构建 executable SHA-256 为 `a1e662466a5bd3b090bb39f5f4a1fa7bce70e6602deaa2f795f84e6c2c269e75`。已从此确切产物重新启动并检查原开发服务器，见 [最终原服务器偏好页](local-default-dark.png)：原账户 7 条内容保留、凭据客户端配置关闭时没有该入口、偏好 placeholder 完整显示。原开发服务已执行迁移并更新本地构建；隔离合成服务器已停止，原 App 连接、账户与外观已恢复。

## 证据边界

`synthetic-generator` / `synthetic-jev` 响应明确来自测试夹具，证明 HTTP 协议、持久化、后台调度、凭据选择、保护和原生操作链路；不是 DeepSeek/Jev 的真实语义、阈值、延迟或费用验收。最终定向测试增加了 summary-first 结构夹具及生成提示中 list summary/reader body 的区别；阅读截图是先前已生成并保留的单段原文样本。

没有使用真实模型密钥或把实际用户材料发给外部模型。真实语义质量仍需实际凭据和授权跨领域样本。没有外部检索佐证、多模态、聚类、学习、历史 diff/回滚、完整 state 同步、iOS/实体设备或完整 VoiceOver/字号矩阵结论。当前输出是客户端阅读正文，未实现外部渠道生成/交付。
