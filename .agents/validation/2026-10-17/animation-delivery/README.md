# 动画改良提交整理

2026-10-17，Asia/Singapore。将本轮动画改良及复核中修复的客户端交互分批整理；服务端采集、契约、部署配置和对应文档不纳入本次提交。

## 提交边界

| 批次 | 内容 |
| --- | --- |
| 液滴与共享设计 | 连续积聚/断开/触底、空态定位、水渍渐隐、共享组件尺寸及液体几何测试 |
| 连接流程 | 按钮视觉反馈与布局分离、切页淡入、错误详情与恢复动作、会话失效后保留受支持的登录方式 |
| 列表反馈 | 滚动边缘渐隐、按服务器序号触发高亮、分页信号合并、刷新失败保留游标重试及阅读位置稳定 |
| 搜索与阅读 | 搜索原生 sheet、亮暗搜索框、有效条件摘要及来源按钮基线 |
| 文档与证据 | 设计规则、当前能力、原生连续画面、历史验证边界及本记录 |

## 本次复核

- MeltedKit `swift test`：15 项通过，其中 4 项液体测试。
- macOS `swift test`：15 项通过。
- 构建脚本 Python 单元测试：6 项通过。
- Swift token、品牌资产和 App 图标生成一致性检查通过；设计文档静态检查、补丁空白检查通过。
- 重新执行 `sh scripts/build-macos.sh`，固定 Apple Development 签名及严格签名验证通过。产物 `build/Melted.app`，Bundle ID `com.alkinum.melted`，版本 0.2.0 (13)，arm64。
- 本次签名后可执行文件 SHA-256：`13a4cd1750e3c0a2b7a78c88e04d3dd4381bf485df4cafe6fef4455ca4ea3300`。这是本次重建产物，先前验证记录保留各自当时的构建哈希。
- 退出旧进程并启动本次构建；恢复原有 7 条内容，⌘F 打开搜索并自动聚焦，Esc 关闭后返回原列表。[本次构建截图](search-final-build.png)
- 此轮没有改动动画实现，连续动作与深浅色证据沿用本会话的[动画复核](../animation-audit/README.md)和后续[水渍渐隐](../splash-fade/README.md)。早期 liquid-motion / viscous-melt 的 Contour 验证脚本已明确标为历史样例，当前重现入口为 animation-audit 与 MeltedDesignSystemTests。

全部命令按仓库约定使用 `rtk proxy`。本次是客户端交付检查，未重新运行不属于提交范围的服务端测试；仓库没有 GitHub Actions 工作流，不声称远端 CI 通过。完整辅助功能、最低系统、iOS 与性能基准的未验证边界仍按原记录保留。
