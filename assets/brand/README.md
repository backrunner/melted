# Melted 标识

一个连续、圆润的小写 **m**。两个拱形汇成一体，略有高低的底部呼应融化与信息汇聚；小尺寸只保留轮廓，不加渐变、阴影或细线。

- `mark.svg`：32 × 32 矢量源，使用 `currentColor`。
- `lockup-light.svg` / `lockup-dark.svg`：README 标识，复用项目亮暗主题颜色。
- App：`MeltedMark` 使用同一路径，状态栏占 18 pt，欢迎页占 64 pt；放大仍保持矢量轮廓。

修改 SVG 后运行 `python3 scripts/generate-brand-assets.py`；`--check` 检查生成文件是否一致。颜色来自 `.agents/design/tokens.json`。

本项目原创标识与源码同为 GPL-3.0-or-later，见根目录 LICENSE 与 COPYRIGHT。
