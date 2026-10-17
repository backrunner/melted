# 黏稠融化与空状态间距验证

日期：2026-10-17，Asia/Singapore。此记录更新同日 `liquid-motion` 的第一版动效与间距结论。

这是早期 Contour 实现的历史快照。此目录的预览源码、构建脚本及 `Continuity.swift` 保留当时验证方法，不能用于现有 Field 实现。当前可运行的预览、几何测试和后续改良见[动画复核](../animation-audit/README.md)与[水渍渐隐](../splash-fade/README.md)；以下哈希与测试数仅对应当时构建。

## 调整

- 融化从边缘缓慢鼓起，形成厚实的圆润下垂，再在最后 14% 的积聚阶段明显收细。断开时，上方残液与下落液滴复用同一个轮廓，残液缓慢收回，下落拖尾逐渐变圆。
- 每轮确定位置、尺寸、长度和左右形态；释放时机与飞行时间也有差异。整滴及其飞溅期间不重新插值随机位置。上一轮残液完全收平后，下一轮才在新位置生成。空状态的位置范围限制在圆角内部，两侧窗格有独立相位。
- 空状态图形占位从 80×104 pt 改为 80×80 pt，图文栈间距从 20 pt 改为 16 pt。图块底部到标题布局区域由 54 pt 收紧为 26 pt；文字仍独立于动画，不随液滴上下移动。
- 空状态液滴经过文字后方到窗格底边，在底边短暂压扁、向两侧溅开并消退。图标下面不绘制水坑。连接背景沿用同一黏稠轮廓，碰撞位于底部液面。

## 当前构建

- 从当前 checkout 运行 `rtk proxy sh scripts/build-macos.sh`，产物 `build/Melted.app`，Bundle ID `com.alkinum.melted`，0.2.0 (13)，arm64；`codesign --verify --deep --strict` 通过。
- 产品主程序 SHA-256：`9d40374052b23ca8c06aef4f3b1c4f057b16f52269eb2f3fa7c1cfcf30a3a2ec`。
- 预览 `build/ViscousMeltPreview.app` / `org.melted.viscous-melt-preview`，直接编译当前 DesignSystem 源文件，ad-hoc 签名；不访问真实账户或网络。源码和预览哈希见 [SHA256SUMS](SHA256SUMS)。
- macOS 27.0.1 (26A434)，2× 截图；产品 1120×760 pt，预览内容区 1000×720 / 680×520 pt，另有 52 pt 原生标题栏；默认字号。
- 已退出旧产品进程，再从本次构建路径重新启动。核对未读空状态后恢复全部内容及之前选中的已读文章。

## 原生画面

| 场景 | 证据 |
| --- | --- |
| 浅色空状态，紧凑图文留白 | [截图](empty-light.png) |
| 深色窄窗，两轮随机滴落 | [截图](empty-compact-dark.png)、[16 秒连续画面](empty-compact-dark.gif) |
| 六个融化阶段，2× 轮廓检查 | [深色](formation-dark.png)、[浅色](formation-light.png) |
| 连接背景，窄窗 | [浅色](backdrop-compact-light.png)、[深色](backdrop-compact-dark.png)、[约 13 秒连续画面](backdrop-compact-dark.gif) |
| 当前产品内实际间距与下滴 | [阅读空态](product-reader-dark.png)、[未读双空态](product-unread-dark.png) |

GIF 来自 CUA 截取的真实原生窗口，空状态捕获 413 帧，连接背景捕获 356 帧；按实际捕获时间采样为 80 ms/帧并缩为 1×。GIF 的末尾会回到录像起点，不是代码周期边界。阶段图是共享 Canvas 的固定时间采样，放大轮廓并提高透明度以便检查，不冒充完整产品页面。

## 检查结果与边界

- `MeltedKit` 现有测试 11 项通过；macOS 现有测试 11 项通过。
- 设计 token 生成器 `--check`、静态设计检查和 `git diff --check` 通过。
- [Continuity.swift](Continuity.swift) 检查 600 个周期，随机位置、大小和长度在每个周期内保持固定，周期起点轮廓为零高度。18 组尺寸/长度/左右形态组合共采样 314802 个点，断开前后轮廓差异 0，残液收回与下一轮起点差异 0。这是几何连续性检查，观感仍由上述原生画面核对。
- 装饰层保持不响应输入、从辅助功能树隐藏；Reduce Motion 固定时间与相位为零。未切换系统 Reduce Motion 或进行 VoiceOver、iOS、macOS 14、全屏、200% 字号验收，不将这些记作通过。

当时从仓库根重建预览的命令（依赖已被替换的 Contour 源码，不适用于当前 checkout）：

```sh
rtk proxy python3 .agents/validation/2026-10-17/viscous-melt/build-preview.py
```

当时的几何检查命令（历史记录）：

```sh
rtk proxy swiftc -parse-as-library apps/apple/Packages/MeltedKit/Sources/MeltedDesignSystem/Motion/MeltedLiquid.swift apps/apple/Packages/MeltedKit/Sources/MeltedDesignSystem/Motion/MeltedLiquidContour.swift .agents/validation/2026-10-17/viscous-melt/Continuity.swift -o .local/viscous-melt-preview/check-continuity
rtk proxy .local/viscous-melt-preview/check-continuity
```
