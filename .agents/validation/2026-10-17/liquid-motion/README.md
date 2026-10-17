# 液滴与空状态动效验证

日期：2026-10-17，Asia/Singapore。

这是早期 Contour 实现的历史快照。此目录的 `Preview.swift` 与 `build-preview.py` 保留当时采样方法，不能用于现有 Field 实现。当前可运行的预览、几何测试和后续改良见[动画复核](../animation-audit/README.md)与[水渍渐隐](../splash-fade/README.md)；以下画面和测试数仅对应当时构建。

## 实现

- `MeltedLiquid` 统一积聚、拉长、断开、加速下落、触底压扁、两侧飞溅、小液珠回落与扩散消退；使用同一个周期计算飞行与碰撞。
- 用曲线直接绘制清晰轮廓，移除会抹掉小液滴的整层模糊。连接背景的六条滴落通道位于表单两侧，碰撞高度来自实际底部液面。
- 每个组件保存随机种子，每轮改变尺寸、长度、横向落点、释放/飞行时间、飞溅左右比例；飞行期间固定，跨周期只在根部接近收回时平滑插值。
- 空状态保留原来 80×104 pt 图形占位、20 pt 图文间距与原文字位置。用锚点定位独立背景层，液滴穿过文字后方到窗格底边，不在图标下面绘制水坑。列表落点止于底栏上方，阅读区到窗格底边。
- 装饰层不接收输入、不参与辅助功能。Reduce Motion 保留原有环境判断，固定在没有飞行/飞溅的静态起点。

## 构建

- 产品：从当前 checkout 运行 `rtk proxy sh scripts/build-macos.sh`，`build/Melted.app`，`com.alkinum.melted`，0.2.0 (13)，arm64，Apple Development 签名与严格校验成功。
- 产品主程序 SHA-256：`0d278272c81a83c0f4e21f48fcdd3e5986d578b1b412ef9bb10f4a7f00613a12`。
- 原生组件预览：`build/LiquidMotionPreview.app`，`org.melted.liquid-motion-preview`，ad-hoc；直接编译当前 DesignSystem 的源码文件，未复制改写实现。
- 预览主程序 SHA-256：`4743eceab9f7a57d0374b02bfb86cf615223a09c8d25c9499ee0937ad8b1f4c5`。
- `MeltedLiquid.swift` SHA-256：`3ae4c271df4a6b4d6b89b1ea529316b7010e274dc52363197af3f165c90b648f`。
- `MeltedBackdrop.swift` SHA-256：`8dd1511bbd0bb45010952fda72e1d5c26a9680546f348c64172d9ce4f5d4848a`。
- `EmptyState.swift` SHA-256：`d52c530a64c9b7e1cc84ad613ad54106e060695cf274f7f2fb9f131b92f9c9fd`。
- macOS 27.0.1 (26A434)，2× 截图。预览内容区 1000×720 / 680×520 pt，加原生 52 pt 标题栏；产品窗口 1120×760 pt，默认阅读字号。
- 预览可从仓库根运行 `rtk proxy python3 .agents/validation/2026-10-17/liquid-motion/build-preview.py` 重建。

## 原生检查

| 场景 | 证据与结果 |
| --- | --- |
| 内页浅色，双窗格 | [截图](empty-light.png)，图文保持原有布局，无图标下方水坑 |
| 内页深色、紧凑 | [截图](empty-compact-dark.png)、[8 秒连续画面](empty-compact-dark.gif)，液滴穿过说明区域后到达底边，随后飞溅消退 |
| 连接背景浅色、紧凑 | [截图](backdrop-compact-light.png)，液滴位于两侧，中央内容保持清晰 |
| 连接背景深色、紧凑 | [截图](backdrop-compact-dark.png)、[10 秒连续画面](backdrop-compact-dark.gif)，多条通道错开下滴，碰撞在实际底部液面发生 |
| 共享液滴关键阶段 | [深色](stages-dark.png)、[浅色](stages-light.png)，原生 Canvas 对共享绘制器做固定时刻采样；这是组件阶段验证，不是完整产品截图 |
| 最新产品重新启动 | [阅读空态](product-reader-dark.png)，恢复 7 条原内容；图标与标题/说明回到修改前的位置 |
| 产品未读空态 | [列表空态](product-unread-dark.png)，未读为 0，列表与阅读两侧均显示动画；核对后恢复“全部” |

GIF 来自 CUA 逐帧截取的真实窗口，按捕获时间采样为 80 ms/帧并缩至 1×；不是生成画面。预览只用于视觉验证，不发网络请求或访问真实钥匙串。

## 自动检查与边界

- MeltedKit `swift test`：11 项通过。
- macOS `swift test`：11 项通过。这些是已有回归测试，不冒充液体视觉自动验收。
- 设计 token 生成器 `--check`、静态设计检查、`git diff --check`：通过。
- 产品验证为真实 macOS 深色窗口；组件预览补充亮暗、窄窗和连续动作。未进行 iOS、macOS 14、VoiceOver、系统 Reduce Motion 开关、全屏与 200% 字号验收。
