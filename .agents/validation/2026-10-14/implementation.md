# 0.1.0 本机实施验收

日期：2026-10-14 至 2026-10-15（Asia/Singapore）。构建：本地开发版 0.1.0 (1)，Bundle ID `org.melted.desktop.dev`，ad-hoc 签名。系统 macOS 27.0.1 (26A434)、Apple Silicon；Go 1.27.0、PostgreSQL 17.11、Swift 6.4 / Xcode 27。

## 自动验证

- Go race 集成测试使用真实 PostgreSQL 和独立临时 schema：账户隔离、鉴权拒绝、中文子串/字面特殊字符搜索、组合筛选、维度类型隔离、稳定分页、跨账户/跨查询游标拒绝、游标过期、mutation 幂等与异 payload 冲突、并发版本冲突、提交乱序防跳号、refresh 复用撤销、退出撤销。
- 迁移重复执行及 demo 重复导入通过；这只证明当前首版幂等，不证明未来升级迁移或备份恢复。
- Go JSON Schema 测试验证共享 fixture、Go DTO roundtrip、必需字段拒绝，以及独立 schema 与 OpenAPI definitions 同源。
- Swift Testing 的 5 项检查通过：共享内容解码/roundtrip、共享筛选语义、未知依据状态、服务器地址边界、危险正文链接拒绝。
- macOS 本机 `.app` 构建通过。Go 服务端 Linux amd64/arm64 交叉编译通过，尚非 Linux 运行证据。

## 原生窗口与操作

证据来自真实 `build/Melted.app`，连接 `127.0.0.1:8421` 的 Go API 与 `.local/postgres`。样例均为项目编写，App 明确显示“开发样例”，不作为模型质量证据。

- 服务器发现先展示运营者与处理说明，确认后登录；真实返回六条跨领域内容。
- 列表/详情双栏、原生交通灯、单行标题栏、独立分类与时间、无侧栏；选中不自动标为已读。
- 收藏成功后按钮变为“取消收藏”；收藏视图返回两条，取消当前收藏后减少为一条并清空详情。
- ⌘F 初次发现焦点缺陷，改为 NSSearchField 后 AX 确认焦点进入搜索框；粘贴中文“图书馆”后仅返回一条，清除后恢复全部。
- 退出进程并重启后，从 Keychain 恢复原账户；没有重新输入密码。
- ⌘, 打开统一设置。外观切换真实更新窗口。阅读字号控件补充了独立 AX label/value；AX Increment 十次后确认为 200%。正文和标题重排，表格可局部横向滚动；⌘0 恢复 100%。
- Markdown 实际显示标题、段落、列表、引用、表格、任务状态；正文能够选中文本。没有将此提升为完整 VoiceOver 验收。

- 服务端进程停止后，⌘R 出现连接中断提示且保留正文；重新启动 Go 服务后点击重试，提示消失且六条内容仍在。只验证进程中断，未验证系统断网/休眠。
- 通过原生 View 菜单切换紧凑阅读窗口，内容尺寸 680×520 pt（含标题栏截图 1360×1144 px，2×）。验证了单栏列表 → 详情 → 返回；筛选收进 popover，选“工作”只返回一条，清除后恢复六条。切回标准窗口后恢复双栏。

截图：

- [浅色工作台](native-light.png)
- [深色工作台](native-dark.png)
- [200% 阅读字号](native-large-text.png)
- [窄窗详情](native-compact.png)

## 未完成的验证

截图覆盖初始/标准、紧凑窗口及 200% 阅读字号。UI 工具拖动边缘没有改变尺寸，改用已实现的原生窗口尺寸菜单完成紧凑分支的真实验收；不是离屏预览。返回后已恢复跟随系统外观、100% 字号和标准窗口。

尚未验证 macOS 14、Intel Mac、Linux 服务端实际运行、完整 VoiceOver 阅读顺序、全屏、Reduce Motion/Transparency、Increase Contrast、5 万字长文、全部 Markdown 语法/长 URL、iOS 实机、真实模型、APNs、签名公证、App Store、完整离线同步或数据库备份恢复。以上均不是本轮已通过项。

本轮没有发送第三方消息、部署公网服务、创建 Git commit/push 或发布版本。开发服务器与数据库只在本机监听。

## 最终检查

`sh scripts/check.sh` 已运行通过：18 份设计 Markdown、85 个本地链接、22 组色彩对比，最低 4.59:1；Go vet / race / PostgreSQL / schema；5 项 Swift Testing；macOS 构建。Swift token 与设计源一致。验证记录未声称完整 HIG、平台发行或模型能力已经通过。

最终二进制 SHA-256：

```text
macOS: 45205775891c2adf990b76b1e9f29a526f35f3085a9f3a6fa53de8cc79db8219
Go server: 4e29659dc2ced2e797d150a302f93235885e468b91d615b1e17831d193a38862
```
