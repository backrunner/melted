# 设计资源与组件索引

更新：2026-10-17。当前规范为 [UI v1.1](../11-ui-design-system.md)，[Apple 客户端](../06-apple-clients.md)解释页面/状态和后续能力，[复核](../13-design-review.md)记录源码差异与证据。不要将旧原型里的可点击控件理解成现有 App 能力。

## 当前视觉与资产

- [视觉参考 HTML](reference.html)：本地、无外部依赖，展示真实原生截图、成对颜色与当前规则；主题选择只改变文档外观，不改变静态截图。
- [tokens.json](tokens.json)：颜色、macOS 布局/阅读/连接指标和 iOS 目标；脚本生成 Swift。version=7 是数值版本，与 UI 文档 v1.1 无需同号。status 保留保守的 design-baseline-not-runtime-verified，含义是整套 token 尚未完成全部运行矩阵，不否定已记录的特定原生截图。
- [App 图标](../../assets/app-icon/README.md)：原始 m 与共享 palette 生成 SVG、1024 PNG、ICNS，构建显式绑定。
- [品牌原始标识](../../assets/brand/mark.svg)：由 [品牌生成器](../../scripts/generate-brand-assets.py)生成 Swift 路径与亮暗 lockup，禁止替换为近似字符或 emoji。
- [融化标识修订](../validation/2026-10-17/melting-mark.md)：微弯左笔画、普通短中段与右侧长滴坠；旧截图按原记录保留。
- [浅色阅读](../../assets/screenshots/reader-light.png)、[深色阅读](../../assets/screenshots/reader-dark.png)、[连接入口](../../assets/screenshots/landing-light.jpg)：2026-10-17 README 原生截图，实际开发样例，不是模型质量样本。
- [品牌位置截图与操作](../validation/2026-10-16/brand-position.md)、[法律窗口](../validation/2026-10-17/publication.md)：按记录的构建与场景引用。

## 组件与页面映射

以下尺寸为源码基准 pt，不是截图像素测量。阅读字号放大只影响阅读组件；原生容器尺寸以系统行为为准。

| 组件 / 模块 | 用途 | 当前尺寸与规则 |
| --- | --- | --- |
| [MeltedScreen](../../apps/apple/Packages/MeltedKit/Sources/MeltedDesignSystem/MeltedScreen.swift) | 页面底色与可选背景 | 无默认品牌 header；backdrop 只连接时启用 |
| [ConnectionPage](../../apps/macos/Sources/Melted/Features/Connection/ConnectionPage.swift) / [MeltedWordmark](../../apps/apple/Packages/MeltedKit/Sources/MeltedDesignSystem/MeltedWordmark.swift) | 连接骨架与共享字标 | 列宽 440、inset 32、间距 28；连接标识 36 / 标题 28；紧凑标识 16 / 标题 13 / 间距 6 |
| [MeltedField](../../apps/apple/Packages/MeltedKit/Sources/MeltedDesignSystem/Controls/MeltedField.swift) / [按钮样式](../../apps/apple/Packages/MeltedKit/Sources/MeltedDesignSystem/MeltedButtonStyles.swift) | 原生输入的共享外观、主要/次要动作 | 连接动作高 40；不统一强改所有页面按钮高度 |
| [MeltedCheckboxStyle](../../apps/apple/Packages/MeltedKit/Sources/MeltedDesignSystem/Controls/MeltedCheckboxStyle.swift) / [MeltedSegmentedPicker](../../apps/apple/Packages/MeltedKit/Sources/MeltedDesignSystem/Controls/MeltedSegmentedPicker.swift) | 信任与认证/外观选择 | 原生语义和焦点，同组基线，真实状态驱动 |
| [InfoCard](../../apps/apple/Packages/MeltedKit/Sources/MeltedDesignSystem/Controls/InfoCard.swift) | 运营者/处理声明 | 连接确认用途，不扩展成正文卡片系统 |
| [ContentRowView](../../apps/apple/Packages/MeltedKit/Sources/MeltedDesignSystem/ContentRowView.swift) / [CategoryLabel](../../apps/apple/Packages/MeltedKit/Sources/MeltedDesignSystem/CategoryLabel.swift) | 列表与轻分类 | 圆角 10、inset 16×14、标题 3 行/摘要 4 行；未读点为已知差异 |
| [LibraryStatusBar](../../apps/apple/Packages/MeltedKit/Sources/MeltedDesignSystem/LibraryStatusBar.swift) | 列表底栏 | 左侧紧凑品牌、右侧条数/加载；水平 24 / 垂直 10；空列表仍显示 |
| [SearchPalette](../../apps/macos/Sources/Melted/Features/Search/SearchPalette.swift) / [MeltedFilterChip](../../apps/apple/Packages/MeltedKit/Sources/MeltedDesignSystem/Controls/MeltedFilterChip.swift) | 查询面板与条件状态 | 面板圆角 14、建议区最大高 280、条件高 24；当前缺主窗口挂载 |
| [ReadingHeader](../../apps/macos/Sources/Melted/Features/Reading/ReadingHeader.swift) / [ReadingMetadata](../../apps/macos/Sources/Melted/Features/Reading/ReadingMetadata.swift) | 标题/时间/收藏与文末字段 | 标题 24，正文宽≤720，信息字号 12；窄处重排 |
| [ReadingEvidence](../../apps/macos/Sources/Melted/Features/Reading/ReadingEvidence.swift) | 状态与编号来源 | 普通状态文末，风险前置，切文收起，无大卡片 |
| [ReadingCodeBlock](../../apps/apple/Packages/MeltedKit/Sources/MeltedRendering/ReadingCodeBlock.swift) / [CodeHighlighting](../../apps/apple/Packages/MeltedKit/Sources/MeltedRendering/CodeHighlighting.swift) | 原生代码与离线语法高亮 | 13 pt monospaced、10 pt 圆角、16 pt inset、36 pt 语言/复制栏；未知/超大回退原文 |
| [ReadingMarkdown](../../apps/apple/Packages/MeltedKit/Sources/MeltedRendering/ReadingMarkdown.swift) | 原生文档 | readingMetricsPt，长表/代码局部横滚，raw HTML/远程图禁用 |
| [MeltedDisclosure](../../apps/apple/Packages/MeltedKit/Sources/MeltedDesignSystem/Controls/MeltedDisclosure.swift) | 插件分区、采集设置、连接技术详情与阅读来源 | 共享箭头、点击区域、展开语义与 220 ms 布局/淡化动画；减少动态效果时关闭动画；各分区独立状态 |
| [MeltedNotice](../../apps/apple/Packages/MeltedKit/Sources/MeltedDesignSystem/MeltedNotice.swift) / [EmptyState](../../apps/apple/Packages/MeltedKit/Sources/MeltedDesignSystem/EmptyState.swift) / [LoadingState](../../apps/apple/Packages/MeltedKit/Sources/MeltedDesignSystem/LoadingState.swift) | 真实失败、无内容和加载 | 轻底色与文字、按需操作；空态最大宽约 320，避免用假成功占位 |
| [SettingsView](../../apps/macos/Sources/Melted/Features/Settings/SettingsView.swift) / [AboutSettings](../../apps/macos/Sources/Melted/Features/Settings/AboutSettings.swift) | 外观、账户、关于与法律 sheet | 设置宽 520；法律 sheet 640×520，长文滚动/选择 |
| [MeltedBackdrop](../../apps/apple/Packages/MeltedKit/Sources/MeltedDesignSystem/Motion/MeltedBackdrop.swift) / [动效工具](../../apps/apple/Packages/MeltedKit/Sources/MeltedDesignSystem/Motion/MeltedMotionStyles.swift) | 连接边缘融化、局部状态反馈 | 减少动态时冻结/关闭；连接不使用旧 page spring 或水平位移 |

## 变更流程

1. 先确认用户当前要求、源码和对应原生证据，写清目标与实现差异。
2. 改视觉数值时先改 tokens；同步 reference.html 内嵌 JSON，运行设计 token / 品牌生成器。只改文档无需修改 runtime token 或假造新截图。
3. 组件局部值尚未全部 token 化；后续迁移先识别调用，不把 row=8 强套当前 10 pt 选中形状，或把旧 pageTransition 恢复到连接。
4. 跑静态检查和生成器 --check，UI 实现另做受影响的真实页面/状态检查，结果放带日期记录。
5. 同步 06、11、14、ADR 与 guard 的受影响内容，历史记录不回写成新结论。

```sh
python3 .agents/skills/melted-guard/scripts/check_design.py --repo .
python3 scripts/generate-design-tokens.py --check
python3 scripts/generate-brand-assets.py --check
swift scripts/generate-app-icon.swift --check
git diff --check
```

环境要求 RTK 时，以上命令用 rtk proxy 包装。静态检查不测原生布局、VoiceOver、iOS、HIG 全项或模型质量。

## 历史探索

[早期复核](history/2026-10-14-design-review.md)与[原型 v0.6](history/reference-v0.6.html)保留网页交互和旧手机方案。reference-*.jpg 八张图片仍放在本目录，具体测量解释在历史复核。旧原型的六组设置、反馈、缓存提示、时间筛选和手机操作不代表当前实现，不能覆盖 UI v1.1。
