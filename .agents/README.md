# Melted 项目设计

设计日期：2026-10-13 至 2026-10-15（Asia/Singapore）。状态：设计作为实施基线；已开始 TypeScript/macOS 基础版本实现，具体范围与证据见 [实施记录](14-implementation-status.md)。

Melted 是个人信息工作台：服务端持续获取和处理信息，用户在原生应用或其他渠道收到经过整理、有证据边界的内容。首期实现 TypeScript 服务端和 Swift macOS 应用，后续加入 iOS。

已确认：产品处理通用信息，首批向开源极客推广；开发者与独立创业者是其中的一部分，不限定其信息主题。先纯开源、验证价值，后续再商业化；保留完整自托管。2026-10-15 用户确认 GPL-3.0-or-later，见根目录 [LICENSE](../LICENSE)；本次不添加 App Store 分发例外。

UI 要求已确认：素雅、有设计感、品质感和现代感，遵循 Apple HIG；采用明亮、温暖的阅读器米白色系，不用绿色，保持对齐、间距和控件排列整齐。desktop/mobile 共享设计语言，同时适配亮暗主题；无导航侧栏，设置集中到标题栏最右侧入口，窗口隐藏可见“资讯”标题，内容语义仍为资讯，收藏/分类/标签/关注筛选并入标题栏，不单独占一行；空间不足时使用筛选面板。避免装饰性 indicator、圆点拼接元信息和模板化 AI 文案，通过排版、留白和对齐保持设计感。视觉与交互以 11 为实施基线，工程约定以 12 为准；具体 token 数值是可验证、可调整的初始选择。

## 阅读顺序

| 文档 | 解决的问题 |
| --- | --- |
| [01-product-and-scope.md](01-product-and-scope.md) | 产品承诺、八项需求映射、首期与后续范围 |
| [02-system-architecture.md](02-system-architecture.md) | TypeScript 模块、部署、任务恢复、安全与成本边界 |
| [03-ai-pipeline-and-quality.md](03-ai-pipeline-and-quality.md) | 多模态、去重、求真、Jev、偏好和记忆 |
| [04-api-and-data-contracts.md](04-api-and-data-contracts.md) | 账号、摄取、数据模型、同步、Subject 接口 |
| [05-plugin-standard.md](05-plugin-standard.md) | 插件类型、进程协议、授权、失败和兼容性 |
| [06-apple-clients.md](06-apple-clients.md) | macOS 页面、离线、Markdown/HTML、iOS 预留 |
| [07-apns-apple-and-license.md](07-apns-apple-and-license.md) | APNs 可行性、自托管、审核及 GPL 分发 |
| [08-delivery-plan-and-validation.md](08-delivery-plan-and-validation.md) | 工作拆解、依赖、验收与真实运行证据 |
| [09-market-and-business.md](09-market-and-business.md) | 首批市场、差异、开源增长、商业候选和实验 |
| [10-decisions-and-risks.md](10-decisions-and-risks.md) | 架构决策、开放问题与风险优先级 |
| [11-ui-design-system.md](11-ui-design-system.md) | Apple HIG 映射、视觉 token、布局/交互/状态、原生验收 |
| [12-development-standards.md](12-development-standards.md) | TypeScript/Swift、契约、AI、权限、验证与提交约定 |
| [13-design-review.md](13-design-review.md) | 设计阶段全量审阅、已修正问题、剩余验证边界 |
| [14-implementation-status.md](14-implementation-status.md) | 已实现能力、阶段状态、后续顺序及原生验证 |
| [15-typescript-transition.md](15-typescript-transition.md) | TypeScript、双部署、身份与容器调试 |

[melted-guard](skills/melted-guard/SKILL.md) 是后续开发入口；[早期设计参考页](design/reference.html)保留当时的外观/状态探索；最新原生交互以 11 和运行验收为准，[tokens.json](design/tokens.json)保存自定义视觉数值。

## 核心设计建议

1. 默认直接阅读整理后的简报；保留按需展开的证据、分歧和来源入口。隐藏原始信息流不应让用户失去核验权。
2. TypeScript + Hono 共享业务，自托管 Node/PostgreSQL，Cloudflare Workers/SQLite DO；后续附件与队列在 CF 使用 R2/Queues，保持全部基础设施原生。
3. 决策模型判断相关性、标签和候选优先级；生成模型整理内容；证据核验单独执行。任何模型分数都不能自动变成“真相概率”。
4. 插件运行方式按目标验证：自托管可使用独立进程，Cloudflare 只允许兼容 Worker 或 HTTPS 适配。当前仅预检，执行引擎后续实现。客户端只消费内容和配置数据。
5. 用户偏好与可选 Subject 表达关注目标；交付可以是整理后的消息、资料、主题简报或事件变化。新闻、兴趣、文化、生活及工作信息共用处理能力，不强制归入技术分类或事件。
6. 官方 App 的 APNs 经可选中继发送。不开中继仍能同步；完全独立的运营者可以自己构建和签名客户端。
7. 首期默认 BYOK，不引入计费、付费墙或商业插件市场。记录成本、质量和插件协议，方便后续评估商业路径。

产品范围与推广人群分别定义：通用信息处理是首期要求，开源极客是最早触达和共建的人群。技术雷达、竞品追踪可以作为社区示例，不能成为服务端 schema、默认分类或界面的领域边界。

## 文档使用约定

“建议”是本次设计选择，未经用户确认的产品取舍不能当作已批准实现。“目标”是待验证验收线；价格和容量示例是预算假设。外部事实在对应段落附一手来源，查阅日期为 2026-10-13 至 2026-10-14，发行前应再检查。

最初仓库为空且未初始化 Git。当前已有 TypeScript 服务端、PostgreSQL 与 SQLite DO 数据层、共享契约与 Swift 原生 macOS 阅读链路；M0–M5 的完整目标仍按实施记录逐项推进。每次任务重新检查实际文件与验证证据。
