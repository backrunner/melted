# API 与数据契约草案 v1

本文描述完整 v1 目标；目前仅实现发现、登录/刷新/退出、词表、内容查询/详情/状态与 changes 提示。已实现子集见 [OpenAPI](../contracts/openapi.json)，TypeScript/Swift 共享 fixture 位于 contracts；其余接口仍未提供，完整 v1 尚未冻结。阶段差异见 [实施记录](14-implementation-status.md)；插件协议与公开 API 分开。

协议不绑定信息主题。media kind 表达输入格式，content kind 表达消息/资料/陈述等性质，topic/tag 来自可配置标签体系；主题不是硬编码技术枚举。即使没有 Subject，输入也可以按全局偏好整理和交付。

更新：2026-10-17。当前 UI 映射见 [06](06-apple-clients.md)和 [11](11-ui-design-system.md)。下文发现示例描述目标能力，不是当前服务端实际启用值；当前必须由 discovery 返回真实 capability。

## 发现、信任、登录

匿名 `GET /.well-known/melted` 返回 server_id、运营者、同 origin 的 api_base、协议范围、注册策略、能力、限制、privacy URL、处理目的地版本。服务器自述符合标准不等于可信认证。

```json
{
  "protocol": {"min": 1, "max": 1},
  "server_id": "srv_example",
  "api_base": "/v1",
  "registration": "key",
  "auth": {"version": 1, "methods": ["password", "api_key"], "preferred": "password"},
  "operator": {"name": "Personal Melted", "contact": "admin@example.invalid"},
  "capabilities": {"input": ["text", "markdown", "html", "image", "audio"], "subject_pull": true, "html_static": true, "push": ["none"]},
  "processing_manifest_version": "pm_1"
}
```

App 先展示运营者及 AI/mem 数据去向，用户同意后才发账号、附件或设备绑定。HTTPS 验证证书；开发 localhost 单独允许；私有 CA 用系统信任，不提供忽略证书错误。发现接口不得跨域重定向凭据；安全端点变化重新确认。

认证由服务器协商：客户端选定服务器后读取 `auth.version/methods/preferred`，一种支持的方式直接展示，多种按首选方式展示并允许切换。未知方法忽略，全部不支持或版本未知时明确提示更新，不默认创建密钥。服务器仅声明已配置的方式，停用方式的接口返回 404。发现响应不含用户名、凭据摘要、密码、API Key 或任意表单/远程执行指令。所有认证端点固定为当前 origin 下的 `/v1/auth/*`。

`password` 使用 `POST /v1/auth/password/sessions`（username/password）；`api_key` 使用 `POST /v1/auth/api-key/sessions`（api_key），均返回现有 Session。客户端只保存会话，输入凭据不进入偏好设置或日志。首期由运营者预置账户，配置及凭据生成见 [认证配置](../server/docs/authentication.md)。同一 subject 的密码/API Key 对应同一账户；不自动与旧密钥或 OIDC 身份合并。`registration=closed` 不阻止运营者已预置的账户登录。

服务器启用 `key` 时，客户端生成独立 P-256 私钥：`POST /v1/auth/key/challenges` 提交 65 字节 X9.63 公钥，返回包含 server_id、challenge_id、随机 nonce 的 120 秒挑战；`POST /v1/auth/key/sessions` 提交 SHA-256 ECDSA 的 64 字节原始签名，原子消费挑战并创建或恢复账户。均使用无 padding 的 base64url。`registration=key` 允许新凭据开户，`closed` 只允许已有身份。来源/body 不能指定 owner。

`POST /v1/auth/refresh` 旋转 refresh token；旧 refresh 再用会撤销整个会话族；`DELETE /v1/auth/sessions/current` 登出。access 15 分钟、会话族 30 天；私钥按 origin + server_id 保存在可同步 Keychain，会话按 origin/server_id/account_id 设备本地保存。可同步 Keychain 证明持有凭据，不证明 Apple 身份。开发签名无法访问同步项时，用户可明确选择本机凭据，不能静默换身份。

可配置 OIDC：`POST /v1/auth/browser/start` 接收 client state、S256 challenge 与固定 `melted://auth/callback`；同源 authorize 入口引导浏览器到提供方。服务器回调验证 state、nonce、签名、issuer、audience、exp/iat，再返回 60 秒一次性 app code。`POST /v1/auth/browser/exchange` 校验客户端 verifier；客户端由 ASWebAuthenticationSession 接回调并验证 state。服务器到 OIDC 也使用独立 PKCE。未配置时 discovery 不包含 browser，API 返回 404。账户按 issuer + subject 绑定，不按邮箱自动合并。

后续摄取用个人 API token 将有 scope、有效期和撤销；当前用于换取完整账户会话的登录 API Key 不等于这种受限 token。`ingest:write` 不能读内容或改用户权限；owner 取自认证上下文，不接受客户端指定的归属。

公开 `GET /.well-known/melted/processing` 返回无秘密的目的地/用途/保留策略 manifest 和内容 hash。登录后的 `POST /v1/consents` 记录用户接受的 manifest hash 与数据类别，`DELETE /v1/consents/{id}` 撤销。账户登录并不自动同意上传给第三方；后台只处理有效授权覆盖的数据，新目的地让相关任务进入 blocked_consent。旧公开 manifest 与登录后的有效能力不匹配时重新展示差异，不能用旧版本同意覆盖新增目的地。

凭据恢复、撤销所有设备与账户关联 UI 仍需后续实现。丢失唯一私钥且没有配置其他恢复途径时，无法仅凭 Apple 账号恢复服务端身份。已有 PostgreSQL 账户可由管理员 `bind-key ACCOUNT_ID PUBLIC_KEY` 关联公钥；此管理操作不开放公共 HTTP 接口。

## 摄取、附件、幂等

`POST /v1/uploads` 创建限时上传会话，上传到其受控端点，`POST /v1/uploads/{id}/complete` 核验大小、哈希、真实类型和所有权后得到 attachment_id。直传 URL 只限本次对象，不转发客户端 bearer；回收未完成上传。

`POST /v1/ingest/items` 返回 202 和 receipt_id/item_id/status_url，不等待模型。常规 App 引用已完成附件；媒体 URL 抓取须另有来源权限。

```json
{
  "schema_version": 1,
  "source_id": "src_01",
  "external_id": "release-2026-10-13",
  "published_at": "2026-10-13T08:00:00Z",
  "language": "zh-CN",
  "parts": [
    {"kind": "text", "mime_type": "text/plain", "text": "发布说明正文"},
    {"kind": "image", "mime_type": "image/png", "attachment_id": "att_01"}
  ],
  "provenance": {"canonical_url": "https://example.invalid/releases/1", "author": "Example", "rights_basis": "user_authorized"}
}
```

parts 是判别联合：text/markdown/html 只含 text；image/audio/video/file 引用完成附件；未知 kind 明确拒绝。至少一个 part。缺发布时间只记录 received_at，不伪装成发布日。author/rights_basis 是来源声明，不替代权利检查。

ingest、feedback、Subject run、上传完成和渠道写入必需 Idempotency-Key，范围 `(account, token/source, operation, key)`。同 payload 返回原响应，异 payload 返回 409。首期键保留 7 天并公开；来源另以 `(owner, source_id, external_id)` 长期唯一，更新必须显式 revision，不能覆盖历史。即时 run 使用 request ID，定时 run 使用 scheduled_slot。

## 对象与不变量

| 对象 | 关键字段 |
| --- | --- |
| Source | owner、type、plugin/version、config、secret_refs、cursor、health |
| RawItem | owner/source/external_id、parts、时间、hash、rights、retention、revision |
| NormalizedDocument | item revision、blocks、语言、时间轴、解析质量、pipeline version |
| InformationUnit | owner、来源引用、content kind、可配置 topic/tag、整理结构、可选 event/claim 引用；普通消息/资料的通用单位 |
| Event | owner/授权域、entities、members、revision、merge/split history |
| Claim | information unit、可选 event revision、statement、fact/opinion/inference/self_report、time scope、evidence links |
| Evidence | source revision、片段/时间位置、family_id、支持/反对、有效期 |
| Judgment | rubric/model/policy version、原始分布、结果、cost |
| BriefingDocument | kind=item/digest/subject_report、可选 subject、information unit refs、可选 event revisions、sections、claim refs、发布 revision |
| FeedbackEvent | actor、target/revision、reason、mutation_id、policy_version、撤销引用 |
| PreferenceVersion | explicit/learned、diff、来源反馈、activation/TTL、policy hash |
| Subject | goal、source scope、freshness、schedule+tz、output、budget、active |
| SubjectRun | trigger、各源结果、deadline/cancel、coverage、budget、output refs |
| Delivery | channel、document revision、delivery_id、attempt、交付状态 |

内部对象带 owner/workspace/schema version；复合所有权外键防跨用户引用。常规列表不返原文；证据走独立鉴权接口。claim/evidence 版本引用保证旧输出能查对应依据。

BriefingDocument 是语义源，Markdown/HTML/纯文本是派生。章节稳定 ID，事实绑定 claim IDs，分析使用独立 kind。服务端固定模板渲染，不直接信任 LLM HTML；客户端不重新总结或判断真假。

BriefingDocument 是协议内的通用输出封装，kind=item 可承载单条消息或资料，名字不要求用户先创建日报。UI 契约还包含 title、summary、published_at、updated_at、content_kind、assessment_scope、evidence_status、coverage、correction_of、read/saved 状态及 revision；没有数据就为空，不能编造阅读时长或可靠性分数。系统状态用枚举由客户端本地化，正文按用户输出语言处理；任意服务器字符串不能变成可执行 UI 动作或远程布局。

## 接口目录

除 discovery/auth 外均需认证，用户操作按本人 owner 过滤；管理员配置另用 admin scope。

| 操作 | 路径与行为 |
| --- | --- |
| 能力及数据去向 | `GET /v1/capabilities`，按账户返回 limits/manifest |
| 来源 | `GET/POST /v1/sources`；`GET/PATCH/DELETE /v1/sources/{id}`；secret 只写 |
| 来源更新 | `POST /v1/sources/{id}/sync`，异步限频 |
| 摄取/状态 | `POST /v1/ingest/items`；`GET /v1/receipts/{id}`，含 partial/error |
| 附件 | `POST /v1/uploads`；`POST /v1/uploads/{id}/complete` |
| 内容列表/搜索/筛选 | `GET /v1/briefings`，统一接受 view/q/category_ids/tag_ids/subject_ids/from/to/sort/cursor；`GET /v1/briefings/{id}` 返回确定 revision/ETag |
| 筛选词表/计数 | `GET /v1/taxonomy` 返回本人可见分类/标签稳定 ID 与名称；`GET /v1/briefings/facets` 返回当前查询下的候选与计数，关注主题沿用本人 Subject |
| 核验依据 | `GET /v1/claims/{id}/evidence`，不默认返回整篇原文 |
| 内容依据 | `GET /v1/briefings/{id}/evidence?revision=…`，汇总 InformationUnit 的来源片段及可选 claim 证据，普通笔记/消息无需虚构 claim 即可溯源 |
| 过滤解释 | `GET /v1/decisions`，本人按 Subject/时间查过滤原因和事件摘要；不作为默认原始信息流 |
| 阅读/收藏/隐藏 | `PUT /v1/briefings/{id}/state`，read/saved/hidden、mutation_id/expected_version；收藏只是过滤视图 |
| 反馈/撤销 | `POST /v1/feedback`；`POST /v1/feedback/{id}/undo`，幂等追加 |
| 反馈进度/记录 | `GET /v1/feedback`；`GET /v1/feedback/{id}`，received/queued/applied/failed/reverted、目标 policy version |
| 偏好 | `GET /v1/preferences`；`POST /v1/preferences/drafts`；`POST /v1/preferences/activate` |
| 偏好草案状态 | `GET /v1/preferences/drafts/{id}`，pending/ready/failed、可读 diff、base version |
| 学习与历史 | `GET /v1/preferences/history`；`PATCH /v1/preferences/learning` |
| Subject | `GET/POST /v1/subjects`；`GET/PATCH/DELETE /v1/subjects/{id}` |
| 主动运行 | `POST /v1/subjects/{id}/runs`；`GET /v1/runs/{id}`；`POST /v1/runs/{id}/cancel` |
| 同步 | `GET /v1/sync/snapshot`；`GET /v1/sync/changes`；`GET /v1/events` |
| 渠道 | `GET/POST /v1/channels`；`PATCH/DELETE /v1/channels/{id}`，地址验证 |
| 设备 | `POST /v1/devices`；`DELETE /v1/devices/{id}`，绑定撤销 |
| 导出/删除 | `POST /v1/account/exports`；`DELETE /v1/account`，重新认证及异步清理 |
| 导出/删除进度 | `GET /v1/account/exports/{id}`；`GET /v1/deletion-receipts/{id}` 使用删除时返回的短期 receipt bearer，只读本次清理状态，不保留可访问内容的旧会话 |

管理接口另外覆盖 plugin enable/disable、provider/secret、job 重试、注册策略及配额；首期 App 做本人设置与基本健康，部署运维用 CLI。实施时 admin 路由同样纳入 OpenAPI 与拒绝权限测试。

### 统一内容筛选契约

**当前子集**：Swift FilterSelection 为 view/q/categoryIds/tagIds/subjectIds，API 接受对应 snake_case 字段；时间、sort 选择和 facets 接口仍是目标。SearchPalette 组件已有多选交互，但主窗口未挂载，不能把查询 API 可用视为 App 搜索链路完成。当前整体清除 q 与三类 ID 保留 view；字段清除仅清 q。选择词表建议会清空当前 q，完整交互以 11 为准。

**完整目标**：FilterSelection 为 TypeScript/Swift 共用值对象：`view=all|unread|saved`、`q`、`category_ids[]`、`tag_ids[]`、`subject_ids[]`、`from/to`、`sort=updated_desc`。三个快捷视图互斥；搜索与各维度取交集，同一多选维度内部取并集，空数组表示不限制。缺省时间为全部；“今天”等快捷时间按账户时区展开为 UTC 左闭右开区间，跨日重新查询。此模型取代单独 `/v1/search` 的草案，避免搜索与浏览维护两套过滤语义。

内容输出附 `category_id?`、`tag_ids[]`、`subject_ids[]` 及词表 revision；分类/标签从可配置词表映射，模型不能伪造其他用户的 ID。Subject 是用户的持续目标，标签是内容属性；过滤关注内容不会创建订阅、增加采集权限或改变学习规则。默认分类不含固定技术职业限制。

列表按更新时间降序并以稳定 ID 破同序；cursor 绑定账户、规范化 query hash、排序和查询快照，不得跨查询重用。条件改变取消旧请求并从第一页开始；迟到结果须验证 query hash。facet 计数只使用本人可见内容，计算某维候选时保留其他维度条件，避免不能扩展当前选择；选中但已无内容的项仍返回为 0，以便用户清除。分类/标签删除有 tombstone/词表变化通知，客户端不会把失效 ID 静默理解成全部。

离线筛选/搜索仅覆盖缓存，界面说明“本机缓存”；不把缓存计数当服务器总量。收藏/阅读更新和 taxonomy/Subject 关系变化进入 changes，旧查询结果标记需刷新。隐藏内容默认排除；清除筛选不改正文、偏好或来源。UI 的唯一设置入口不合并 API 权限，各子功能保持原 owner/scope 校验。

## 同步与离线

当前 API 已提供提交有序 changes 提示，macOS 以 12 秒轮询消费，正文仅留内存。以下 snapshot 落盘、SSE、持久离线重放是后续目标；当前轮询不完整应用远端删除/状态，不宣称完整跨设备复制。

snapshot 返回账户一致快照和 high_watermark；分页绑定固定版本/短期 lease，不能翻页时漂移。完成后从该水位取 changes；changes 返回 upsert/delete/tombstone 与账户过滤的单调序号。

单调序号还须对提交稳定，按 02 的账户计数行锁实现，不直接使用数据库 sequence 水位。每页 changes 带 next_cursor、has_more，客户端将实体、tombstone 与 cursor 原子写入缓存；中途退出重放同页也安全。删除 receipt bearer 只允许读同一 receipt，不复用正常账户 bearer；有效期公开，过期不可恢复旧会话，运营者另提供联系渠道。token 不放 URL，不返回正文、第三方凭据或个人偏好。

SSE 仅提示可拉取水位/类型，用 bearer header，不在 URL 放 token；断线拉 changes。变化日志与实体变更同事务提交。cursor 过期 `410 cursor_expired` 后重建 snapshot，不当作永久登出。

cursor 默认保留 30 天。离线 mutation 保留后重建快照再重放；feedback append-only 可去重，阅读状态/偏好用 expected_version，冲突 409 提供合并/重试。退出停止重放、撤销设备，缓存由用户选择清除；不跨服务器混用 cursor。

## Subject 获取语义

goal 编译成有界 QueryPlan：关键词/实体、语言、时间窗、最大条数、授权源、deadline。分发给所有启用且支持 pull 的来源；仅 RSS poll 能力只能刷新配置 feed、查已摄取内容，不能假装支持全网搜索。

各源返回 `ok|empty|unsupported|timeout|failed|budget_exhausted`、cursor、覆盖时间和 partial。全完成/deadline 后 run 为 `complete|partial|failed|cancelled`；没有变化与查询失败区别表达。局部输出说明缺口，不声称已查整个互联网。

固定权限/预算快照，新增源不加入已运行请求，撤销源取消对应分支；自然语言不能生成任意 shell/SQL/无限爬虫。

## 错误与版本

错误含 code/message/request_id/retryable/details，不泄露密钥或别人对象。400 schema、401 会话、403 权限、409 冲突、413 大小、415 类型、422 能力、429 配额、503 provider 不可用。异步失败通过 receipt/run 表达，已接受的输入不会消失。

主版本用于破坏性变化，新增可选字段向后兼容。未知枚举降级显示未知，不猜成功。服务器声明兼容范围，常规能力响应不泄露私有插件配置。

媒体支持以有效 capability 为准：通用 schema 可描述 video/file，P0 未配置对应支持时返回 415/422，不因 schema 存在就声称已经处理。渲染和状态验收同时覆盖 [UI 规范](11-ui-design-system.md) 与 [开发规范](12-development-standards.md)。
