# Melted 项目设计

更新：2026-10-17。当前基线为 **UI v1.1：暖纸白 / 暖炭灰的原生阅读器**。已依据现有 SwiftUI 组件、品牌位置和原生截图统一规范；已实现、目标、历史证据分开记录，具体范围见 [实施记录](14-implementation-status.md)。

Melted 是个人信息工作台：服务端持续获取和处理信息，用户在原生应用或其他渠道收到经过整理、有证据边界的内容。首期实现 TypeScript 服务端和 Swift macOS 应用，后续加入 iOS。

已确认：产品处理通用信息，首批向开源极客推广；开发者与独立创业者是其中的一部分，不限定其信息主题。先纯开源、验证价值，后续再商业化；保留完整自托管。2026-10-15 用户确认 GPL-3.0-or-later，见根目录 [LICENSE](../LICENSE)；本次不添加 App Store 分发例外。

当前视觉与交互：连接表单标题上方显示 Melted wordmark，连接步骤短淡化；列表底栏左侧显示紧凑品牌，工作台无顶部品牌条、无导航侧栏、隐藏可见“资讯”标题。原生 toolbar 提供全部/未读/收藏、有效条件摘要与最右设置；统一搜索设计使用菜单/⌘F，但当前面板挂载存在源码缺口。阅读详情使用轻量时间/收藏工具行、稳定正文、文末字段与按需展开来源；风险证据状态前置。设置目前只开放外观、账户、关于，其他页面是后续目标。v1.1 加入正式 App 图标、代码等宽排版、离线语法高亮与复制样式。详见 [UI 规范](11-ui-design-system.md)与[当前复核](13-design-review.md)。

[视觉参考](design/reference.html)展示现有原生截图，[设计资源索引](design/README.md)解释 token、品牌和组件来源。iOS 共享设计语言但尚未实现；不以旧手机网页作为原生交付。

## 阅读顺序

| 文档 | 解决的问题 |
| --- | --- |
| [01-product-and-scope.md](01-product-and-scope.md) | 产品承诺、八项需求映射、首期与后续范围 |
| [02-system-architecture.md](02-system-architecture.md) | TypeScript 模块、部署、任务恢复、安全与成本边界 |
| [03-ai-pipeline-and-quality.md](03-ai-pipeline-and-quality.md) | 多模态、去重、求真、Jev、偏好和记忆 |
| [04-api-and-data-contracts.md](04-api-and-data-contracts.md) | 账号、摄取、数据模型、同步、Subject 接口 |
| [05-plugin-standard.md](05-plugin-standard.md) | 插件类型、进程协议、授权、失败和兼容性 |
| [06-apple-clients.md](06-apple-clients.md) | 当前页面/组件、同步边界、未来业务页与 iOS |
| [07-apns-apple-and-license.md](07-apns-apple-and-license.md) | APNs 可行性、自托管、审核及 GPL 分发 |
| [08-delivery-plan-and-validation.md](08-delivery-plan-and-validation.md) | 工作拆解、依赖、验收与真实运行证据 |
| [09-market-and-business.md](09-market-and-business.md) | 首批市场、差异、开源增长、商业候选和实验 |
| [10-decisions-and-risks.md](10-decisions-and-risks.md) | 架构决策、开放问题与风险优先级 |
| [11-ui-design-system.md](11-ui-design-system.md) | 当前配色/品牌/组件/动效、差异、页面验收矩阵 |
| [12-development-standards.md](12-development-standards.md) | TypeScript/Swift、契约、AI、权限、验证与提交约定 |
| [13-design-review.md](13-design-review.md) | 当前源码核对、设计差异、原生/历史证据索引 |
| [14-implementation-status.md](14-implementation-status.md) | 已实现能力、阶段状态、后续顺序及原生验证 |
| [15-typescript-transition.md](15-typescript-transition.md) | TypeScript、双部署、身份与容器调试 |

[melted-guard](skills/melted-guard/SKILL.md) 是后续开发入口；[历史设计报告](design/history/2026-10-14-design-review.md)保留早期外观/状态探索；最新原生交互以 11 和带日期的运行验收为准，[tokens.json](design/tokens.json)保存自定义视觉数值。

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

当前已有 TypeScript 服务端、PostgreSQL 与 SQLite DO 数据层、共享契约与 Swift 原生 macOS 阅读链路；公开仓库与 GPL 材料已建立，M0–M5 的完整目标仍按实施记录逐项推进。每次任务重新检查实际文件与验证证据。
