# 插件订阅面板与折叠卡片原生验收

日期：2026-10-17。macOS 27.0.1 / Apple Silicon，Melted `com.alkinum.melted` 0.2.0 (13)。
当前 checkout 经 `sh scripts/build-macos.sh` 重新构建并退出旧进程后启动 `build/Melted.app`。
最终可执行文件 SHA-256：`67a0503cfe8db282cad7a9a804bc49630a03efaaa61cb3c99db60fe0cd6b0a43`。

## 修改

- RSSHub 与 RSS / Atom 各使用一个独立圆角折叠卡片；复用 InfoCard 的轻边框/配色。
- `MeltedDisclosure` / `MeltedDisclosureToggle` 共用箭头、点击区域、AX 展开状态和 220 ms easeInOut 动画；减少动态效果时不做动画。插件、服务器插件、采集设置、连接技术详情与阅读来源复用该交互。
- 每个插件只有一个添加入口，SourceEditor 内选择建议来源或手动填写；删除单独的 SourceBatchEditor。输入与勾选分开保存，批量提交后冻结 payload 和幂等键，已有部分失败重试测试继续覆盖模型行为。
- 名称与目标字段优先显示，其他配置归入采集设置；字段沿用主窗口共享控件、焦点与颜色。
- 移除“选择一行查看采集状态…”与“原始资料暂不自动生成资讯”两处说明。
- 操作标题/菜单文字与普通单元格共用水平边距，菜单使用无额外原生缩进的 plain button style。单元格与文字设置完整 AppKit tooltip，并保留全文辅助信息。

## 实际操作

本机开发账户预置两条暂停的临时 Feed 来源；本轮不发起采集。验证结束清理这两条临时来源，不修改其他订阅。手动填写和多选的验收输入均取消，不提交。

- 760×520 pt 来源面板：深/浅色均检查表头、文本、管理菜单对齐、长名称/URL省略、底栏和圆角卡片。
- 收起 RSSHub 时 RSS / Atom 保持展开；服务器插件可独立展开；取消添加/编辑后仍保留本面板各卡片展开状态。
- 620×520 pt 添加面板：两插件各仅一个菜单入口；手动填写保留名称和目标字段，采集设置可展开并滚动访问全部字段。
- 填入名称和 URL 后切到建议列表、勾选，再切回：原值仍在；回到建议列表仍为“已选 1 个订阅”，提交按钮可用。
- RSSHub 勾选两条后搜索豆瓣，已选数量保持 2；Feed 已订阅建议禁选。
- 点击 BBC 行的管理菜单后进入对应来源编辑，名称和 URL 正确，非其他行。
- 已恢复原深色主题和 100% 阅读字号。

## 截图

- [深色来源卡片](sources-dark.png)、[独立折叠](independent-cards-dark.png)、[浅色来源卡片](sources-light.png)
- [深色手动表单](manual-dark.png)、[浅色手动表单](manual-light.png)
- [建议搜索与多选](suggestions-light.png)、[采集设置展开并滚动](collection-settings-light.png)

截图来自当前原生 App，未经拼接/渲染替换。共享工作区另有阅读滚动效果改动，构建包含这些本地改动；本提交不包含它们。

## 检查与边界

- `swift test --package-path apps/macos`：20 项通过（最终卡片版本）；包含部分成功重试、行上下文操作、重复动作与删除迟到结果测试。
- `swift test --package-path apps/apple/Packages/MeltedKit`：19 Core + 4 DesignSystem 测试通过。卡片 presentation 在此后加入，并随最终 macOS 测试/构建编译通过。
- App 构建、`git diff --check`、设计静态检查通过。无服务端契约变更，本轮未重跑后端或真实 feed 采集。
- CUA 没有原生 hover 移动接口；已配置全文 tooltip、检查 AX 全文与省略显示，未捕获悬浮提示弹窗，不将点击/选择视作 hover 验证。
- 已执行展开/收起；动画时长和减少动态效果分支经代码审查。静态截图不证明逐帧流畅度，未执行系统减少动态效果切换、VoiceOver、200% 字号、最低支持系统或 iOS 实机验收。
