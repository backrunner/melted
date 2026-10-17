# Melted App 图标

![Melted App 图标](AppIcon.png)

复用 [融化 m 标识](../brand/mark.svg)：左侧略弯，中间短而圆润，右侧偏长下垂。暖纸白底板与褐色来自设计 token。1024 画布中底板为 864 × 864，保留透明外边距和轻量系统图标投影；不加文字、小徽章或强渐变。此处是 macOS 标准外观图标，未制作 iOS 图标目录或动态深色图标变体。

| 文件 | 用途 |
| --- | --- |
| [AppIcon.svg](AppIcon.svg) | 可检查、可缩放的矢量版本 |
| [AppIcon.png](AppIcon.png) | 1024 × 1024 RGBA 主图 |
| [AppIcon.icns](AppIcon.icns) | macOS 16/32/128/256/512 pt 及各自 2× 图，按尺寸直接渲染 |

生成器为 [generate-app-icon.swift](../../scripts/generate-app-icon.swift)，只依赖 macOS AppKit/CoreGraphics 与 iconutil。仓库根运行 swift scripts/generate-app-icon.swift；--check 在临时目录重建后核对。环境要求 RTK 时用 rtk proxy 包装。构建脚本复制 ICNS 并设置 CFBundleIconFile=AppIcon；Bundle ID 仍为 com.alkinum.melted。图标无需网络字体或第三方图片资源。

新轮廓的尺寸与原生显示见 [融化标识验证](../../.agents/validation/2026-10-17/melting-mark.md)；此前轮廓的 Finder 与原生关于面板证据保留在 [系统图标核对](../../.agents/validation/2026-10-17/app-icon-system.md)。
