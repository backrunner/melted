# 全部待提交改动与 ACP 复审

2026-10-18，基线 `e97707f`，工作分支 `main`。范围包括所有待提交的阅读渐隐、列表底栏偏好、设计文档与历史截图，以及上一轮 DeepSeek Harness 插件的执行和恢复边界。

## 发现与修复

- ACP 的结束响应与无效帧在同一次读取中到达时，已经 resolve 的请求可能掩盖后续协议错误。现在 turn 返回前检查协议失败和取消；子进程 fixture 覆盖结束响应后紧随无效帧。
- 取消后，证据缓存、选择与结果构造原先没有统一拒绝；现在这些入口检查取消，结果在工具队列结束及临时目录清理后、账本提交前再次检查。已取消结果不得提交为成功。
- 网关两个执行槽占满时，容量检查原先会阻止已完成任务的持久化重放。现在先查询原结果再检查新任务容量；回归测试占满两个槽，确认旧结果仍返回、新请求仍收到 429，且不额外调用 runner。
- 阅读区直接复用 `MeltedScrollView`，删除重复的坐标空间、几何状态与渐隐布局；列表的固定分组标题保留逐行遮罩。底栏开关继续使用设备端 AppStorage，默认开启，关闭移除整条底栏。
- `.commandcode/` 是本机工具生成的权限配置，保留本地并加入忽略规则。产品代码、文档和已有脱敏原生截图全部纳入提交。

## 验证

服务端进程全部在 Apple Container 内执行；Swift 使用本机工具链。

| 检查 | 结果 |
| --- | --- |
| TypeScript `check` / Prettier `format:check` | 通过；新测试使用项目当前 lib 支持的 Promise 写法 |
| 单元测试 | 60 项通过，含新增并发重放与取消回归 |
| 集成测试 | 49 项通过；Node/PostgreSQL、真实 workerd/SQLite DO、Queue/Alarm、迁移重放、回滚、账户与 generation 隔离 |
| ACP 修复后的定向集成 | Node 与 Worker 两项通过 |
| `test:acp` | 真实固定 DSH 0.2.0-rc.2、ACP stdio 与 MCP HTTP 通过；模型是合成 Messages 响应 |
| Node build / 两目标插件预检 / Worker dry-run | 通过；6 个已注册插件 |
| Swift 测试 | MeltedCore 21 + DesignSystem 4 + macOS 21，共 46 项通过 |
| macOS 构建与开发签名 | 通过；Bundle ID `com.alkinum.melted`，0.2.0 (13)，arm64 |
| 设计/token/品牌/App 图标生成检查 | 通过 |
| Python 脚本测试 | 6 项通过 |

当前 `build/Melted.app/Contents/MacOS/Melted` SHA-256：`4ec9ababe381637f129e2d4fd8c82548a02158a5cab291ecd7430afc5372ba3b`。

## 原生验证与外部限制

- 10 月 17 日的[底栏验证](../../2026-10-17/optional-list-footer/README.md)与[阅读渐隐验证](../../2026-10-17/reading-scroll-fade/README.md)包含真实窗口、亮暗、字号和对应构建身份；这些是历史证据。
- 本次重新构建后，CUA 报告 Mac 已锁屏且不能自动解锁。已请用户解锁，但尚未收到回复，因此没有执行新构建的实际窗口操作，不把历史截图或编译结果称为当前 UI 运行通过。
- 未提供真实 DeepSeek 模型凭据；真实模型与真实网页联合采集质量、tokens/费用仍未验收。合成模型只证明受限工具和协议闭环。
- 本次未运行公网部署、Docker/Compose 镜像验收、VoiceOver、macOS 14 或 iOS；没有远端 CI 工作流，不宣称远端 CI 通过。
