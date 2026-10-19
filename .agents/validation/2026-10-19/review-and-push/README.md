# 多轮改动整体审查 · 2026-10-19

范围：独立来源添加按钮、名称占位符、RSSHub 开放路由、服务端偏好 DSL、原生设置与凭据权限、偏好编译和自动整理、规则检查页、连接页动画安全带。

## 审查结论与修复

按 `.agents/skills/melted-guard/SKILL.md` 审查领域/HTTP/存储边界、原生状态及契约，确认以下实现并完成相关测试：

- 设置目录、字段和同源传输由服务器声明；客户端拒绝未知版本、越界路径或未知格式。保存、编译、待确认、启用和失败分别显示，冲突及网络重试保留输入/幂等键
- operator 模式无凭据 DSL 且端点拒绝；BYOK 按当前账户定位；shared 仅部署 allowlist 管理员可管理。普通账户可用共用凭据但不可读取/修改；撤销管理员后旧 DSL 不保留权限
- 密钥写入独立密封存储，不进入偏好历史、API 回显或日志；AES-GCM AAD 绑定 server_id、scope 和版本。模型目的地由部署配置固定，BYOK 不 fallback 到其他账户/服务器凭据
- 原文保存不发模型请求；同意编译和确认启用分开。分类/多标签/包含排除、输出生成、引用/数字/材料忠实性检查后提交；原文、偏好、来源或凭据变化阻止旧任务/旧内容继续提供
- Cloudflare 使用真实 workerd SQLite DO、Alarms/outbox/Queues；Node 使用真实 PostgreSQL 和 worker 子进程。所有本地后端执行经 Apple Container

本轮新增失败用例先在两个后端复现，再修复：

1. 失败编译重建相同逻辑任务时 fencing 曾回到 0，可能让旧 claim 再次通过校验。现在保留单调递增计数，旧 checkpoint/complete 无法写回
2. 配置切回原值并重新确认时，旧成功任务阻止已撤下内容再次排队。现在撤下时取消该代任务，显式重新编译/确认后重建可运行任务、清空旧阶段并保留 fencing；撤下结果不计入已发布统计
3. 数字校验曾以子串匹配，使 2026 可被当作 26 的依据。现在按完整数字串校验；即使合成语义模型返回 supported，新增 26 人也被确定性拒绝

更新处理文档、当前实施状态与设计索引，移除多份重复说明及“默认 BYOK”“后处理未接入”等过期描述。

## 执行证据

| 检查 | 结果 | 原始记录 |
| --- | --- | --- |
| TypeScript 类型 / 格式 / 构建 | 全部成功 | [类型](types.log)、[格式](format.log)、[构建](build.log) |
| 服务端完整单测 / 集成测试 | 67 / 77 全部通过，无跳过 | [完整输出](server-tests.log) |
| 三模式自动管线 | operator/byok/shared × Node worker / DO Alarms + Queues 均成功 | 同上 `processing-runtime` 场景 |
| ACP 测试 | 1 项通过 | [输出](acp-tests.log) |
| Worker 插件预检 / dry-run | 6 插件通过，打包成功；没有部署 | [输出](worker-check.log) |
| 共享契约再生成 | 无漂移 | [对比](contract-parity.txt) |
| macOS / MeltedKit | 28 / 34 Core（含 1 个公共 WebP 外网用例跳过）+ 4 设计系统测试通过 | [macOS](macos-tests.log)、[MeltedKit](kit-tests.log) |
| 当前原生构建 / 签名 | 成功，Apple Development；非公证发行 | [构建输出](macos-build.log) |
| 设计 token / 文档 / diff | 通过 | [设计](design-check.log)、[token](tokens-check.log)、[diff](diff-check.txt) |
| 敏感值检查 | 待提交文本未发现真实 token/私钥；匹配项为既有示例及生成环境变量代码 | [脱敏路径记录](secret-scan.txt) |

记录仅清理命令输出的行尾空白，保留用例、退出结果与诊断。

## 原生窗口复核

macOS 27.0.1 (26A434)。重新构建并重启准确路径 `/Volumes/BRData/projects/melted/build/Melted.app`，Bundle ID `com.alkinum.melted`，0.2.0 (13)，可执行文件 SHA-256 `aba01c41c2110e97d80aa235dd1e0b0b4a6c1e6c377b9361f6fd950dd633ffee`。

- [当前设置](settings-server-managed.jpg)：原服务器未开放客户端模型凭据配置时，没有凭据入口
- [偏好表单](preferences-current.jpg)：四项自然语言字段均有占位符，已保存状态及固定页脚正确；无草案/任务卡挤在输入区
- [名称占位符](source-name-placeholder.jpg)：从 RSS / Atom 卡片独立 plus 打开对应表单，名称与 Feed URL 提示均可见；可用插件有独立添加入口，不可用 DeepSeek Harness 的入口禁用
- 本轮只是读取原账户设置，未修改原始偏好、来源或密钥，完成后回到原账户 7 条内容列表
- 其他已执行的亮暗、BYOK 保存/重新打开、规则确认和生成正文见[上一阶段管线记录](../processing/README.md)，连接页最小窗口与上下边界见[连接视口记录](../connection-viewport/README.md)。这些截图保留各自记录的构建身份，不冒充本轮所有状态均重新拍摄

## 质量和发行边界

TypeSafe 请求与响应按[官方 HTTP API](https://docs.typesafe.ai/api)、[Noul](https://docs.typesafe.ai/primitives/noul)及[引用检查示例](https://docs.typesafe.ai/cookbooks/citation_check)核对。模型网络全部使用明确标记的 synthetic fixture；没有使用真实模型凭据或进行真实语义质量、阈值和费用验收。当前未实现外部佐证、学习、聚类或多模态整理。共享凭据跨 Control/Account DO 的变更依靠阶段校验和鉴权读取前撤下，不声称跨 DO 原子事务；已在途模型调用无法撤回。

iOS、最低 macOS 与完整 VoiceOver/辅助设置矩阵未验收。仓库没有 GitHub Actions 工作流，本地检查不能称远端 CI。此次只提交并推送源码及验证材料，不部署服务、不打 tag、不发布安装包。
