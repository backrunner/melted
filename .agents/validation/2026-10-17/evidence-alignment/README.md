# 阅读依据字段对齐

2026-10-17：来源按钮内部使用 firstTextBaseline，并由文字显式提供基线，穿过 Button / HStack / VStack 传给元信息 Grid。修复“依据”与“1 个来源 / 收起来源”的细微垂直错位，不使用固定偏移补偿。

- 当前源码 `rtk proxy sh scripts/build-macos.sh` 构建、签名校验通过；重新启动 `build/Melted.app`，Bundle ID `com.alkinum.melted`，0.2.0 (13)。
- 产品二进制 SHA-256：`0d492fee5d006b9ea4752060bbb9718ff9463a94c5f0bf7a8a93794bb98b7b95`。
- macOS 27.0.1 (26A434)，实际产品窗口 1120×760 pt，深色，默认 100% 阅读字号，2× 截图。
- [深色收起](dark-collapsed.png)、[深色展开](dark-expanded.png)：实际产品中的社区步行样例，“依据”与按钮文字基线一致，展开内容保留字段列对齐。
- [浅色收起](light-collapsed.png)、[浅色窄布局展开](light-compact-expanded.png)：隔离原生样例 `build/EvidenceAlignmentPreview.app` 直接编译当前 ReadingMetadata / ReadingEvidence，使用当前编译的共享模块；600 / 300 pt 内容宽，来源说明正常换行，未覆盖产品外观偏好。
- `git diff --check` 通过。纯布局修复未新增实现镜像测试；未进行 iOS、VoiceOver 或完整辅助设置验收。
