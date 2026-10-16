# 当前设计文档同步验证

日期：2026-10-17，Asia/Singapore。范围：设计文档、开发 guard、视觉参考与文档入口；未修改 App/服务端代码或运行时 token，未重新构建或发布。

## 基线与范围

- 以本次工作前源码 HEAD 6de33a9、MeltedDesignSystem 和现有原生截图核对。品牌位置与切页以 2026-10-16 记录为依据；阅读/法律文本图片来自 2026-10-17 记录，各自构建 hash 保留在原记录。
- UI v1.0 整合颜色、字体/尺度、品牌、连接、toolbar/搜索、列表、阅读/依据、设置、空态/失败、动效、iOS 目标与页面验收矩阵。
- 01–15、设计索引、开发 guard 及项目/macOS 文档入口同步；新增组件/资产索引。旧设计报告与浏览器原型移至 design/history 并注明历史边界；既有 validation 文件未改写。
- 源码审查发现 WorkspaceView 没有呈现 SearchPalette，仅更新 searchOpen；已列为缺口，本次未运行复现或修复。未读点/收藏符号、分散 token、同步与辅助功能范围也明确记录。

## 静态检查

- 设计检查：本地 Markdown 文件链接、5 个 JSON 示例、22 对指定不透明 token 颜色及 HTML 内嵌 token；最低对比 5.17:1。
- 生成器：generate-design-tokens.py --check、generate-brand-assets.py --check；没有 runtime token 或生成资产变化。
- 补充检查：Markdown 本地锚点、当前 HTML 的本地图片/链接、ADR-001 至 ADR-020 唯一性，以及 git diff --check。
- 初次设计检查因本记录尚未创建而报出两个缺失链接；创建后最终检查通过：35 个 Markdown 文件、239 个本地链接、5 个 JSON 示例、22 组色彩。两个生成器与补丁空白检查均通过。补充核对通过 5 个 Markdown 锚点、18 个 HTML 本地资源/链接引用和 20 个唯一 ADR 编号。

## 文档页面实际预览

临时 Node 静态服务仅在现有 Apple Container 的独立端口运行，未替换 API、数据库或 workerd。用 Codex 内置浏览器打开 reference.html，实际检查跟随系统的深色初始外观、切换浅色/深色、配色锚点、连接确认/法律图片展开。当前截图均正常加载；保存 [浅色文档](design-documentation/reference-light.jpg)和[深色文档](design-documentation/reference-dark.jpg)，浏览器视区为 746×845 px。

两张图是文档网页截图，不是本次新构建的 App 截图；页内 App 图片是原有真实构建证据。没有重新验证原生搜索、完整页面、最低系统、VoiceOver、iOS、模型质量、签名公证或远端 CI。外部 Apple/法律/竞品资料保留原查阅日期，本次未重新核查。
