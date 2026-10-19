# 连接流程滚动视口 · 2026-10-19

连接页的滚动容器现在位于上下液面之间。容器外预留液面深度、4 pt 波幅及 24 pt 间隔，扣除系统 safe area；裁切和滚动渐隐在这个中间视口内生效。长内容仍完整保留，原有底部光学留白按缩短后的视口高度计算。背景与布局共用液面几何，动画时序与轨迹没有改动。

## 当前构建

- 源码构建：`sh scripts/build-macos.sh`，Apple Development 签名及严格签名检查成功
- 产物：`/Volumes/BRData/projects/melted/build/Melted.app`，Bundle ID `com.alkinum.melted`，0.2.0 (13)
- 可执行文件 SHA-256：`cfcd75fc4689ffa0422e058a7e34f1330544c65c0cd0f609830e651dc7d0b9de`
- macOS 27.0.1 (26A434)，原生 SwiftUI 窗口；按准确 App 路径重启后操作
- 主题：应用深色及浅色；系统减少动态/透明度未另外切换

## 实际窗口操作

通过隔离的 Apple Container 合成测试服务 `127.0.0.1:8422` 加载长处理声明，没有提交模型设置或调用真实外部模型。使用应用的“紧凑阅读窗口”命令（内容目标 680×520 pt），实拍包括系统窗口栏：深色 1360×1096 px；连接态在先前工作台 toolbar 消失后，部分浅色截图为 1360×1116 px。

- [深色顶部](compact-dark-top.jpg)：长声明超过视口，控件在液面下方开始
- [深色滚动底部](compact-dark-ready.jpg)：滚动条到 1，信任开关已勾选，登录按钮完整可见，与底部液面分开
- [浅色顶部](compact-light-top.jpg)及[浅色底部](compact-light-bottom.jpg)：相同长声明在上下边界裁切/渐隐，登录按钮可达
- [浅色入口](compact-light-landing.jpg)：短表单保持居中和品牌顺序
- [标准窗口](standard-light.jpg)：1120×760 pt 内容目标下全表单可见；截图右侧超出当前显示器可捕获范围而呈白色，仅作为可见表单的辅助证据，不计作完整标准窗口截图验收
- 在隔离测试服务器完成了一次已有本机身份的登录，随后退出该测试账户；未复现用户截图中的 Keychain 错误，不能把此记录称为该错误状态验收

验收后退出测试 App，恢复启动前导出的 UserDefaults（原服务器 `127.0.0.1:8421`、原账户与深色外观），停止测试容器并重启相同构建；原账户 7 条内容正常显示。

## 自动检查

- [macOS 测试](macos-tests.log)：28 项通过
- [设计系统测试](design-system-tests.log)：4 项通过，覆盖既有液滴接触与收回几何
- [设计检查](design-check.log)：78 Markdown / 568 链接 / 34 颜色对比通过（不等于原生验证）
- [token 生成一致性](tokens-check.log)：通过
- `git diff --check`：通过

新增连接背景数值进入共享 token，同时补齐上一轮设置详情标签宽 72 pt 的 token 源，避免生成器覆盖既有 Swift 数值。没有修改服务端协议或执行后端全量测试；iOS、最低系统及完整辅助功能矩阵未验证。
