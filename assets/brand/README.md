# Melted 标识

一个正在融化的小写 **m**。左侧略带弧度，中间是简洁的短圆头笔画，右侧收窄后向下延展。各段曲线平滑衔接，两处字腔保持开放；融化由长短和轮廓表达。

- [mark.svg](mark.svg)：32 × 32 矢量源，使用 currentColor。
- [浅色 lockup](lockup-light.svg) / [深色 lockup](lockup-dark.svg)：README 标识，复用项目亮暗主题颜色。
- App 的 MeltedMark 使用同一路径，连接表单标识 36 pt，文字 28 pt；主工作台和列表底栏不显示品牌。
- [App 图标](../app-icon/README.md)：暖纸白圆角底板与褐色原始标识，SVG、1024 PNG 和多尺寸 ICNS。

2026-10-17 修订了旧版近似等粗圆柱的轮廓；配色、字标字体与页面位置沿用现有设计。不要另加悬浮水滴、光泽、纹理或渐变来表达融化。[资产与原生验证](../../.agents/validation/2026-10-17/melting-mark.md)记录新轮廓的尺寸检查和实际应用。

修改 SVG 后运行 python3 scripts/generate-brand-assets.py 和 swift scripts/generate-app-icon.swift；两个命令的 --check 检查生成一致性。颜色来自 .agents/design/tokens.json，不额外维护一份近似色。环境要求 RTK 时用 rtk proxy 包装。

本项目原创标识、图标与源码同为 GPL-3.0-or-later，见根目录 LICENSE 与 COPYRIGHT。
