# 账户设置按钮与说明精简

日期：2026-10-17，Asia/Singapore。范围为账户设置中的退出登录按钮和账户区说明。

- 退出动作复用 MeltedSecondaryButtonStyle，最小高 32 pt，沿用 10 pt 圆角、细边框与悬停/按下反馈；共享次要按钮按 destructive role 使用成对 danger 文字色。其他现有次要按钮未声明 destructive role，保持原有普通文字色。
- 移除账户区 footer 的“登录会话保存在本机钥匙串，应用不保存密码或 API Key。”常驻说明。
- 原有 logout 调用、连接状态条件、错误和 banner 展示不变；没有修改认证、钥匙串或会话逻辑。

## 验证

- scripts/build-macos.sh 编译/Apple Development 签名通过；最新产物复制到 build/latest/Melted.app，codesign --verify --deep --strict 通过。
- 实际退出旧构建并启动最新 App。Bundle ID com.alkinum.melted，0.2.0（2），主程序 SHA-256：29ef8602819b9894fe2df1786e66907e1ee82223a70d490cff904b6c839273ee。
- 真实设置窗口中，浅色/深色按钮的文字、边框、圆角和左边线正常，账户卡片之后直接进入关于分组；AX 保留“退出登录”按钮且已无被删除说明。见 [深色](account-settings/dark.jpg)、[浅色](account-settings/light.jpg)。
- 恢复深色、100% 阅读字号并停留设置页，最新构建保持运行。
- 视觉样式及文案修改未新增单元测试，未执行退出以免改变现有登录状态；本记录不声称已重新验收注销链路、完整键盘/VoiceOver、iOS 或全页面状态。

## 退出按钮右对齐补充

用户随后要求退出按钮也靠右：在原按钮外增加 HStack 与 Spacer，保持同一按钮样式及原退出回调；与关于区许可按钮右边线一致，UI 规范同步更新。以上左对齐图片保留历史状态。

- 重新构建/签名并实际启动 build/latest/Melted.app，主程序 SHA-256：1b44ebc13a007b76da1e08640899eb187641c7fa4c6d3586cee9bfdb9fd581c3；codesign --verify --deep --strict 通过。
- 520 pt 设置窗口亮暗主题均确认：退出按钮靠右，与下方第三方声明右边线一致，文字和边框完整。见 [深色右对齐](account-settings/right-aligned-dark.jpg)、[浅色右对齐](account-settings/right-aligned-light.jpg)。
- 恢复深色、100% 字号并停留账户/关于区域，新构建保持运行。纯对齐修改未新增测试或触发退出操作。
