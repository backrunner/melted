# 连接错误提示打磨验证

日期：2026-10-17，Asia/Singapore。

## 改动

- 共享 `MeltedNotice` 改用中性 surface、细分隔边框、状态图标及对齐的标题与说明；移除整块警告底色。
- 技术详情默认收起，展开后可选中复制；操作与详情放在同一行，空间不足时换行。提示不是模态窗口，不再声明 modal 辅助语义。
- 操作按钮的最小 32 pt 高度放在 label 内，背景与点击区域不再压成细胶囊；保持现有共享按钮样式。
- 会话失效保留仍受服务器支持的登录方式，呈现“重新登录”表单；不再同时误报不支持登录方式。
- 真正不支持登录方式时只显示一条提示及“重新获取登录方式”，不展示无效信任勾选。移除与连接/登录表单重复的通用“重试”。

## 构建身份与验证方法

- 产品：当前 checkout 编译的 `build/Melted.app`，Bundle ID `com.alkinum.melted`，0.2.0 (13)，Apple Development 签名校验通过；已退出旧进程并重新打开本次构建，原会话恢复到 7 条内容。
- 产品二进制 SHA-256：`f1b109cab77baa05ba555e214919d1fa2a50f4c56bbae5d81e0498aadd83e0de`
- 原生故障样例：`build/ConnectionNoticePreview.app`，Bundle ID `org.melted.connection-notice-preview`，adhoc 签名；由 `.local/connection-notice-preview` 编译。
- 样例二进制 SHA-256：`905dbc1c1334bf0a8d34d03940923edf78829e17541ba943eefbcbcdf8e6c24a`
- 样例复制当前 macOS 源码（仅替换 App 入口），直接使用当前共享 DesignSystem。收尾的两处缩进/空行调整不改变样例行为，忽略空白逐文件对比通过。
- 样例通过 `WorkspaceClient` stub 与独立 UserDefaults suite 触发真实 WorkspaceModel 状态转换，既不请求外部网络，也不读取或修改真实钥匙串。它是当前 SwiftUI 组件的原生运行证据，不是生产后端故障验证。
- macOS 27.0.1 (26A434)，arm64，2× 截图。内容区 900×760 pt / 紧凑 680×520 pt，另含 52 pt 原生标题栏；系统字体默认尺寸。
- WorkspaceModel.swift SHA-256：`b2b908fb0442100374b3584c52b2e64386eecc8ada8e8512fa6d7517b5670070`
- MeltedNotice.swift SHA-256：`c550d47f0ae487dde93663ff48e60ef77d9db1c16692bd64f2b7a23bd1d99931`

## 实际操作

| 场景 | 结果 | 截图 |
| --- | --- | --- |
| 会话失效、浅色 | 标题为“重新登录”，登录方式保留；只有一条失效提示，没有“不支持”或重复重试 | [失效](session-light.png) |
| 技术详情展开 | 点击展开 401 unauthorized；AX 值为已展开；收起时不占额外空位 | [浅色详情](session-details-light.png)、[深色详情](session-details-dark.png) |
| 紧凑深色 | 详情展开后可滚动到信任选项与登录按钮；无水平裁切 | [紧凑](session-compact-dark.png) |
| 重新登录 | 在样例中勾选信任并登录，实际切回工作台“还没有资讯”；使用的是 stub 返回的账户 |
| 不支持的方法 | 隐藏信任选项，只显示说明和正常高度的恢复按钮；亮暗均清晰 | [浅色](unsupported-compact-light.png)、[深色](unsupported-compact-dark.png) |
| 重新获取登录方式 | 样例第二次发现返回 key，提示消失，恢复正常信任及登录表单 |
| 网络失败 | 连接表单保留唯一主操作，失败说明与详情一致；紧凑亮暗可用 | [浅色](network-compact-light.png)、[深色详情](network-details-compact-dark.png) |
| 产品重新启动 | 最新产品构建启动并恢复原有 7 条内容 | [产品窗口](product-launch-dark.png) |

## 检查与边界

- `rtk proxy sh scripts/build-macos.sh`：通过，签名校验通过。
- macOS 包 `rtk proxy swift test`：11 项测试通过，覆盖失效后重新登录及保留用户选中的受支持登录方式。
- 设计 token 生成器 `--check`、设计文档检查、`git diff --check`：通过。
- 未把本地 stub 当成真实服务端认证或网络故障通过；未做 iOS、macOS 14 实机、VoiceOver、200% 字号、全屏与系统辅助设置运行验收。
