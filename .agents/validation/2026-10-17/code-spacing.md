# 代码块末尾空行修复

日期：2026-10-17，Asia/Singapore。延续 [图标与代码渲染验收](code-and-icon.md)，本轮只修复代码块底部额外排出的空行。

## 原因与修改

swift-markdown 的 CodeBlock.code 包含最后一行的结束换行；直接交给 SwiftUI Text 会再排出一行空白。新增展示适配，只移除一个末尾换行（LF/CRLF/CR），然后执行原有高亮。刻意添加的空行、缩进和行尾空格仍保留；复制动作继续使用未经修改的 source，未改变高亮颜色、16 pt 内边距或滚动容器。

## 验证

- 共享 Swift 包 11 项测试通过，新增用真实 Markdown AST 验证末尾换行，并覆盖重复空行、缩进、行尾空格、LF/CRLF/CR、空代码与无末尾换行。
- scripts/build-macos.sh 构建并签名成功，最新产物复制到 build/latest/Melted.app，codesign --verify --deep --strict 通过。
- 实际退出旧构建并启动上述新 App，Bundle ID com.alkinum.melted，版本 0.2.0（2）；主程序 SHA-256：bd69b1019ac12725ce2b18c212736633475adf54285d8da06e56ca5ef330c34a。
- 同一公开排版样例下，Swift/TypeScript/JSON/未知语言的底部多余空行消失，亮暗样式保留，代码上下留白均衡。见 [修复前深色](code-spacing/before-dark.jpg)、[修复后深色](code-spacing/after-dark.jpg)、[修复后浅色](code-spacing/after-light.jpg)。
- 原生字号滑块 AX 确认为 200%；紧凑阅读模式下，TypeScript 的两行代码未多排末尾空行，横向滚动条操作到 1 可见长行末尾，工具行不移动。见 [窄窗 200% 深色](code-spacing/after-compact-200-dark.jpg)。
- TypeScript 复制动作后 AX 显示“代码已复制”；本轮没有读取剪贴板逐字节比较，复制仍使用原 source 的结论来自代码核对。
- 结束时恢复深色、100% 阅读字号及标准双栏窗口，最新构建保持运行。

本轮没有改动服务端或依赖，未重复全系统测试；未扩大为全页面、iOS、完整 VoiceOver、最低系统或发行验收。
