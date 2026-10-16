# Melted 标识

一个连续、圆润的小写 **m**。两个拱形汇成一体，略有高低的底部呼应融化与信息汇聚；小尺寸保留轮廓，不增加细节装饰。

- [mark.svg](mark.svg)：32 × 32 矢量源，使用 currentColor。
- [浅色 lockup](lockup-light.svg) / [深色 lockup](lockup-dark.svg)：README 标识，复用项目亮暗主题颜色。
- App 的 MeltedMark 使用同一路径，连接表单标识 36 pt，文字 28 pt；主工作台和列表底栏不显示品牌。
- [App 图标](../app-icon/README.md)：暖纸白圆角底板与褐色原始标识，SVG、1024 PNG 和多尺寸 ICNS。

修改 SVG 后运行 python3 scripts/generate-brand-assets.py 和 swift scripts/generate-app-icon.swift；两个命令的 --check 检查生成一致性。颜色来自 .agents/design/tokens.json，不额外维护一份近似色。环境要求 RTK 时用 rtk proxy 包装。

本项目原创标识、图标与源码同为 GPL-3.0-or-later，见根目录 LICENSE 与 COPYRIGHT。
