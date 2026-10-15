# UI 模块、连接入口与固定开发签名

日期：2026-10-15，Asia/Singapore。macOS 27.0.1 (26A434)，Apple Silicon。当前源码构建 `build/Melted.app`，0.2.0 (2)，Bundle ID `org.melted.desktop.dev`，Apple Development 签名，目标 macOS 14。

最终可执行文件 SHA-256：`71d2a908b34280f36dc4e2cae2477a234afc98498abc320d7986438903be06af`。

## 实现

- App 负责窗口、菜单与 toolbar；State 通过 `WorkspaceClient` 协调请求和 mutation；Connection、Library、Reading、Search、Settings 各自组织功能组件。详见 [客户端模块说明](../../../apps/macos/README.md)。
- `MeltedDesignSystem` 统一 Logo、底栏、连接按钮和错误条；token 源新增连接与底栏尺寸，生成 Swift 并检查参考页一致性。底栏不再使用中性灰材质及竖线；计数右对齐，品牌与行内文字共享边距。
- Landing / 确认页共用 440 pt 内容宽、32 pt 页边距、28 pt 分组间距及 40 pt 控件高度。移除玻璃圆形、阴影和无效 GitHub 帮助地址；提供本地展开的服务器说明。错误不截成两行，深色主按钮使用 accentText。
- 启动恢复只执行一次，并发登录只发起一次。右键 mutation 使用点击项 ID；自动已读跟随选中任务取消，不能修改新选择。凭据错误保留真实含义，不映射为“可继续使用”。设置读取真实版本，阅读滑块支持 100–200%。
- 搜索 toolbar 改为原生 Label 按钮，解决旧自定义布局在实际窗口中被隐藏的问题；快捷键仍由 App 命令处理。
- 签名脚本将开发身份固定在被忽略的 `.local/macos-signing.json`；没有唯一身份或已固定证书不可用就失败。临时签名须显式选择，不自动降级；不导出私钥、不改 Keychain ACL、不迁移或删除已有密钥。

## 自动与构建验证

- macOS 构建成功，`codesign --verify --deep --strict` 通过。实际签名 Authority 为本机 Apple Development，TeamIdentifier 与证书一致。
- `codesign -d -r-` 的 designated requirement 从 `cdhash` 改为 Bundle ID + Apple 信任锚 + 开发证书标识；连续源码重建后 requirement 相同。
- Swift 共享包 6 项测试通过；工作台 4 项回归测试通过，覆盖并发／重复 bootstrap、重复登录、右键目标、取消阅读不误标其他内容。测试使用隔离的 UserDefaults 和 actor stub，不访问真实 Keychain。
- Python 签名选择 6 项测试通过，覆盖唯一开发身份、固定身份、新增其他证书、证书缺失、歧义与显式临时签名。
- token / Logo 生成一致性与设计静态检查通过。服务端本轮未修改，前一轮双后端 17 项验证见 [开源准备记录](open-source-brand.md)。

## 原生运行证据

以下来自 CUA 操作的真实 `build/Melted.app`，不是浏览器 mockup 或 SwiftUI ImageRenderer。内容为仓库公开开发样例。

| 场景 | 结果与证据 |
| --- | --- |
| 重编译后的启动恢复 | 固定签名构建启动后直接恢复本机账户和 6 条内容；再次重编译重启也成功。期间未操作系统凭据授权 UI |
| 注销并重新登录 | 当前本地开发账户正常退出，确认同一服务器并使用原有本机密钥重新登录成功；样例内容仍在 |
| Landing | 浅色、深色、自动输入焦点、Return 提交和非法地址错误均实际检查；[浅色窗口](../../../assets/screenshots/landing-light.png) |
| 最小窗口 | 通过 View 菜单设 680×520 pt 内容区；[深色 Landing](ui-modules/landing-dark-compact.png)与[服务器确认页](ui-modules/connection-dark-compact.png)字段、动作和说明完整 |
| 阅读器 | 1120×760 pt 内容区；[浅色](../../../assets/screenshots/reader-light.png)、[深色](../../../assets/screenshots/reader-dark.png)，列表底栏和正文保持同一暖色设计 |
| 重复点击 | 已选内容连续点击三次，AX 选择与正文不变；未见载入状态重置。120 ms 为代码配置，未做逐帧时长测量 |
| 搜索 | 点击原生 toolbar 按钮和 ⌘F 均打开面板并将焦点置于搜索框；Escape 关闭 |
| 200% 阅读 | 从设置原生滑块增加到 200%，AX 值为 2；标题与正文重排无裁切，[截图](ui-modules/reader-light-200.png)。检查后用 ⌘0 恢复 100% |

旧 ad-hoc 项目可能仍需逐项授权一次，其他证书／机器和钥匙串锁定状态未在本轮验证。iCloud Keychain 跨设备同步、provisioning、Developer ID 公证、macOS 14 实机、iOS、完整 VoiceOver 与系统 Reduce Motion/Transparency/Increase Contrast 矩阵未验收；相应代码尊重减少动态效果，但不能将源码检查记为系统操作验证。没有 Git 远端，未推送或发布。
