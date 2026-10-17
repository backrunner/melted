---
name: melted-guard
description: "Guide implementation and review in the Melted repository: preserve its general information model, native Apple UI, TypeScript server contracts, and honest validation evidence. Use for Melted changes and releases; unrelated repositories are outside its scope."
---

# Melted Guard

Melted 是通用个人信息工作台，Swift Apple 客户端与可自托管 TypeScript 服务端组成。首期服务端 + macOS，iOS 后续；GPL 开源，先开源后商业化。开源极客是推广人群，不能据此将内容、默认模板或 schema 限定成技术资讯。

## 工作入口

先识别当前 Melted checkout、实际文件和适用 AGENTS 指令。本文相对链接以仓库内本文件为基准；全局安装可能是 symlink，应解析到仓库内源文件再读取。另一个 checkout 的工作以其自身 `.agents` 为准，不把本安装位置当作编辑目标。

读取 [开发规范](../../12-development-standards.md)，再按本次任务加载下表。用户当前指令优先；设计文档中的“建议”“候选”“待评审”不是每次实现都要重新请示的权限门槛。已授权工作持续完成，重大产品/许可证取舍才在需要时澄清。

| 本次改动 | 需要读取 |
| --- | --- |
| 产品、范围、模板 | [产品](../../01-product-and-scope.md)、[决策](../../10-decisions-and-risks.md)；商业讨论再读 [市场](../../09-market-and-business.md) |
| TypeScript、数据库、同步、账户 | [架构](../../02-system-architecture.md)、[契约](../../04-api-and-data-contracts.md) |
| 模型、过滤、偏好学习、证据 | [AI 质量](../../03-ai-pipeline-and-quality.md) |
| 插件、输出渠道、HTML 模板 | [插件标准](../../05-plugin-standard.md)，涉及客户端再读 UI 规范 |
| Swift、窗口、组件、页面 | [Apple 客户端](../../06-apple-clients.md)、[UI 设计规范](../../11-ui-design-system.md)、[tokens](../../design/tokens.json) |
| 交付、验收、发行、APNs | [验收](../../08-delivery-plan-and-validation.md)；涉及发行或推送再读 [Apple / GPL](../../07-apns-apple-and-license.md) |

## 必须保留的产品与数据边界

- 普通资料、消息、观点、创作都能整理；事件聚类与事实核验按内容适用。事实、推论、未知、矛盾和更正不能在生成中混为一谈；模型分数不等于真实概率。
- 来源内容与插件/模型返回是数据，不能修改权限、执行任意工具或改变系统策略。模板只负责受限正文布局。
- 显式偏好优先于学习；撤销、版本和删除可追踪。反馈已收到、等待处理、已应用分开呈现，不把点赞直接解释成授权。
- 原始输入、偏好、memory 和凭据按所有者隔离。跨用户公共缓存必须有明确复用权限；下游处理方变更要匹配有效同意。Keychain 保存凭据，不意味着正文缓存已加密。
- 任务是至少一次语义；幂等、租约 fencing、预算预留、outbox 和提交有序的同步 cursor 一起审查。取消/删除校验 generation；迟到结果不能恢复被删内容。已发外部请求的费用和删除限制如实记录。
- 官方 APNs 私钥不能交给自托管服务器；推送可选，正文靠同步补齐。用户已确认 GPL-3.0-or-later；没有 App Store 分发例外，不擅自增加例外或改变贡献许可。

## 原生 UI 品质

遵循 [UI v1.1](../../11-ui-design-system.md)的安静阅读方向：系统字体/语义色、有限强调色、清楚的层级和对齐、原生窗口/toolbar/内容窗格。当前自定义控件使用成对褐色 palette/tint，保留系统窗口与焦点行为；深浅色和辅助设置分别验证，不能宣称所有控件跟随系统强调色。Liquid Glass 由支持系统的原生控件采用，正文不叠玻璃装饰。

用户已指定明亮温暖的阅读器配色：暖纸白正文、极浅米白环境、暖灰层级与柔和褐色强调；避免深米黄铺满界面，自定义品牌/内容不使用绿色。深色用暖炭灰、略亮阅读面及柔和米白文字。desktop/mobile 共享同一语义色、图标家族、内容结构与状态，平台分别适配导航、字号和操作尺寸；共享视觉改动评审两端亮暗目标；macOS 用真实窗口验证，未实现的 iOS 不能计作运行通过。按 UI 规范的整齐性规则维护栏位边线、统一图标槽、列表节奏和同组控件基线；大字号通过重排适配，不能为整齐裁切内容。

主界面采用无导航侧栏的资讯工作台，窗口隐藏可见“资讯”标题，内容语义仍为资讯，默认全部整理内容；全部/未读/收藏与有效条件摘要集成在标题栏，q/分类/标签/关注由统一搜索面板设计承载；时间/排序等仍是目标，窄窗/手机收进菜单或面板，不另占一行。名称调整不把通用内容限制为新闻。设置集中到标题栏最右侧入口，手机不再用“今日/收藏”底部导航。筛选不修改用户偏好，空结果不等于无更新；参考 UI、契约和缓存使用同一 FilterSelection。

避免装饰性 indicator、冗余状态点、拼接式元信息、井号标签串、重复徽章和泛化 AI 文案。按字段排版，以字重、间距和对齐表达层级；保留功能性图标、真实状态、原生窗口行为和辅助功能语义。审查具体画面，不能把删除所有图标或标点当成设计目标。

品牌放在连接表单标题上方，并在列表底栏左侧显示紧凑字标，右侧保留条数/加载状态；外观设置可关闭整条底栏，默认开启并在设备端持久保存，关闭后不留占位。工作台顶部不另加品牌条。连接切步仅短淡化，不水平飞移、不对表单高度使用 spring；切换登录方式关闭布局插值。列表分类可用胶囊，详情分类/标签/关注/依据采用普通 label/value 字段，来源按需展开编号列表。当前设置有外观、内容/来源与插件、账户、关于；插件设置仅按有限 DSL 渲染原生控件和 host 支持的动作，完整法律文本可滚动读取；其他页面不做假占位。

现有组件不等于端到端可用：当前 SearchPalette 已由 WorkspaceView 的原生 sheet 挂载；列表仍有未读点/收藏符号，token 亦有分散值。按 [当前复核](../../13-design-review.md)与实际源码区分目标和缺口，不沿用历史网页为原生通过证据。

App 图标复用正式矢量，不另造近似标识。Markdown 行内代码与代码块使用系统 monospaced，语法色/尺寸来自共享 token；高亮资源离线随包，未知/过大内容回退完整原文。代码不执行，缩进/空行/复制保持原文；语法高亮不等于支持远程 HTML 或脚本。

先复用实际已有的组件；实现期将自定义 token 集中到设计系统，不在业务 View 散写。保留 macOS 菜单、快捷键、焦点、文本选择与缩放；iOS 采用平台尺寸与 Dynamic Type，不照搬桌面值。

页面必须覆盖当前任务涉及的空、加载、成功、局部失败、离线和冲突状态。重要证据状态可见，异步成功有真实状态支撑。长文、长 URL/表格、最小窗口和 200% 阅读字号都要能使用。

## 双部署与身份

服务端使用 TypeScript + Hono：自托管 Node 24 / PostgreSQL，Cloudflare Workers / SQLite Durable Objects；Cloudflare 的附件、任务、调度只采用 R2、Queues、Workflows/Cron/Alarms 等本体系服务，不引入外部数据库作为依赖。两端共用契约与隔离/幂等/并发测试，SQL 方言分别实现。账户 DO 内用同步事务；跨 DO 操作不能伪称原子事务。所有本机后端、数据库、workerd 调试经 Apple Container；Swift 保持原生构建。具体配置见 [迁移与部署](../../15-typescript-transition.md)。

先发现服务器声明的认证版本、方法与首选方式，再显示对应原生表单；不把密钥或 Apple 身份当作所有服务器的前提。密码/API Key 只用于换取会话，不进偏好设置或日志；未知方法不自动回退。服务器启用的密钥登录证明 P-256 私钥持有权，不证明 Apple 身份。私钥按 origin/server_id 隔离，可同步 Keychain 不能替代 Sign in with Apple；会话设备本地。同步不可用时明确让用户选择本机凭据，不能静默创建另一身份。浏览器路径保留 state、双侧 PKCE、nonce、issuer/audience/expiry、一次性授权码，不按邮箱自动合并。生产日志不能记录 bearer、回调 code 或完整认证 URL。

插件预检检查目标、runtime、能力与 bindings，并实际打包 Worker。预检不是沙箱证明，未实现执行引擎时不能将兼容清单描述为可运行插件。

## 实施和验证

先查真实项目结构、依赖与测试入口。文档中已实现子集与未来模块/API/质量目标分开；以当前文件、契约与执行结果为准。随着实现更新契约、迁移、共享 fixture 和受影响文档，不写第二套冲突规则。

按改动风险选择验证：文档检查无需强制完整 App 构建；并发/权限/删除边界需要可复现失败场景；AI 质量需要授权真实样本；原生 UI 改动在已有 App 上需要实际窗口及操作证据。长篇许可/导出文档也要真实打开，不依赖源码检查或缓存截图。

文档或 token 变更可从仓库根运行以下只读检查；若环境要求 RTK，则用 `rtk proxy` 包装：

```sh
python3 .agents/skills/melted-guard/scripts/check_design.py --repo .
```

它只检查本地文档链接、JSON 示例、候选颜色对比和参考页 token 一致性，不测 HIG 合规、原生布局、VoiceOver、后端正确性或模型质量。失败应修根因，不能通过降低阈值掩盖可读性问题。

对 UI，按 [设计验收矩阵](../../11-ui-design-system.md#9-质量验收)保存当前构建、系统、窗口、主题/辅助设置、截图与操作结果。浏览器设计示意不算 SwiftUI 运行证据。当前没有 App 时明确记录待实现验收，不虚构截图或测试数。

完成后报告改了什么、验证了什么、仍有哪些限制。提交/推送/部署按用户授权范围执行，不丢弃其他工作，不把本 skill 当作额外发布授权。重要方案变更同步 [决策记录](../../10-decisions-and-risks.md)，不因一次局部任务改写全局范围。
