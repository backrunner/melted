# 关于设置布局精简

日期：2026-10-17，Asia/Singapore。范围为关于分组中的许可按钮与版权行。

- “查看许可协议”“第三方声明”合并为同一行，右侧与信息字段边线对齐；复用共享次要按钮，最小高 32 pt、间距 12 pt。
- footer 精简为“© 2026 Melted contributors”；GPL 版本字段与完整许可、第三方声明资源仍保留。
- scripts/build-macos.sh 构建/Apple Development 签名通过，更新 build/latest/Melted.app，codesign --verify --deep --strict 通过。实际退出旧构建并启动新 App，Bundle ID com.alkinum.melted，0.2.0（2）；主程序 SHA-256：f083606a24c8454a0e7a75da1c0b1a148b58acbf204c9486c58f8adf80eb3e76。
- 真实 520 pt 宽设置窗口中，两个按钮单行靠右、文字完整，版权行不再换成多行说明。亮暗主题均检查，见 [深色](about-settings/dark.jpg)、[浅色](about-settings/light.jpg)。
- 实际点击两个按钮，分别显示 GPL 正文、第三方依赖正文，并通过“完成”关闭；本轮未重复完整长文滚动/选择验收。
- 恢复深色、100% 阅读字号，停留设置页的关于区域供查看，新构建保持运行。

本轮为布局/文案调整，未新增单元测试或重复全系统测试，不扩大为全页面、VoiceOver、iOS 或发行验收。
