# 融化标识重绘验证

日期：2026-10-17。按用户最后的修订重新绘制整个 m：左侧略带弧度，中间恢复普通短圆头笔画，右侧收窄后拉长下垂。三笔通过平滑曲线连成一个轮廓，不再使用球状中段或明显的腰部折弯。

## 资产与构建

- 唯一几何源：[mark.svg](../../../assets/brand/mark.svg)。品牌生成器同步 README 亮暗 lockup 与 SwiftUI MeltedMark，图标生成器同步 SVG、1024 PNG、多尺寸 ICNS。
- 保留暖纸白、褐色、原生字标以及现有品牌位置；工作台无品牌条。设计说明同步至 UI 规范、ADR-022 和资产 README。
- 当前应用为 build/latest/Melted.app，版本 **0.2.0（8）**，Bundle ID **com.alkinum.melted**，CFBundleIconFile=AppIcon。过程中提升构建号以区分各轮预览，并避免系统继续显示相同版本的图标缓存。
- 可执行文件 SHA-256：94a2553f4259b83559d4ec7f3df499230a70d94b1caaabf0e30373cd51b05392。
- 源 ICNS 与包内 ICNS SHA-256 均为 6765c8922f5d35e9b9de9e8e0013f662e223cceb1acf5b6e6d70c57b1d746d78。
- 品牌与 App 图标生成器 --check 通过；原生构建及打包时的 codesign --verify --deep --strict 通过。未引入依赖、修改账户逻辑或重新执行后端测试。
- 设计静态检查通过：43 个 Markdown、288 个本地链接、5 个 JSON 示例、34 组颜色；设计 token 生成一致性与 git diff --check 通过。

## 本轮检查

| 场景 | 结果与证据 |
| --- | --- |
| ICNS 16、32、128 像素 | 从最终 ICNS 提取并逐一目视检查，m 的两处字腔可辨，右侧下垂轮廓保留；16 像素下细微弧度弱化。见 [16](melting-mark/icon-16.png)、[32](melting-mark/icon-32.png)、[128](melting-mark/icon-128.png) |
| 浅色连接页 | 36 pt 正式路径与文字配合正常，无裁切；[实际窗口](melting-mark/connection-light.jpg)，同步作为 README 连接入口截图 |
| 深色连接页 | 使用深色 accent，同一形状、位置与尺寸；[实际窗口](melting-mark/connection-dark.jpg) |
| 系统原生关于面板 | 新图标与版本 0.2.0（8）实际显示；[原生截图](melting-mark/about.jpg) |
| 检查后恢复 | 恢复深色主题，使用既有身份登录同一本机服务器，原有 7 条内容正常返回；未创建新身份或改动内容 |

连接页截图为 2240 × 1520 像素；关于面板为 568 × 332 像素。截图是当前原生窗口，资产预览不混称运行截图。[256 像素图标预览](melting-mark/icon-256.png)来自最终 ICNS。

此前系统图标记录保留旧轮廓的当时事实；本轮未重新核对 Finder、Dock、Launchpad、iOS、最低系统或完整辅助功能矩阵。Apple Development 本地签名不等于 Developer ID 公证发行。
