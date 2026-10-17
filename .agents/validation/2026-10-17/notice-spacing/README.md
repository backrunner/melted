# 错误提示间距精简

2026-10-17：说明到操作行由 12 pt 收紧为 4 pt；“技术详情”开关从 32 pt 改为 24 pt。展开内容独立保留 8 pt 间距，恢复按钮仍为 32 pt。外层 16 pt 内边距与正文对齐保留，示例收起卡片减少 16 pt 高度。

## 原生验证

- 当前源码编译的 `build/NoticeSpacingPreview.app`，Bundle ID `org.melted.notice-spacing-preview`；隔离 stub 驱动真实 WorkspaceModel / SwiftUI 组件，不访问实际服务器或账户。
- macOS 27.0.1 (26A434)，内容区 680×520 pt，另含 52 pt 原生标题栏，2× 截图。
- [深色收起](dark-collapsed.png)：说明与开关紧密衔接，文字可读，无原来的大块垂直留白。
- [深色展开](dark-expanded.png)：点击开关展开 -1004，AX 标记已展开，详情有独立留白。
- [浅色收起](light-collapsed.png)：切换浅色并收起，AX 标记已收起，无隐藏详情占位。
- 样例 SHA-256：`538f267cac0ea069b8170c14c7c41beac6a0e4011f928d2a044d3ee1703cdfb1`

## 检查

- `rtk proxy sh scripts/build-macos.sh` 构建与签名校验通过，产品 `com.alkinum.melted`，0.2.0 (13)；已重新启动本次构建。
- 产品 SHA-256：`5c4689976b42694ea60ca55df557162a8d7449ed3d8211a3caddbc262c877b3d`
- token 生成器 `--check`、设计文档检查及 `git diff --check` 通过。
- 本次仅调整原生布局，未新增或重复运行行为测试；未进行 iOS、VoiceOver、系统大字号运行验收。
