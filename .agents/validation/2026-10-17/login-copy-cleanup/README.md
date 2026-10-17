# 登录说明精简

2026-10-17：按用户要求，删除登录按钮下方“身份密钥保存在系统钥匙串，不代表 Apple 账号”，不改变认证逻辑。

- 当前产品重新构建及签名校验通过，Bundle ID `com.alkinum.melted`。
- 产品二进制 SHA-256：`126eca6a9b39a90609a9a080058ccd4804d67d491175f3eb58876f0d1acc0534`
- 在复用实际 ConnectionActions 的隔离原生样例中检查：浅色 680×520 pt 内容区，无该文字或额外占位；截图另含原生标题栏。
- [实际窗口](compact-light.png)。验证方法与隔离边界见 [前一轮记录](../connection-notice/README.md)。这不是服务端认证验收。
- `git diff --check` 通过；本次仅删除说明文字，未新增或重复运行行为测试。
