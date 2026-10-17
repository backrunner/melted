# 触底水渍渐隐

2026-10-17，按用户反馈将滴落后的水渍改为逐渐透明，完全透明后才清理。

- 触底后的前 320 ms 保留飞溅；之后用 1.33 s smoothstep 淡出。
- 水渍摊开为浅薄轮廓，收尾保持形状，不再将高度压到零后直接移除。
- 轮廓、水面和小水珠合成后统一淡出，重叠部分不会产生较深接缝。形成、下落及触底接续保持原有时序。
- 连接页与空态共用 `MeltedLiquid.Splash`。

## 构建与检查

- macOS 27.0.1 (26A434)，arm64；产品窗口 1120×760 pt，2× 截图。
- 从本次源码执行 `sh scripts/build-macos.sh`；Bundle ID `com.alkinum.melted`。
- 当前产物：`build/Melted.app`，可执行文件 SHA-256 `e3e113d0b8c5c856139b2647345f1cb2296481561f66c7c1e824d766cea85029`。
- `swift test`（MeltedKit）：15 项通过，包括水渍透明度单调下降、移除前轮廓仍在但透明度小于 0.001、截止时透明度为零，以及原有触底连续性检查。
- 设计静态检查与 `git diff --check` 通过。命令均按仓库约定使用 `rtk proxy`。

## 原生画面

- [产品深色空态](splash-fade-dark.gif)：退出旧进程后启动新构建，连续采集 16.1 s / 183 帧；观察两个滴落周期，底边水渍逐渐淡出，没有末帧突然移除。[触底局部逐帧](empty-dark-contact-sheet.png)
- [浅色空态隔离样例](splash-fade-empty-light.gif)：使用本次产品源码和共享组件构建 AnimationAudit，采集 10.0 s / 116 帧；验证水渍保留浅薄形状并渐隐。[触底局部逐帧](empty-light-contact-sheet.png)
- [浅色连接页局部连续画面](connection-light-contact-sheet.png)：同一隔离样例采集 12.1 s / 143 帧，表中每约 500 ms 抽取一次；局部飞溅淡回已有水面，无残留暗边。
- GIF 按真实截图时间以 80 ms 间隔取样，仅用于视觉复核，不作为帧率或性能测量。

产品已恢复到“全部”的 7 条已有内容；隔离样例已退出。未修改账户或系统外观设置。本次未重新验证 Reduce Motion、VoiceOver、iOS 或最低系统版本，也未提交或推送。
