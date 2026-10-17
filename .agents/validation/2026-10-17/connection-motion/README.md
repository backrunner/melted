# 连接按钮动效修复

2026-10-17，macOS 27.0.1 (26A434)，arm64。

## 触发路径与修复

源码中共享按钮使用三个 `.animation(value:)` 包住整棵 label/background 子树；点击连接会同时触发按压释放、禁用、进度插入和标题变化。连接页面又同时淡出旧表单、淡入新表单。这些事务可把标签布局与按钮位置变化一起插值，是本次修复针对的动效传播路径。未将源码推断描述为成功捕获原始偶发闪帧。

- 共享主次按钮改用 scoped animation，仅动画化背景亮度/透明度、按压缩放及启用透明度，不向标签的布局传播。
- 连接步骤旧表单立即移除，新表单用 220 ms opacity 淡入；内部 transaction 清除继承的布局动画，避免旧主按钮继续参与转场。
- 连接与登录进度明确使用圆形、小尺寸、固有尺寸；标签先按固有尺寸布局，再填满固定高的按钮。移除进度插入的 scale 转场。
- 保留点击、回车、禁用、防重复提交及减少动态效果分支。SDK 中 scoped animation 支持 macOS 14，与项目最低系统一致。

## 原生验证

使用 `.local/connection-notice-preview` 中的隔离 WorkspaceClient 样例，复制当前 macOS 源码（替换 App 入口）并链接当前共享设计系统；不请求外部网络或操作真实账户。窗口内容区分别为 900×760 pt 和 680×520 pt，另含 52 pt 标题栏；截图为 2×。样例不是服务端集成验证。

| 场景 | 实际结果 | 证据 |
| --- | --- | --- |
| 修复前延迟连接 | 捕获原有加载态，未捕获用户描述的瞬间横向闪帧 | [修复前加载态](before-loading.png) |
| 修复后快速返回 | 浅色常规窗口初次连接及 3 次往返均进入确认页，完成后没有残留连接按钮 | [浅色确认](after-fast-light.png) |
| 深色紧凑快速返回 | 3 次往返通过，其中一次用回车提交；完成后只有当前步骤按钮 | [深色确认](after-fast-compact-dark.png) |
| 8 秒延迟返回 | 等待中按钮/字段同宽，圆形进度与文字居中，返回后进入确认页 | [等待中](after-loading-compact-dark.png) |
| 连接失败 | 连接按钮恢复可用，失败提示就地显示 | [失败](after-failure-compact-dark.png) |
| 失败后再次提交 | 提示清除，重新进入禁用的加载状态；之后样例被重置，未把第二次请求终态计作验证通过 | [再次提交](after-retry-loading-dark.png) |

连续截图第一张在点击返回后约 764 ms 才完成，晚于 220 ms 转场；保留代表性完成态，不把它们当作动画每帧或“偶发问题绝不再现”的证明。原始偶发闪帧尚无逐帧复现证据。iOS、macOS 14 实机、VoiceOver、系统减少动态效果开关未做运行验收。

## 构建与检查

- 当前产品 `build/Melted.app`，`com.alkinum.melted`，0.2.0 (13)，重新构建及签名校验通过；已退出并重新启动，恢复已有 7 条内容。
- 产品 SHA-256：`1b6951e5a4ffd4425e5824dd10699af0017ac7d2f878c2ad96313f913fd286ed`
- 修复前样例 `build/ConnectionMotionBefore.app`，`org.melted.connection-motion-before`，SHA-256：`7035f746b17b5512851788d662e0454e1321e13ae23cb069f0661d2c29c6b405`
- 修复后样例 `build/ConnectionMotionAfter.app`，`org.melted.connection-motion-after`，SHA-256：`644dc93a8fe263eecbff0319e95948a4d9d960bdbc60d15f84435ae6d608057f`
- MeltedButtonStyles.swift SHA-256：`14ac26e0e01817f6ab71ca3958ba822b0bd2039ca421b1eb32637331cfeee1f7`
- ConnectionView.swift SHA-256：`db3e1b44dd7b6561b10e538a4820ff40151e0fe7b94646a542bb9def3bb72345`
- `rtk proxy swift test`：11 项通过，覆盖现有连接与会话状态回归；不是动画逐帧测试。
- 设计文档检查及 `git diff --check` 通过。
