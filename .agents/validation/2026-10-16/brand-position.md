# 连接页品牌位置与切页动效

日期：2026-10-16，Asia/Singapore。原生 macOS 开发构建 0.2.0（2），Bundle ID `com.alkinum.melted`，沿用 Apple Development 签名。

主程序 SHA-256：`53f40de0c094ec86d224197b7a9e89b9d3cacb7126ebcd7b915be1d9b87de4c6`。

## 修改

- Wordmark 从通用窗口头部移到连接表单列，位于标题上方，与字段左边线对齐。
- 工作台移除顶部品牌及其占位；列表底栏移除品牌，保留计数和加载状态。
- 连接步骤仅保留短淡入淡出，取消水平位移、错峰上移和外层布局弹簧。登录方式切换不再插值表单布局。
- 保留融化背景，减少动态效果时仍由现有实现暂停背景。

## 验证

- 原生应用完成连接入口、确认服务器、返回、更改信任状态和已有本机身份登录。
- 浅色连接页和确认页中品牌与字段对齐；深色连接页文字和控件可读。
- 最终构建工作台的 AX 树不再包含品牌文字，底栏显示“共 6 条内容”。
- 10 项 macOS 状态测试通过；生成 token 一致性、静态设计检查和 `git diff --check` 通过；签名验证通过。
- 动效修正有源码检查及实际来回操作证据，没有录制逐帧视频。本次没有完成窄窗复测、完整辅助功能或最低系统版本验证。

## 截图

- [连接入口，浅色](brand-position/landing-light.png)
- [服务器确认，浅色](brand-position/confirmation-light.png)
- [连接入口，深色](brand-position/landing-dark.png)
- [工作台，无品牌](brand-position/workspace-light.png)

构建产物：`build/Melted.app`；界面工具使用的 `build/latest/Melted.app` 与其主程序相同。
