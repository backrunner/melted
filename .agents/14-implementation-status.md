# 实施记录与当前设计状态

更新：2026-10-17。当前开发版本 0.2.0（13），Bundle ID **com.alkinum.melted**；已交付基础鉴权/阅读链路，不代表完整 P0、M1 或可公证分发的 alpha 已完成。视觉规范以 [UI v1.1](11-ui-design-system.md)为准。

## 已有代码与能力

| 范围 | 当前实现 | 边界 |
| --- | --- | --- |
| 服务端 | TypeScript/Hono；Node 24/PostgreSQL、Workers/SQLite DO；发现、协商认证、会话轮换与账户隔离 | 上传与真实 AI 管线未接入 |
| 身份 | 服务器 methods/preferred；预置密码/API Key、P-256、配置后 OIDC；客户端原生表单与 Keychain | 密钥不证明 Apple 身份；账户恢复、设备/多服务器管理 UI 后续 |
| 内容 API | 词表、q/view/category/tag/subject 查询、中文子串、固定快照分页、详情、幂等状态与提交有序 changes | 不是 FTS/语义搜索；完整 v1 未冻结，无 facets/time UI |
| RSSHub 采集 | 来源 CRUD、异步 receipt、去重/修订原始入库；Node/PG worker 与 DO Alarms/outbox/Queues；固定镜像可选实例 | 公开源、当前窗口；无全文补抓/附件下载/AI 简报，客户端来源管理后续 |
| 契约与工程 | OpenAPI 3.1/JSON Schema/共享 fixture、增量迁移、CLI、Docker/Compose、Worker 与内置插件预检 | 第三方任意插件执行尚未开放；预检不证明沙箱 |
| 原生工作台 | 无侧栏与可见文字标题、亮暗 token、双栏/窄窗阅读、列表分页/空态、收藏与已读状态 | 全页面/最低系统/辅助功能矩阵未全覆盖 |
| 搜索 | SearchPalette 原生 sheet、NativeSearchField、菜单/⌘F、词表条件、组合查询、Esc 关闭及条件 chip 重开 | 时间/排序/facet 等扩展尚未实现 |
| 阅读 | 原生 Markdown、行内等宽代码、离线语法高亮/复制/长行横滚、必要证据警告、文末元信息与来源；100–200% 阅读缩放 | 不渲染 raw HTML、不加载远程图片；无语义反馈 UI |
| 连接设计 | 品牌放在表单标题上方；共享背景；220 ms 透明度切换，方法切换无布局插值 | 工作台品牌限于列表底栏左侧；不把局部空态动效扩到连接按钮 |
| 设置 | 外观、账户、关于；完整 GPL 和第三方声明 sheet | 来源/偏好/关注/通知/反馈/导出删除页面后续 |
| 同步 | 12 秒轮询 changes 提示，upsert 刷新/到达高亮，手动刷新，内存保留已加载内容 | 无正文磁盘缓存、SSE、持久离线 mutation、完整 snapshot 重放及远端 state/delete 应用；轮询失败已提示并保留水位重试 |
| App 图标 | 正式品牌矢量生成 SVG/1024 PNG/多尺寸 ICNS，构建绑定 CFBundleIconFile | macOS 标准外观，非 iOS 图标或动态深色图标 |
| 开源材料 | [公开仓库](https://github.com/backrunner/melted)、GPL-3.0-or-later、贡献/安全/第三方声明、原生截图 README | 无 App Store 例外、无已发布公证二进制或生产服务 |

本机开发样例由服务端管理 CLI import-demo 导入，带 is_demo=true；App 无加载样例入口或种子端点。样例不是模型输出，不证明 AI 质量。全部本机 Node/PG/workerd 与服务端测试通过 Apple Container，Swift 原生构建。

## 里程碑状态

| 里程碑 | 当前状态 | 仍需完成 |
| --- | --- | --- |
| M0 | 部分完成；GPL/贡献已确定，公开仓库已建立 | 完整协议冻结、来源授权/质量语料、完整威胁模型 |
| M1 | 基础身份/读取/状态/迁移，以及来源 receipt/持久队列/租约/fencing/outbox 已运行 | 邀请/恢复、通用摄取/上传、预算/同意、完整备份恢复/导出 |
| M2 | RSSHub 真实公开来源采集入库已运行，两后端各验证三类来源 | URL/push、第三方插件、真实模型与多模态、核验/聚类、渠道 |
| M3 | 原生阅读链路、搜索呈现与到达反馈已运行 | 状态/删除同步、持久缓存/重放、业务设置页、反馈、附件/静态 HTML、完整原生验收 |
| M4 | 未开始 | QueryPlan、主动获取/调度、学习、memory、回滚 |
| M5 | 开源材料与本地构建已有 | conformance、真实质量/安全/负载/持续使用、签名公证与 alpha 发布 |
| P1 iOS/APNs | 设计预留 | 独立实现、真实设备/后台/推送、发行许可与审核评估 |

## 当前设计差异与下一步

优先处理 [设计复核中的实现缺口](13-design-review.md)：列表去冗余、分散 token、远端状态/删除的完整应用与辅助设置矩阵。搜索面板挂载和同步失败提示已修复。每项修复按当前构建做对应原生检查，不能把旧浏览器参考当通过。

RSSHub 来源已完成 receipt、任务恢复、取消/删除代际及 outbox；后续补齐通用有权限摄取/上传、预算和处理目的地同意，再接入可替换 provider 完成真实整理链路。随后扩展偏好/来源/关注/反馈与离线。无 provider 或语料时继续完成独立部分，明确质量缺口。

## 验证与运行入口

RSSHub 实施及双后端真实来源/恢复测试见 [2026-10-17 采集验收](validation/2026-10-17/rsshub/README.md)与 [提交前复审](validation/2026-10-17/rsshub/review.md)。

运行见 [项目 README](../README.md)、[macOS](../apps/macos/README.md)及 [部署](15-typescript-transition.md)。完整本地检查命令为 sh scripts/check.sh，实际执行结果按日期记录。

- [TypeScript 双部署，2026-10-15](validation/2026-10-15/typescript-migration.md)：迁移与两后端阅读/身份测试。
- [认证，2026-10-16](validation/2026-10-16/authentication.md)：服务器协商方式与特定原生登录操作。
- [品牌与切页，2026-10-16](validation/2026-10-16/brand-position.md)：位置/无主界面品牌/短淡化及当时构建。
- [仓库准备，2026-10-17](validation/2026-10-17/publication.md)：本地测试/最终构建、原生亮暗截图与长许可操作；该记录不覆盖全页面矩阵。
- [App 图标与代码，2026-10-17](validation/2026-10-17/code-and-icon.md)：资产/高亮/构建测试、原生亮暗预验收；解锁后补验最终启动、200% 与窄窗横滚，剩余范围单列。
- [设计文档同步，2026-10-17](validation/2026-10-17/design-documentation.md)：文档/资产一致性与源码核对，不是新的运行验收。
- [账户设置精简，2026-10-17](validation/2026-10-17/account-settings.md)：退出按钮统一次要样式及危险操作色，删除常驻说明，已核对新构建的亮暗设置窗口。
- [关于设置精简，2026-10-17](validation/2026-10-17/about-settings.md)：两个许可按钮单行靠右、版权精简，亮暗布局与两个正文入口已实测。
- [页面文案复核，2026-10-17](validation/2026-10-17/copy-review.md)：精简连接/登录/空态及错误提示，保留必要边界；原生检查与源码复核分开记录。
- [系统应用图标，2026-10-17](validation/2026-10-17/app-icon-system.md)：正式资产与打包一致，Finder 和原生关于面板已显示正确图标。
- [融化标识修订，2026-10-17](validation/2026-10-17/melting-mark.md)：m 改为微弯左笔画、普通短中段与右侧长滴坠，统一生成品牌与应用图标；当前尺寸及原生证据见记录。
- [背景轮廓清晰度，2026-10-17](validation/2026-10-17/backdrop-clarity.md)：移除液体轮廓生成后的额外模糊；新构建的亮暗连接页及登录恢复已检查。
- [线条重绘，2026-10-17](validation/2026-10-17/mark-refinement.md)：统一双拱和圆润线条，中间笔画收细并增加轻微弧度，同源更新品牌及图标。

- [底栏品牌，2026-10-17](validation/2026-10-17/library-brand.md)：恢复列表底栏左侧的紧凑 m + Melted，条数靠右；构建 13 的深浅色、紧凑窗口和未读空态已在原生窗口检查。

- [动画复核与补齐，2026-10-17](validation/2026-10-17/animation-audit/README.md)：搜索入口、液滴实际接触、连接步骤及内容到达高亮；附当前构建、原生连续画面与回归测试。
- [水渍渐隐，2026-10-17](validation/2026-10-17/splash-fade/README.md)：触底痕迹用 1.33 s 渐隐，完全透明后清理；深浅原生画面、15 项共享测试与新构建验证。

所有历史记录保留当时事实；最新源码状态与旧截图不同处以差异清单说明。没有 GitHub Actions 工作流，不把本地检查称为远端 CI；未验证 iCloud Keychain 实体设备同步、最低系统和完整 VoiceOver，不把 Apple Development 签名称为 Developer ID 公证发行。
