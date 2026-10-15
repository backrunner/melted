# 服务器协商认证验证

日期：2026-10-15 深夜至 2026-10-16，Asia/Singapore。macOS 27.0.1（26A434），arm64；原生 SwiftUI，Melted 0.2.0（2）。

## 构建与范围

- 最新客户端：`build/Melted.app`，Bundle ID `org.melted.desktop.dev`。
- Apple Development 签名，Team `PB8H83VL3Z`；沿用已固定的开发签名身份。
- 主程序 SHA-256：`6a74658dc04cbab2348beaacbc593e423c3e0be1e7b1a55f80612233115fabca`。
- 服务端均通过 Apple Container。原生交互临时使用 `127.0.0.1:8422` 的 Node/独立测试数据库，启用 password/api_key，首选 password，关闭自助注册；没有修改已有账户凭据。

## 自动验证

- `python3 scripts/dev.py check`：TypeScript、Prettier、5 项 unit、15 项 integration、插件预检和 Worker 实际 dry-run 打包通过。
- 新的共同测试分别在 PostgreSQL 和 workerd/SQLite DO 运行：discovery 不泄露账户/摘要、停用方式拒绝、错误/未知凭据拒绝、禁止指定 owner、密码/API Key 对应同一 subject、不同 subject 内容隔离、原始 API Key 不能直接作 bearer、刷新/退出、IP 限流。原有 P-256、OIDC、并发状态与 DO 持久化测试通过。
- 显式空 AUTH_CONFIG 不能退回默认密钥策略；无凭据、未知方法、重复绑定等配置失败。配置修正后的 unit 再次通过。
- 共享 Swift 包 7 项、macOS 状态测试 6 项通过：首选方式、旧版本 discovery、未知协议/方法、服务器信任门槛、方法匹配、并发点击去重、无隐式密钥访问、偏好设置不含输入密码。
- 凭据 CLI 实际执行密码/API Key 两条路径；输出摘要可验证，错误日志不包含输入密码。
- 设计链接/JSON/token/对比度静态检查及 `git diff --check` 通过。颜色检查不代表原生辅助功能全面验收。

## 真实原生窗口

通过 CUA 操作当前构建，使用仅用于本机验证的账户与公开开发样例：

1. 选择临时服务器后自动显示账号密码，Picker 只包含服务器启用的密码/API Key，没有身份密钥按钮。未确认信任时字段和登录按钮禁用；确认后焦点进入账号。
2. 错误密码显示可理解的错误，密码字段清空，不能进入工作台。正确密码实际登录成功。
3. 退出进程并重新启动，直接恢复账户会话，没有再次输入密码，也未出现需要操作的钥匙串授权窗口。
4. 在密码框输入测试文本，切换 API Key，再切回密码；账号和密码均为空，旧秘密不复用。API Key 实际交换会话成功，并看到密码方式下已载入的同账户 6 条内容。
5. 亮暗主题检查通过。常规截图 2240×1520 像素（1120×760 pt）；使用系统窗口四分屏后 1922×1098 像素（961×549 pt），可以滚动到密码和登录按钮，无横向裁切。拖拽窗口边缘未成功改变尺寸，因此不将本次记录宣称为精确 680×520 验收。
6. 退出临时会话，恢复浅色及常规窗口、原服务器 `127.0.0.1:8421`，复用原身份密钥登录并恢复 6 条内容。单方法服务器没有多余 Picker。临时容器停止并删除，临时凭据文件已移除。

截图：

- [账号密码，浅色](authentication/password-light.png)
- [API Key，深色](authentication/api-key-dark.png)
- [小高度窗口滚动到底部](authentication/password-compact.png)

## 实际边界

没有进行生产 Cloudflare 部署或真实 OIDC 提供方的浏览器登录，本次 OIDC 证据来自现有集成测试。没有复测完整 VoiceOver、系统大字、iOS、跨设备 Keychain 或最低 macOS 版本。未验证线上密码推导容量/套餐 CPU 额度。

预置账户用于小型自托管，没有自助注册/密码找回/MFA/全设备撤销 UI。修改凭据配置阻止新登录，不立即撤销已有会话。配置方法见 [认证配置](../../../server/docs/authentication.md)。
