# macOS 客户端

SwiftUI 原生应用，最低目标 macOS 14。当前视觉基线见 [UI v1.1](../../.agents/11-ui-design-system.md)，颜色、尺寸和动效以 [tokens.json](../../.agents/design/tokens.json) 为源。

## 模块边界

| 路径 | 职责 |
| --- | --- |
| `Sources/Melted/App` | App 生命周期、窗口尺寸、菜单、toolbar、双窗格和窄窗路由 |
| `Sources/Melted/State` | 工作台状态、请求代际、登录恢复、阅读状态 mutation；`WorkspaceClient` 是可替换的服务边界 |
| `Sources/Melted/Features/Connection` | Landing、服务器确认、登录动作和浏览器认证适配 |
| `Sources/Melted/Features/Library` | 日期分组、内容列表和针对被点击行的菜单 |
| `Sources/Melted/Features/Reading` | 阅读容器、正文、标题动作、元信息和来源依据 |
| `Sources/Melted/Features/Search` | 搜索面板和原生输入框桥接 |
| `Sources/Melted/Features/Settings` | 外观、内容/来源与插件、账户、版本和设置布局组件 |
| `../apple/Packages/MeltedKit/Sources/MeltedCore` | DTO、API actor、Keychain、密钥证明；不依赖业务 View |
| `../apple/Packages/MeltedKit/Sources/MeltedDesignSystem` | 语义 token、Logo、列表行、底栏、连接按钮、错误和空状态 |
| `../apple/Packages/MeltedKit/Sources/MeltedRendering` | Markdown、按需图片与 YouTube/B 站播放器、安全链接 |

Features 通过状态和动作组合，不读取 Keychain、不创建 URLSession。阅读子组件接收文档、状态和回调；新页面优先复用这些组件。窗口只编排功能，不再内嵌整段列表、详情或登录表单。连接页统一使用 `ConnectionPage`；品牌放在连接表单标题上方，连接切步仅透明度变化；列表底栏左侧显示紧凑品牌，右侧保留条数/加载状态，工作台顶部不另加品牌条。底栏使用列表的 `canvas` 色，不叠系统灰色材质；“设置 → 外观 → 显示列表底栏”可关闭整条底栏，默认开启，选择即时生效并保存在设备端，关闭后不留占位。组件与实际尺寸见 [设计资源索引](../../.agents/design/README.md)。

WorkspaceView 已通过原生 sheet 挂载 SearchPalette，菜单/⌘F 和有效条件 chip 可打开，Esc/完成关闭；同步仍是 changes 提示轮询，无正文磁盘缓存。已知差异以 [当前设计复核](../../.agents/13-design-review.md)为准，勿根据组件文件宣称链路已完成。

## 固定开发签名

在仓库根运行 `sh scripts/build-macos.sh`。首次构建从有效身份中选择唯一的 Apple Development 证书，将其 SHA-1 指纹和名称写入被 Git 忽略的 `.local/macos-signing.json`。以后只使用该身份，Bundle ID 固定为 `com.alkinum.melted`。证书丢失、过期或初次存在多个开发身份时，构建会报错，不会自动换证书或退回 ad-hoc。

显式选择或续期更换证书：

```sh
security find-identity -v -p codesigning
python3 scripts/macos-signing.py --configure <SHA-1>
sh scripts/build-macos.sh
```

没有开发证书的贡献者可主动选择 `python3 scripts/macos-signing.py --configure -`，但 ad-hoc 构建的应用身份会随二进制变化，可能再次提示 Keychain 授权。建议日常开发使用固定 Apple Development 签名。[Apple 对 designated requirement 的说明](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements)解释了这一区别。

旧 ad-hoc 包迁移到开发证书后，既有钥匙串项目可能分别需要一次系统授权；此后稳定签名可供系统识别同一应用。代码不删除旧身份、不放宽钥匙串 ACL，也不把私钥或会话移到文件。每个工作台实例只自动恢复一次，连续登录动作有并发保护。凭据读取失败不会被展示成成功。

开发签名不等于 Developer ID 公证发行，也不证明 iCloud Keychain 跨设备同步可用；共享 access group、provisioning profile 和同步仍需单独验证。

## 验证

在本目录执行 `swift test`，覆盖启动恢复去重、登录去重、右键目标和取消阅读任务。共享包测试在 `../apple/Packages/MeltedKit` 执行 `swift test`。根目录 `scripts/check.sh` 会运行两组测试以及构建、设计和服务端检查。测试使用隔离的 UserDefaults 与 actor stub，不读写真实钥匙串。

真实窗口和签名证据按构建与日期保留：见 [品牌与切页](../../.agents/validation/2026-10-16/brand-position.md)、[开源准备](../../.agents/validation/2026-10-17/publication.md)及[完整证据索引](../../.agents/13-design-review.md)。

App 图标来自 [正式资产](../../assets/app-icon/README.md)，构建复制 ICNS 并设置 CFBundleIconFile。Markdown 代码使用系统等宽字体与自定义亮暗语法色；HighlightSwift 的 SwiftPM 资源包放入 Contents/Resources，完整第三方许可随包。修改品牌后运行 swift scripts/generate-app-icon.swift，静态检查使用 --check。

正文媒体的输入格式、原生组件与加载边界见 [MeltedKit 媒体渲染](../apple/Packages/MeltedKit/README.md)。
