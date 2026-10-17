# 实施记录与当前设计状态

更新：2026-10-17。当前开发版本 0.2.0（2），Bundle ID **com.alkinum.melted**；已交付基础鉴权/阅读链路，不代表完整 P0、M1 或可公证分发的 alpha 已完成。视觉规范以 [UI v1.1](11-ui-design-system.md)为准。

## 已有代码与能力

| 范围 | 当前实现 | 边界 |
| --- | --- | --- |
| 服务端 | TypeScript/Hono；Node 24/PostgreSQL、Workers/SQLite DO；发现、协商认证、会话轮换与账户隔离 | 采集、上传、持久任务和真实 AI 管线未接入 |
| 身份 | 服务器 methods/preferred；预置密码/API Key、P-256、配置后 OIDC；客户端原生表单与 Keychain | 密钥不证明 Apple 身份；账户恢复、设备/多服务器管理 UI 后续 |
| 内容 API | 词表、q/view/category/tag/subject 查询、中文子串、固定快照分页、详情、幂等状态与提交有序 changes | 不是 FTS/语义搜索；完整 v1 未冻结，无 facets/time UI |
| 契约与工程 | OpenAPI 3.1/JSON Schema/共享 fixture、迁移、CLI、Docker/Compose、Worker 配置与插件预检 | 插件执行引擎尚未实现；预检不证明沙箱 |
| 原生工作台 | 无侧栏与可见文字标题、亮暗 token、双栏/窄窗阅读、列表分页/空态、收藏与已读状态 | 全页面/最低系统/辅助功能矩阵未全覆盖 |
| 搜索组件 | SearchPalette、NativeSearchField、菜单/⌘F 状态、词表条件、组合查询模型 | **当前 WorkspaceView 未挂载 SearchPalette，入口不可记为完成** |
| 阅读 | 原生 Markdown、行内等宽代码、离线语法高亮/复制/长行横滚、必要证据警告、文末元信息与来源；100–200% 阅读缩放 | 不渲染 raw HTML、不加载远程图片；无语义反馈 UI |
| 连接设计 | 品牌放在表单标题上方；共享背景；220 ms 透明度切换，方法切换无布局插值 | 工作台和列表底栏无品牌；不把局部空态动效扩到连接按钮 |
| 设置 | 外观、账户、关于；完整 GPL 和第三方声明 sheet | 来源/偏好/关注/通知/反馈/导出删除页面后续 |
| 同步 | 12 秒轮询 changes 提示，upsert 刷新/到达高亮，手动刷新，内存保留已加载内容 | 无正文磁盘缓存、SSE、持久离线 mutation、完整 snapshot 重放；静默轮询失败待完善 |
| App 图标 | 正式品牌矢量生成 SVG/1024 PNG/多尺寸 ICNS，构建绑定 CFBundleIconFile | macOS 标准外观，非 iOS 图标或动态深色图标 |
| 开源材料 | [公开仓库](https://github.com/backrunner/melted)、GPL-3.0-or-later、贡献/安全/第三方声明、原生截图 README | 无 App Store 例外、无已发布公证二进制或生产服务 |

本机开发样例由服务端管理 CLI import-demo 导入，带 is_demo=true；App 无加载样例入口或种子端点。样例不是模型输出，不证明 AI 质量。全部本机 Node/PG/workerd 与服务端测试通过 Apple Container，Swift 原生构建。

## 里程碑状态

| 里程碑 | 当前状态 | 仍需完成 |
| --- | --- | --- |
| M0 | 部分完成；GPL/贡献已确定，公开仓库已建立 | 完整协议冻结、来源授权/质量语料、完整威胁模型 |
| M1 | 基础身份/读取/状态/迁移已运行 | 邀请/恢复、摄取/上传、持久队列/租约/fencing/outbox、预算/同意、完整备份恢复/导出 |
| M2 | 未实现真实处理闭环 | RSS/URL/push、插件运行、真实模型与多模态、核验/聚类、渠道 |
| M3 | 原生阅读链路部分运行 | 搜索呈现修复、状态/删除同步、持久缓存/重放、业务设置页、反馈、附件/静态 HTML、完整原生验收 |
| M4 | 未开始 | QueryPlan、主动获取/调度、学习、memory、回滚 |
| M5 | 开源材料与本地构建已有 | conformance、真实质量/安全/负载/持续使用、签名公证与 alpha 发布 |
| P1 iOS/APNs | 设计预留 | 独立实现、真实设备/后台/推送、发行许可与审核评估 |

## 当前设计差异与下一步

优先处理 [设计复核中的实现缺口](13-design-review.md)：搜索面板挂载、列表去冗余、分散 token、同步可见状态与完整应用。每项修复按当前构建做对应原生检查，不能把旧浏览器参考当通过。

业务上先补齐 M1 的有权限摄取、receipt、任务恢复、取消/删除代际、outbox、预算和处理目的地同意；再用授权 RSS/push 和可替换 provider 完成真实整理链路。随后扩展偏好/来源/关注/反馈与离线。无 provider 或语料时继续完成独立部分，明确质量缺口。

## 验证与运行入口

运行见 [项目 README](../README.md)、[macOS](../apps/macos/README.md)及 [部署](15-typescript-transition.md)。完整本地检查命令为 sh scripts/check.sh，实际执行结果按日期记录。

- [TypeScript 双部署，2026-10-15](validation/2026-10-15/typescript-migration.md)：迁移与两后端阅读/身份测试。
- [认证，2026-10-16](validation/2026-10-16/authentication.md)：服务器协商方式与特定原生登录操作。
- [品牌与切页，2026-10-16](validation/2026-10-16/brand-position.md)：位置/无主界面品牌/短淡化及当时构建。
- [仓库准备，2026-10-17](validation/2026-10-17/publication.md)：本地测试/最终构建、原生亮暗截图与长许可操作；该记录不覆盖全页面矩阵。
- [App 图标与代码，2026-10-17](validation/2026-10-17/code-and-icon.md)：资产/高亮/构建测试、原生亮暗预验收；解锁后补验最终启动、200% 与窄窗横滚，剩余范围单列。
- [设计文档同步，2026-10-17](validation/2026-10-17/design-documentation.md)：文档/资产一致性与源码核对，不是新的运行验收。
- [账户设置精简，2026-10-17](validation/2026-10-17/account-settings.md)：退出按钮统一次要样式及危险操作色，删除常驻说明，已核对新构建的亮暗设置窗口。

所有历史记录保留当时事实；最新源码状态与旧截图不同处以差异清单说明。没有 GitHub Actions 工作流，不把本地检查称为远端 CI；未验证 iCloud Keychain 实体设备同步、最低系统和完整 VoiceOver，不把 Apple Development 签名称为 Developer ID 公证发行。
