# Apple 客户端：当前阅读链路与后续设计

更新：2026-10-17。视觉与交互基线见 [UI v1.1](11-ui-design-system.md)，工程约定见 [12](12-development-standards.md)。首期是原生 macOS，iOS 后续；以下明确区分已实现、设计目标和运行证据。

## 原生结构与身份

当前 macOS 部署目标 14，Swift tools 6.0，SwiftUI 构建窗口/toolbar/设置，必要处 AppKit 补齐系统输入行为；URLSession 访问服务端，Keychain 隔离会话与可选身份密钥。固定 Bundle ID **com.alkinum.melted**，构建/签名入口见 [macOS 说明](../apps/macos/README.md)。最低部署版本不等于已在该系统运行验收。

| 层 | 当前职责 | 后续扩展 |
| --- | --- | --- |
| MeltedCore | DTO、服务器发现/协商认证、API、FilterSelection、Keychain | 正文磁盘缓存、持久 mutation、完整 snapshot 重放 |
| MeltedDesignSystem | 成对 palette、阅读/布局 token、品牌、表单、列表、空态与 notice | 收敛组件内固定数值、iOS 容器及辅助设置适配 |
| MeltedRendering | swift-markdown AST 与原生 Markdown 组件 | 附件、完整语法覆盖、受控静态 HTML |
| macOS shell | 窗口/菜单、WorkspaceModel、连接/列表/阅读/搜索/设置功能模块 | 偏好、主题、反馈等后续业务页面 |

设计系统维护同一亮暗语言，客户端持有导航、操作、权限、外观和证据状态。服务端只提供内容与允许的语义数据，不能远程定义可执行表单、覆盖 App 外壳或改变字号偏好。

## 当前页面与交互

| 页面 | 当前内容与状态 | 实现入口 |
| --- | --- | --- |
| 连接入口 | 标题上方 wordmark、服务器字段、连接/进度、就地失败；共享融化背景 | [ConnectionPage](../apps/macos/Sources/Melted/Features/Connection/ConnectionPage.swift)、[LandingView](../apps/macos/Sources/Melted/Features/Connection/LandingView.swift) |
| 服务器确认 / 登录 | 地址、运营者与处理声明、信任选择、协商认证、切换与失败 | [ServerConfirmationView](../apps/macos/Sources/Melted/Features/Connection/ServerConfirmationView.swift)、[CredentialForm](../apps/macos/Sources/Melted/Features/Connection/CredentialForm.swift) |
| 资讯工作台 | 无侧栏、无顶部品牌条；全部/未读/收藏、条件摘要和最右设置；宽窗双栏/窄窗返回 | [WorkspaceView](../apps/macos/Sources/Melted/App/WorkspaceView.swift)、[WorkspaceToolbar](../apps/macos/Sources/Melted/App/WorkspaceToolbar.swift) |
| 内容列表 | 日期分组、标题/摘要/分类/时间、选择、真实分页、差异化空态；底栏左侧紧凑品牌、右侧数量 | [ContentListView](../apps/macos/Sources/Melted/Features/Library/ContentListView.swift) |
| 搜索与筛选 | 原生 sheet、组合条件与键盘建议；菜单/⌘F 和有效条件 chip 可打开 | [SearchPalette](../apps/macos/Sources/Melted/Features/Search/SearchPalette.swift) |
| 阅读详情 | 标题、时间/收藏、必要证据警告、Markdown、文末分类/标签/关注/依据字段 | [ReadingDocumentView](../apps/macos/Sources/Melted/Features/Reading/ReadingDocumentView.swift) |
| 设置与法律文本 | 外观、内容/来源与插件、账户、关于四个分组，GPL 与第三方声明可滚动 sheet | [SettingsView](../apps/macos/Sources/Melted/Features/Settings/SettingsView.swift)、[AboutSettings](../apps/macos/Sources/Melted/Features/Settings/AboutSettings.swift) |

连接页最大表单宽 440 pt，品牌在这列标题上方；连接步骤只用 220 ms 淡化，切换认证方式关闭表单布局插值。工作台品牌位于列表底栏左侧，阅读背景不融化。当前列表仍有未读点/收藏图标，与去冗余方向的差异见 [UI 第 8 节](11-ui-design-system.md#8-当前实现差异与后续整理)。

搜索设计无常驻 toolbar 入口；只有有效条件才出现可打开/清除的 chip。WorkspaceView 以原生 sheet 呈现 SearchPalette，自动聚焦字段，Esc/完成关闭，会话结束时关闭。整体清除 q/category/tag/subject 保留 view；输入框清除仅清 q。选择一个 taxonomy 建议会清空当前输入/q，再应用所选 ID。时间/排序/facet 和“立即获取”没有现成 UI。条件变化重启请求和分页，状态协调应防止迟到响应覆盖当前查询；模型字段以 [当前契约](../contracts/openapi.json)为准。

收藏是确定的状态操作，成功/冲突/失败需要真实 API 响应。详情的分类/标签是可选择文字，不能点选筛选；依据在文末同一字段组展开编号来源，风险状态在正文前保留。没有“有用/反馈”、独立已读按钮和大证据卡。

## 认证与服务器信任

先获取 discovery，读取 auth.version/methods/preferred；单支持方式直接显示，多支持方式按首选展示并可切换。未知方式不静默回退；全部不支持则说明。服务器只应声明已配置能力。信任确认之后才提交凭据。

密码/API Key 只换取会话，不保存输入；切方法/服务器或离开表单清秘密。key 证明独立 P-256 私钥持有权，不证明 Apple 身份。密钥按 origin/server_id 隔离；可同步 Keychain 不可用时允许用户明确选择本机凭据，不能静默生成另一身份。会话设备本地；浏览器登录保留 ASWebAuthenticationSession、state、双侧 PKCE、nonce 与一次性 code 校验，完整语义见 [认证契约](04-api-and-data-contracts.md)。

当前一次展示一个服务器工作区；多服务器切换、设备管理、账户恢复等完整 UI 是后续范围，不把凭据命名空间隔离当作已交付账户管理器。

## 阅读与渲染边界

App 构建包含同一品牌矢量生成的正式 ICNS 图标；资源绑定和生成说明见 [图标](../assets/app-icon/README.md)。

当前默认 Markdown，经 swift-markdown AST 原生渲染；支持标题、段落、强调、列表/任务、引用、代码、表格与受控链接。长表/代码局部横滚、正文重排；raw HTML 不渲染、远程图片不加载、外部 http(s) 只在用户操作后打开。行内代码为系统等宽字体与轻底色；代码块共享低饱和亮暗语法色、语言/复制栏、圆角边框和局部横滚。高亮引擎离线随包，未知语言或大于 64 KiB 回退原文；复制保持缩进/空行，任何正文代码均不执行。法律声明复用阅读排版，完整 GPL 使用可选择等宽文本。

后续静态 HTML 仅限用户启用后的正文：服务端 sanitize，客户端受限 WKWebView、禁 JS/bridge/表单/任意导航，非持久数据存储、CSP 和资源所有权校验。HTML 失败回退同文档 Markdown。附件只经授权代理/本地资源，不向正文或远站暴露 bearer。禁止远程模板覆盖导航、证据警告和账户操作；这些是目标要求，当前没有 HTML/附件运行链路。

## 同步、离线与通知

当前 WorkspaceModel 在连接期间每 12 秒轮询 changes 提示，按变化刷新当前查询；真实内容 upsert 可触发新到达高亮，单纯阅读/收藏变化不当作新内容。手动刷新走 ⌘R/菜单。已加载内容留内存，加载失败时保留可见正文并提供重新加载；会话过期/撤销回到登录。同步水位在初次加载前获取，刷新成功后推进；失败保留水位重试并显示提示。到达按服务器 upsert 序号判定，合并分页信号、支持同一条目的后续更新，不依赖本机时钟；不改变已打开正文和已加载尾页。远端 state/delete 的完整应用仍未实现，不能把提示轮询称为完整复制协议。

尚无正文 SQLite 缓存、持久离线 mutation 队列、SSE、完整 snapshot 缓存重建、系统通知和 APNs。后续缓存按 origin/server/account 隔离，实体/tombstone/cursor 原子落盘，冲突明确处理，退出停止重放并清理；保护方案分别验证 macOS 文件权限/加密与 iOS Data Protection。Keychain 保存 token 不意味着正文缓存加密。

未来通知不成为阅读前提：应用运行时本地通知与 APNs 分开实施，普通更新合并、急迫提醒受设置和限额约束；退出后送达、后台执行和实机推送必须独立验收。持续采集、推理和调度始终在服务器。

## 后续页面设计

下表描述功能可用时的设置内部页面或任务 sheet，不是当前主导航，也不先添加占位入口。延续当前暖白/炭灰、label/value 字段、轻量 notice、同组基线与正文边线；只对真实操作使用强调。

| 功能 | 任务与布局目标 | 状态要求 |
| --- | --- | --- |
| 偏好与学习 | 自然语言描述 → 可读 diff → 应用；保留当前版本 | 冲突、编译失败、待应用、撤销、暂停学习 |
| 关注主题 | 目标、范围、计划与预算；“立即获取”跟随实际目标 | 排队、运行、覆盖缺口、取消、预算不足 |
| 来源与整理扩展 | 私人来源授权、AI 整理和处理目的地；公开来源 DSL 管理已实现 | 授权过期、频限、不支持、关闭 |
| 导入 | 文本/链接/支持附件的受控提交 sheet | 类型/大小限制、上传/接收、整理失败 |
| 反馈记录 | 内容版本、原因、处理状态与撤销 | 待发送、已接收、待学习、已应用/失败/已撤销 |
| 通知、渠道与账户数据 | 设置内部能力页，删除说明对象/后果 | 权限拒绝、投递失败、导出/删除进度 |

显式偏好优先，主题可选，不预选技术兴趣。私人消息、资料、观点保留各自性质；界面不为全部内容套统一“发生了什么—对你影响”模板。

## iOS 与验收

iOS 尚未实现；共用语义 token、内容结构与状态，平台使用根列表/详情 push、可见搜索和单一设置入口，至少 44 pt 触控、Dynamic Type 和真实 safe area。不能复制桌面键盘入口、hover、固定小字号或桌面窄窗当作手机验收。

原生验收按 [UI 第 9 节](11-ui-design-system.md#9-质量验收)，证据入口见 [设计复核](13-design-review.md)。已有截图只证明记录中的构建和场景，最低系统、全屏、VoiceOver、辅助设置与完整网络/生命周期矩阵尚不能宣告通过。发行还需签名公证、源码对应与安装升级检查，不能以文档完成替代。
