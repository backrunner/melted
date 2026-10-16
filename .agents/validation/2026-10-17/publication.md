# GitHub 开源仓库准备验证

日期：2026-10-17，Asia/Singapore。覆盖当前全部未提交改动、README 和 GPL 分发材料。

## 本地检查

- `sh scripts/check.sh`：静态设计、token 与品牌生成一致性、6 项 Python 签名测试、TypeScript 检查及格式、5 项服务端单元测试、15 项 PostgreSQL / workerd 集成测试、Worker 预检与实际 dry-run 打包、7 项共享 Swift 测试、10 项 macOS 状态测试、原生构建通过。
- 第一次检查发现亮色品牌 SVG 没有跟随 token 更新；重新运行生成器后上述完整检查通过。
- 服务端 `npm run build` 在 Apple Container 中通过；清理了同步定时任务中未使用的绑定和不可达的 catch。其后的 macOS 状态测试与原生构建通过。
- 原始 `LICENSE` 的标点和排版曾被整理；现替换为 GNU 官方 `gpl-3.0.txt` 原文。`COPYRIGHT`、源码 SPDX 与 README 继续明确 GPL-3.0-or-later，没有新增分发例外。
- Gitleaks 扫描现有 13 个提交和待提交 diff，均未发现泄露。忽略的 `.local/` 中保留本机数据库环境文件，不发布凭据、数据库或应用二进制。
- `git diff --check`、生成资产检查通过；README 本地路径检查在提交前执行。

## 原生应用和截图

- Bundle ID `com.alkinum.melted`，版本 0.2.0（2），Apple Development 签名。
- README 的阅读主图为本次运行的实际亮暗窗口；连接入口也重新采集。内容来自本机服务器已有的公开开发 fixture，没有制作或替换应用正文。
- 首次许可窗口构建 SHA-256：`f8dd73c6e5d51bba8739dde267da2c3f5655d3c551dbacd7627050900c5ae2e5`。实际打开完整 GPL 并滚动至末尾，见[顶部](publication/license-dark.png)及[底部](publication/license-dark-bottom.png)。
- 最终构建 SHA-256：`7f827a21a67634808fad536d022631495c47e1272f33e3754d984bbdb94e055d`。第三方声明复用原生 Markdown 渲染，表格可以横向滚动，见[浅色窗口](publication/third-party-light.png)。设置包含原创版权、无担保和再分发说明。
- 截图采集后恢复原深色外观和本机账户会话。

本记录是本地构建、测试和特定原生操作证据；没有完成全页面状态矩阵、最低系统或 VoiceOver 复测，没有发布公证二进制、生产服务或 App Store 版本。仓库当前没有 GitHub Actions 工作流，不把本地通过描述为远端 CI 通过。
