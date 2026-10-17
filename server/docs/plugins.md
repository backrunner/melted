# 采集插件与原生设置 DSL

当前版本提供 `BaseCollectorPlugin` 基类、可编译注册的 `CollectorPlugin` 模块、统一任务执行和 DSL v1。RSSHub 是第一个独立实现，文件全部位于 `src/plugins/rsshub/`；host 不解析 RSSHub 路由或 JSON Feed。macOS 从已连接服务器读取设置描述，渲染原生表单和动作，不按插件 ID 写专用页面。

## 层次与扩展

| 层次 | 职责 |
| --- | --- |
| `modules/plugins/sdk/index.ts` | 开发者入口：基类、生命周期类型、JSON 请求与结果构造 |
| `modules/plugins/definition.ts` | CollectorPlugin / ConfiguredCollector 模块接口 |
| `modules/plugins/dsl.ts` | 有限设置语法、公共配置校验 |
| `modules/plugins/registry.ts` | 安装清单与运行时身份核对、目录与可用性 |
| `modules/plugins/service.ts` | 账户设置及动作版本校验，转交 host 操作 |
| `modules/jobs/execute.ts` | 解析模块、校验配置、执行 poll、处理错误 |
| `modules/ingest/result.ts` | 校验返回数据、重算存储键和内容 hash |
| `plugins/index.ts` | 组合根：登记已编译模块与 operator 配置 |
| `storage/postgres` / `storage/cloudflare` | 事务、任务、来源及原始记录存储，不识别具体插件 |

新增采集器使用 [开发指南与 boilerplate](plugin-development.md) 生成 `src/plugins/<id>/`，继承 `BaseCollectorPlugin`，在组合根登记，并在 `server/plugins.json` 启用与实现完全匹配的 manifest。无需修改来源、任务或存储分支。单元测试以独立 `example.culture` 模块验证不同设置和动作 ID 使用同一 host；它是测试实现，不是部署提供的数据源。

模块声明部署 manifest、公开 descriptor、`configure(operator)` 和 `deploymentErrors(operator, target)`。configure 只接收该插件的运营配置，返回目的地声明、`validate(configuration)` 和 `poll(source, signal)`；不会注入数据库或账户凭据。poll 返回通用 PollResult，按失败类别抛 CollectorError。输出仍需通过 host 的条数、大小、schema、hash 校验，任务入库和 checkpoint 由原有事务完成。

这是受信任代码随服务端构建的扩展入口，不是动态下载执行器或安全沙箱。模块仍具有运行进程的权限；远程 HTTP invoke、sidecar、自定义脚本、插件市场和任意第三方代码加载未实现。启用未知模块或 manifest 不匹配会被预检拒绝，Worker 必须真实打包。

## 设置与动作契约

[JSON Schema](../../contracts/plugin-settings.schema.json)、[共享目录 fixture](../../contracts/fixtures/plugin-settings.json)与 [OpenAPI](../../contracts/openapi.json)定义已实现语法。DSL 为版本 1，插件包 version、配置 config_version 和来源的乐观锁 version 分开管理。

- 公共表单描述名称、自动采集和轮询间隔；插件表单描述自己的 configuration。
- 仅支持 text、integer、boolean、select；包括名称、说明、必填、默认值、文本长度、数字上下限/步长和枚举选项。配置仅保存 string/number/boolean，最多 40 个字段。
- text/integer 可附带最多 100 条 `suggestions`（value/label/group/description），text 可声明 `monospaced`。建议不是枚举或授权范围，自定义值仍按同一字段规则校验；重复、类型错误或越界建议会被拒绝。无建议的字段仍可使用普通输入控件。
- 不允许 URL endpoint、脚本、HTML、表达式或网络控件。客户端始终调用当前信任服务器的固定 API，不从 DSL 加载资源。
- 动作由插件命名和描述，v1 仅允许 host 已实现的 `collect` 与 `validate` 效果，input 必须为空表单。collect 使用持久任务；validate 只校验现有设置，不访问上游。
- 未知 DSL/配置版本、控件、能力和动作不执行；macOS 提示需要更新。不可用插件仍列出描述，已保存来源可暂停或删除。

## 多订阅列表与表格

必需的 `collection` 描述同一插件下的来源集合，客户端支持 `list` / `table` 两种原生呈现。每一行仍是独立 source，拥有自己的版本、启停、间隔、任务、checkpoint 与原始数据。插件不是只能配置一个来源，也不会把多个路由塞进同一个轮询任务。

```json
{"layout":"table","title":"订阅","columns":[{"scope":"source","field":"name","label":"名称"},{"scope":"configuration","field":"route","label":"订阅路由"},{"scope":"source","field":"enabled","label":"状态"},{"scope":"source","field":"interval_seconds","label":"采集间隔"}],"add_from_suggestions":{"field":"route","maximum":20}}
```

列最多 8 个，引用必须唯一。`source` 仅允许 name、enabled、interval_seconds、last_success_at、last_error；`configuration` 只能引用该插件表单已声明的字段。列值由客户端格式化，没有 JavaScript、任意路径表达式、模板或 endpoint。客户端可在表格和列表之间切换，行操作继续使用来源版本与已声明动作。缺少 collection 的描述不符合当前契约；未知布局或字段映射拒绝交互。

`add_from_suggestions` 指定一个 text 字段及单批上限（1–20），其余必填配置必须有默认值。原生批量选择跨搜索保留勾选，已订阅值标记并禁选，共享启停/间隔可展开修改。保存时创建独立来源，每行使用独立幂等键；部分成功不会回滚成功行。当前面板保留失败行的请求键与 payload，重试仅提交未完成行。发起提交后冻结该批输入，防止未知结果下改变 payload。关闭面板会结束该批客户端重试上下文；重新打开从已保存的来源恢复“已订阅”提示。不是跨多来源的原子事务，也不是任意嵌套数组配置编辑器。

表格由原生 NSTableView 承载动态列、列宽、滚动及键盘行选择；选择底色与文字使用主窗口同一 palette，原生菜单保留行操作。表单、动作、列表共用 MeltedPanel / MeltedField / 菜单与按钮样式；无 RSSHub ID 特判。iOS 目前只有共享类型，没有集合管理页面。

## 账户 API

所有接口均需现有账户 bearer 会话，账户边界由服务端认证上下文确定。

| 接口 | 结果 |
| --- | --- |
| `GET /v1/plugins` | 公共表单、插件描述与 availability，不含运营者秘密 |
| `GET /v1/plugins/{id}` | 单个 descriptor |
| `POST /v1/sources` | 创建来源；需要 Idempotency-Key |
| `GET/PATCH/DELETE /v1/sources/{id}` | 读取/编辑/删除；PATCH expected_version，DELETE If-Match |
| `POST /v1/sources/{id}/actions/{action}` | 已声明动作；需要 Idempotency-Key、expected_version、plugin_version、input |
| `GET /v1/receipts/{id}` | 任务进度、错误和入库计数 |

创建来源示例：

```json
{"plugin":"rsshub","config_version":1,"name":"世界新闻","enabled":true,"interval_seconds":900,"configuration":{"route":"/bbc/world-asia"}}
```

调用 RSSHub sync 动作示例：

```json
{"expected_version":1,"plugin_version":"1.0.0","input":{}}
```

collect 返回 202 与 `{"status":"accepted","receipt_id":"…"}`；只表示任务已提交。validate 返回 200 与 `status:complete`、检查说明。只读检查无副作用；采集动作幂等指纹包含 action、plugin version、参数与来源 expected_version，同一键重试返回同一 receipt，异 payload 返回 409。来源版本在入队事务内再次检查，避免设置改变后迟到的调用排入错误目标。

首版发布前只维护当前契约：来源只接受 plugin/config_version/configuration，拒绝顶层 route；不保留旧数据转换或旧 API 适配。`/sync` 是通用来源采集接口，插件设置面板通过声明的 collect 动作调用。配置键顺序变化不触发目标代际；目标内容变化清 checkpoint，停用/删除继续阻止迟到提交。

## 运营配置

`PLUGIN_CONFIG` 是按 ID 分组的服务端 JSON；Node YAML 使用 `plugins`，API 与后台 worker 必须使用一致配置。它与 `server/plugins.json` 的安装/启用清单不同，不赋予安装代码的能力。

```json
{"rsshub":{"base_url":"https://feeds.example.com","allowed_routes":["/bbc","/douban/book/latest","/hackernews"]}}
```

统一使用 `PLUGIN_CONFIG` / YAML `plugins`。`RSSHUB_ACCESS_KEY` 是 RSSHub 的独立服务端 secret。服务端实例地址、网络范围和凭据不放在账户 configuration；公开目录只包含该用户可设置的字段及允许路由提示，processing 单独披露不带凭据的 origin。Cloudflare 只连接运营者配置的公开 HTTPS 实例；本机容器访问按 RSSHub 指南显式授权。

## 原生设置与验证

macOS 设置的“内容 → 来源与插件”提供添加、编辑、暂停/启用、删除以及 descriptor 声明的动作。表单保存前本机校验，服务端再次校验。409 不丢弃输入；刷新目录/来源后重试。采集 receipt 区分等待、执行、完成、部分失败、失败、取消及新增/更新/重复/无效数量。共享 Swift 类型放在 MeltedCore；iOS 尚无该管理界面。

契约变更运行 `rtk proxy python3 scripts/dev.py exec npm run contracts:plugins`，再执行 `scripts/dev.py check`、共享 Swift 与 macOS 测试。后端测试在 Apple Container 的 PostgreSQL、workerd/SQLite DO 上共用合约，模板生成/执行、当前 schema 初始化、跨账户和动作 fencing 均有负例。当前契约与模板运行见 [SDK 验收](../../.agents/validation/2026-10-17/plugin-sdk/README.md)；多订阅与路由建议见 [订阅集合验收](../../.agents/validation/2026-10-17/route-settings/README.md)；此前模块实现证据见 [插件设置验收](../../.agents/validation/2026-10-17/plugin-settings/README.md)。
