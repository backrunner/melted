# Melted 标识

一个正在融化的小写 **m**。两侧拱顶采用一致的弧度，中央连接处圆滑；笔画向下自然舒展，以克制的长短变化和圆润收尾表达融化。整体紧凑，中间笔画纤细、稍短并带轻微弧度，右侧下垂稍长，两处字腔保持开放。

- [mark.svg](mark.svg)：32 × 32 矢量源，使用 currentColor。
- [浅色 lockup](lockup-light.svg) / [深色 lockup](lockup-dark.svg)：README 标识，复用项目亮暗主题颜色。
- App 的 MeltedMark 使用同一路径，连接表单标识 36 pt、文字 28 pt；列表底栏左侧使用紧凑字标（标识 16 pt、文字 13 pt、间距 6 pt）。
- [App 图标](../app-icon/README.md)：暖纸白圆角底板与褐色原始标识，SVG、1024 PNG 和多尺寸 ICNS。

2026-10-17 重新绘制完整轮廓，统一双拱节奏与笔画重量，缩短过长的右侧滴坠；配色、字标字体与页面位置沿用现有设计。不要另加悬浮水滴、光泽、纹理或渐变来表达融化。见[初次重绘验证](../../.agents/validation/2026-10-17/melting-mark.md)与[线条重绘验证](../../.agents/validation/2026-10-17/mark-refinement.md)。

修改 SVG 后运行 python3 scripts/generate-brand-assets.py 和 swift scripts/generate-app-icon.swift；两个命令的 --check 检查生成一致性。颜色来自 .agents/design/tokens.json，不额外维护一份近似色。环境要求 RTK 时用 rtk proxy 包装。

本项目原创标识、图标与源码同为 GPL-3.0-or-later，见根目录 LICENSE 与 COPYRIGHT。
