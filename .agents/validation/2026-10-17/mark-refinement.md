# 品牌线条重绘

日期：2026-10-17。保留连续、圆润的小写 m 结构，统一双拱节奏与圆滑连接；中间笔画收细并加入轻微弧度，右侧保持适度下垂。整体比例更紧凑，使用原有暖白与褐色。

## 资产与构建

- 唯一几何源仍为 [mark.svg](../../../assets/brand/mark.svg)。SwiftUI 路径、README 亮暗字标与 App 图标由同一源生成。没有引入位图作为正式标识，也未修改工作台品牌位置。
- 品牌、App 图标生成器 --check 通过。scripts/build-macos.sh 构建与 Apple Development 签名通过，替换应用后 codesign --verify --deep --strict 通过。
- 设计静态检查通过：45 个 Markdown、302 个本地链接、5 个 JSON 示例、34 组颜色（最低 4.71:1）；git diff --check 通过。
- 实际启动 build/latest/Melted.app，Bundle ID com.alkinum.melted，版本 **0.2.0（12）**。设置与系统关于面板均显示新构建号。
- 可执行文件 SHA-256：cfcc281289d752f7c58dade9760600ea6fe9f74745377dbd7cce0817bf12e9f5。
- 正式与包内 ICNS SHA-256 一致：ff2d9ae949ddcf6c353d968763ebde8bb1f6a70f4d05d01efa5eefe4e8a7cd02。

## 目视与原生检查

| 场景 | 结果 |
| --- | --- |
| ICNS 小尺寸 | 从最终 ICNS 提取 [16](mark-refinement/icon-16.png)、[32](mark-refinement/icon-32.png)、[128](mark-refinement/icon-128.png) 像素检查，字腔保持开放；16 像素下细微弧度弱化。[256 像素预览](mark-refinement/icon-256.png)用于查看轮廓 |
| 浅色连接页 | 36 pt 品牌标识与字标组合正常，无裁切；[原生窗口](mark-refinement/connection-light.jpg)，同步为 README 当前连接页截图 |
| 深色连接页 | 同一路径使用深色 accent，间距与形状正常；[原生窗口](mark-refinement/connection-dark.jpg) |
| 原生关于面板 | 系统显示当前图标与版本 0.2.0（12）；[原生截图](mark-refinement/about.jpg) |
| 状态恢复 | 深色、100% 阅读字号，既有本机身份重新登录后原有 7 条内容正常返回；新版保持运行 |

系统 macOS 27.0.1（26A434）。连接窗口截图为 2240 × 1520 像素，关于面板为 568 × 332 像素。当前检查限于品牌与图标，不代表所有页面、最低系统、iOS、完整辅助功能、Finder/Dock 或公证发行验收。没有重跑不受影响的后端测试。
