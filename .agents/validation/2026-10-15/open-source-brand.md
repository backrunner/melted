# 品牌、交互与开源准备

日期：2026-10-15（Asia/Singapore）。当前系统 macOS 27.0.1 (26A434)，Apple Silicon，目标 macOS 14。当前源码构建 `build/Melted.app`，0.2.0 (2)，ad-hoc 签名；不是签名公证发行版。

## 修改

- 新增原创连续小写 m 标识。SVG 是图形源，脚本生成 Swift Shape 和 README 亮暗 lockup；状态栏使用 18 pt、欢迎页使用 64 pt。
- 列表选中由 250 ms 弹簧改为 120 ms ease-out。分类标签移除自己的悬停/按压手势，按钮不叠加按压反馈；已选中的内容直接返回。背景复用同一个形状，避免重建造成过渡；减少动态效果时行内动画为 nil。
- 延迟标为已读之前确认选中 ID 和详情 ID 仍匹配，避免快速切换时旧点击修改新条目。
- 用户确认 GPL-3.0-or-later，不加 App Store 例外。保存完整 LICENSE、COPYRIGHT 与贡献说明，保留第三方许可；原生包和容器包含项目许可文件。
- 初始化 main，并将现有设计/契约、服务端、客户端、许可证、干净部署修复、品牌交互及公开 README 分批提交。
- README 使用新 Logo，说明当前能力、开发入口、双部署、路线图及许可。凭据、本机配置、旧本机 Compose、构建产物不提交。

## 已执行

- 从当前源码构建 macOS App 成功，`codesign --verify --deep --strict` 成功。可执行文件 SHA-256：`1309776e886f19c6903f3c6b8d40de4c1f9747678ce58a1d0e342b4ea82b0f5a`。
- Swift 共享包 6 项测试通过。
- Apple Container 内 TypeScript 类型检查和 Prettier 检查通过；单元测试 4 项、集成测试 13 项通过。覆盖 PostgreSQL 与 workerd/SQLite DO、OIDC、持久性及配置优先级。
- Worker 插件预检（0 个启用）与实际打包 dry-run 成功；未部署 Cloudflare。
- Node 构建、`npm ci --ignore-scripts --dry-run` 通过；在容器空目录内启动编译后的 Node 入口，仅用环境变量，`/healthz` 返回 HTTP 200。修复前入口强制依赖未提交的 YAML。
- 设计检查通过：28 份设计 Markdown、105 个本地链接、5 个 JSON 示例、22 组色彩对比，最小对比度 4.59:1。生成 token 与品牌资产一致；README 本地链接和图片路径有效。
- Git 可识别密钥模式检查无匹配；确认 `.local/node.env`、`server/.env`、本机 YAML/旧 Compose 和构建 App 被忽略。该检查不是完整安全审计。

## 视觉证据与边界

[品牌预览](brand-preview.png) 由当前 SwiftUI `MeltedMark` 和主题 token 渲染，展示亮暗和 18 pt 状态栏比例，是组件设计预览，不是完整 App 截图。

本轮从当前源码重建并启动过开发包，账户恢复停在凭据读取阶段；自动化工具明确禁止操作 SecurityAgent，已请用户手动完成系统授权。最后一轮构建已包含全部代码与许可修改，完整 App 的最终重启、登录后列表操作、系统减少动态效果、VoiceOver 与 iOS 运行验证尚未完成。随后工具明确报告 Mac 已锁定且自动解锁失败，需用户手动解锁。不会用旧截图或静态预览宣称新版完整交互通过。

独立原生组件窗口使用当前 MeltedKit 与仓库公开样例，720×640 pt，亮暗并排。已实际操作：首次选择计数从 0 到 1；对已选行连续点击三次，AX 树和计数保持 1；点击第二行的分类标签后计数变为 2，两侧同步选中。Logo 在 48 pt 和 18 pt 槽中均清楚可见。截图曾由 CUA 直接显示在对话中；后续保存截图与再次点击时遇到锁屏，没有保存成功的原生截图文件。此记录是组件交互证据，不是完整登录链路或逐帧动画时长测量。公开 README 仅使用正式 Logo，没有把组件示意标为 App 截图。没有 Git 远端，未推送或公开发布。
