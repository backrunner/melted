# 自然语言偏好与自动整理 v1

服务端为账户保存显式原文，使用 JSON Chat Completions 生成器编译有限结构草案；TypeSafe Jev 负责包含/排除判断、分类、多标签和材料忠实性判断。运营者配置模型目的地和凭据模式，账户通过服务器 DSL 明确同意处理目的地并启用整理规则。没有模型或同意时不发外部模型请求。

## 执行

1. `classification/content/preferences/output` 原文编译为 categories/tags/tag_rules/include/exclude/preferences/output/warnings，结构校验后成为 ready 草案。用户确认才 active；不静默学习兴趣或永久屏蔽。
2. 调度已有及新增 RawItem，每次最多新增 20 项任务。任务绑定 owner、设置版本、配置指纹、原文修订与来源 generation，原文完整保留。来源删除清理派生正文、处理结果和阶段缓存，取消迟到任务并使快照失效。
3. 原文文本最多 60k 字符，规范文本最多 20k，分 800 字符证据片段。仅处理现有文本；不下载附件，不声称多模态理解。动态标签须在引用片段中原样出现；标签规则和固定分类由用户草案提供。
4. Jev 批量判断是否明确排除、是否符合预期、材料性质、分类和每个标签。默认排除阈值 .9、包含阈值 .8；不确定材料 held，明确排除/无关 filtered，均不删除原文。分数是模型判断，阈值尚未经领域标注集校准。
5. 生成 title/summary/sections/claims，强制实际证据 ID、最多 12 条陈述，按完整数字串检查新增数字（不把 2026 当作 26 的依据），再由 Jev 分别检查标题、摘要、标题段和每条陈述的材料支持性。引用、数字或忠实性失败不发布。Markdown 与来源列表由代码转义生成，模型不能提供可执行 HTML、链接权限或工具调用。
6. 成功原子发布 Briefing/词表/changes。事实或混合材料标 single_source，观点/创作标 not_applicable；没有独立检索或外部佐证，不能称 corroborated。原文修订立即撤下旧生成结果，重算后同一内容 ID 增加 revision 并保留阅读状态。

## 持久性与成本

Node 由 collector-worker 调度 PG；Cloudflare 由账户 DO Alarms → 事务 outbox → Queues → DO 提交，均按至少一次交付实现。账户最多并发 2 项，租约 240 秒、执行截止 180 秒；领取时递增 fencing token，检查点与发布复核版本/代际/租约。过期、重复、撤销或删除的结果不能发布。同一逻辑任务显式重建时保留递增 fencing 计数；配置恢复原值后，须重新生成并确认规则，撤下的旧结果重新排队且不复用旧阶段。瞬态错误退避最多 3 次，成功检查点复用；永久结构错误失败后等待用户显式重试。

每次领取预留 compile=1、item=4 次调用（候选标签、判断、生成、核验），默认账户每日 60 次，可配置。预留保守不退款，即使缓存或筛选减少实际调用；实际已成功响应的 usage 单独记录。HTTP 超时/进程崩溃后无法保证模型费用 exactly once，稳定请求 key 仅在 provider 支持时有去重作用。不得把预留调用数当账单。模型响应限制 1 MiB、请求默认超时 30 秒，拒绝重定向，错误不转发上游正文或密钥。

部署配置替换须同步重启 API 与所有 worker；不能让运行不同配置的旧 worker 持续消费。变化后新配置不领取旧指纹任务，客户端要求重新同意并生成规则。已有成功阶段不因重投重复执行；预算耗尽产生明确失败，次日或调整预算后仍需显式重试。

## 配置和运维

Node YAML 顶层 `processing` 或环境 `PROCESSING_CONFIG` JSON；两个必需 provider：`generator: {endpoint, model, api_key, max_tokens}`（JSON Chat Completions，默认 max_tokens 4096）和 `decision: {endpoint, model, api_key}`（默认 TypeSafe `/v1/systemone`、jev-latest）。endpoint 必须 HTTPS 且不能带凭据、query 或 fragment。只接受运营者配置，不从账户 DSL 接收地址或密钥。选择能固定的模型版本，升级前先回放评估。

可选 `daily_call_limit`、`timeout_ms`、`exclusion_threshold`、`inclusion_threshold`、`verification_threshold`，完整边界由 `processingConfigSchema` 定义。配置通过 YAML/环境校验；不要提交真实密钥。Cloudflare 使用 `wrangler secret put PROCESSING_CONFIG`，绑定同一 Worker，不引入外部数据库。先执行 PG 005/006 迁移再启动 API/worker；DO 按账户自动升级。数据备份含偏好、原文与模型阶段产物，应按账户私有数据保护。

## 验证边界

`tests/integration/processing.test.ts` 对 Node/PG 和真实 workerd/SQLite DO 检查保存→草案→确认→分类/打标/筛选/生成、账户隔离、引用/数字/忠实性拒绝、并发领取、租约 fencing、检查点、预算、修订和删除。`processing-runtime.test.ts` 使用实际 Node worker、DO Alarms/Queues 和采集链路。模型网络响应明确由 synthetic fixture 提供，这证明执行与协议，不证明真实模型语义质量、阈值或费用。真实模型验收需要已授权凭据和真实样本；无凭据不声称通过。

尚未实现事件聚类、近似语义去重、自动学习、外部检索核验、附件理解、外部渠道生成/交付、可视化人工复核/历史回滚。当前输出是客户端阅读的 Briefing 正文。

## 可选的客户端凭据配置

运营者在 `processing.credentials.mode` 选择唯一模式，不同时混用或静默 fallback：

| 模式 | 凭据位置和权限 | 客户端入口 |
| --- | --- | --- |
| operator（默认） | YAML/环境中的服务器密钥 | 不下发凭据表单，所有凭据读写端点拒绝 |
| byok | 每个账户独立密钥，只能读配置状态、更新或清除自己的密钥 | 每个已登录账户获得“我的模型凭据（BYOK）”DSL |
| shared | 全服务器共用一组密钥，只有 `processing.credentials.administrators` 内的账户 ID 可以管理 | 仅管理员获得“服务器模型凭据”DSL，普通账户没有入口且直接请求返回 403 |

管理员名单由运营者在部署配置中设置，不接受客户端 role/owner/权限声明，不自动把第一个注册者提升为管理员。当前是显式账户 ID allowlist，尚无通用角色管理界面。共享模式的普通账户可使用共用密钥处理自己的内容，但无法读取或更改密钥。BYOK 未配置完整时不使用其他账户或服务器密钥。模型地址、ID、预算和阈值仍由运营者配置；客户端不能把密钥改投任意地址。

byok/shared 必须配置 `PROCESSING_SEAL_KEY`（64 位随机小写 hex，256 bit master），模型配置不再携带 `api_key`。API 与 worker 必须使用同一 server_id 和 master，配置不一致会拒绝解密而不会回退其他密钥。master 仅在服务端环境（Cloudflare Worker secret），绝不下发。基于 server_id 和算法上下文经 HKDF 派生 AES-256-GCM 与 HMAC-SHA256 密钥。随机 96 bit IV，AAD 绑定 server_id、账户/共享 scope 和记录版本；密文移到另一 scope 或使用错误 master 不能解密。数据库、幂等记录仅保存密文/认证标签和必要版本审计；旧幂等密文至少保留 7 天。备份需要同时保护 master；丢失 master 无法通过客户端恢复旧密钥，当前不提供自动 master 轮换迁移。

`GET /v1/settings` 可选 `credentials` descriptor：固定 secret 字段 generator_key/decision_key、scope、GET/POST 同服务器路径以及 write-only-secrets-v1。原生 SecureField 只在内存保留本次输入；保存成功或关闭后清空，不进 UserDefaults、普通偏好、历史正文或日志。状态接口只返回 `{version,configured:{generator_key,decision_key},updated_at,updated_by}`，不回显密钥。POST `{expected_version,changes}` 中缺省字段保留、null 清除、非空 ASCII 字符串替换，使用幂等键与乐观版本；无网络响应重试保持同一 key，冲突保留输入。保存不验证远端密钥有效性，实际模型调用仍可能认证失败。

处理按账户解析有效凭据，每个阶段和提交前再次检查凭据版本指纹。换钥/清除后旧规则需重新生成并确认，旧任务不能继续对新版本发布。共享凭据位于单独 Control DO，账户内容在 Account DO，跨 DO 不宣称原子事务：阶段检查阻止旧任务继续，鉴权内容/同步读取前的账户校验先撤下旧结果并发 delete changes，再返回内容。可能已在途的请求无法撤回或保证不计费，短暂落库的迟到结果也不会经新读取提供。密钥有效性未知不等于任务成功。

模式 switch 是服务端部署配置；撤销管理员后每次请求重新检查 allowlist，旧 DSL 不保留权限。API 使用 HTTPS（开发仅允许 loopback HTTP），不允许客户端任意指定 owner、provider endpoint 或 header。共享密钥的调用预算当前按账户独立预留，尚无全服务器汇总费用硬上限。
