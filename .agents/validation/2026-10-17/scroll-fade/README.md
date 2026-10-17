# 列表滚动渐隐验证

日期：2026-10-17，Asia/Singapore。验证对象是当前 checkout 新编译的原生 macOS App；开发样例内容来自已有本机服务器。

## 实现

- 内容行及“载入更多”采用共享 24 pt alpha 渐隐，顶部从分组标题下方开始，底部止于底栏上方。
- 随该方向隐藏内容的剩余距离连续降低遮罩强度；到达首尾或内容不足一屏时恢复清晰。
- 遮罩施加于行本身，固定分组标题、原生滚动条及底栏不参与。选中背景和边框整幅淡出，点击与 AX 语义保留。
- 增强对比度或减少透明度时不施加遮罩。共享 token 与参考页已同步。

## 构建身份

- 路径：`build/Melted.app`，Bundle ID：`com.alkinum.melted`，版本：0.2.0 (13)，arm64，固定 Apple Development 签名。
- macOS 27.0.1 (26A434)，1120×760 pt 窗口，截图 2240×1520 px；列表宽 360 pt，阅读字号 100%。
- 二进制 SHA-256：`ac2ddf1032f91fc300b23ef5d0a8027d10c46b2df74ed4f41792cf951dfb6c77`
- ContentListView.swift SHA-256：`645a253afa5a00dd01ff8efc15d34b2064dfe6d02d0047d6a70cb29032533335`
- ScrollEdgeFade.swift SHA-256：`98314cc5a7280bfc465241cfb1ee638f87e8e509e70c4d5b7f609882239b8ccb`

## 实际操作

| 场景 | 结果 | 截图 |
| --- | --- | --- |
| 浅色顶部 | 滚动条位置 0，第一条内容完整清晰 | [顶部](light-top.png) |
| 浅色中途 | 上下内容柔和淡出，分组标题、滚动条、底栏清晰 | [滚动中](light-middle.png) |
| 深色中途 | 同样渐隐，无浅色覆盖带 | [深色](dark-middle.png) |
| 深色选中行经过顶部 | 点击打开正文，背景与边框整幅淡出，分组标题清晰 | [选择](dark-selection.png) |
| 深色底部 | 滚动条位置 1，最后一条完整可读，底部渐隐消失 | [底部](dark-bottom.png) |
| 一条收藏 | 内容不足一屏，无多余渐隐 | [短列表](light-short-list.png) |
| 未读为空 | 无滚动遮罩，空态和底栏可读 | [空态](light-empty.png) |

最终恢复“全部”和验证前的深色主题。验证中已有本机会话曾失效，经原有钥匙串身份重新登录恢复；本次没有修改认证或服务器代码。

## 自动检查与边界

- `rtk proxy sh scripts/build-macos.sh`：通过，签名校验通过。
- macOS 包 `rtk proxy swift test`：10 项测试通过。
- 设计 token 生成器 `--check`、设计文档检查、`git diff --check`：通过。
- SDK 中核对单参数 `onGeometryChange` 支持 macOS 13 及以上；项目最低部署目标仍为 14。
- 未做 macOS 14 实机、iOS、VoiceOver、系统辅助设置、200% 字号或全屏运行验收；尝试窗口拖拽未改变实际尺寸，不记作最小窗口通过。当前七条样例无分页按钮，分页遮罩只完成源码与构建检查。
