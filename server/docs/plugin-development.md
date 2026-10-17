# 开发采集插件

当前扩展方式是随 Melted 服务端编译的受信任 TypeScript 模块。开发入口为 [SDK](../src/modules/plugins/sdk/index.ts)，内置 [RSSHub](../src/plugins/rsshub/plugin.ts) 使用同一 `BaseCollectorPlugin`。不需要修改来源 CRUD、任务队列、存储或客户端页面。

首版尚未发布，只维护当前契约；没有旧 API 别名、旧描述符回退或旧来源数据升级。协议版本、配置版本、插件版本和来源乐观锁版本仍用于明确拒绝不匹配的调用，不是多套实现。

## 从 boilerplate 开始

从仓库根执行：

```sh
rtk proxy python3 scripts/dev.py setup
rtk proxy python3 scripts/dev.py exec npm run plugins:new -- culture-notes
```

生成以下文件；路径已存在时拒绝覆盖，插件 ID 只接受 3–50 位小写字母、数字和连字符：

```text
server/src/plugins/culture-notes/
  config.ts       # 运营者配置与账户设置的独立 schema
  descriptor.ts   # 字段、集合列、多选建议入口和动作
  plugin.ts       # 继承基类，实现上游请求和内容映射
server/tests/unit/culture-notes-plugin.test.ts
```

[模板目录](../templates/collector/) 本身参与类型检查和自动测试。模板演示一个运营者配置的 HTTPS JSON 服务：请求 `/articles?topic=culture`，可选服务端 bearer，只允许账户选择 `allowed_topics` 中的主题。它不默认注册到生产目录，不提供公共上游服务。将 `ExampleCollector`、字段、请求路径和响应 schema 改为实际业务名称与协议。

上游示例：

```json
{"items":[{"id":"article-1","title":"周末阅读","text":"一篇文章的正文","published_at":"2026-10-17T08:00:00Z"}]}
```

模板逐条校验，缺失发布时间保留 null，无效项记录 warning；有效项继续入库。空 items 是成功，无效响应结构是失败；不可把请求失败转换成空数组。

## 基类与生命周期

`BaseCollectorPlugin<Operator, Settings>` 实现 `CollectorPlugin`。构造函数接受当前 descriptor、两套 Zod schema、targets/capabilities/requiredBindings；部署 manifest 的 ID/version 从 descriptor 生成，避免两处身份漂移。

| 扩展点 | 职责 |
| --- | --- |
| `describe(operator)` | 可选：根据运营配置提供公开建议；默认返回静态 descriptor |
| `destinations(operator)` | 必需：返回 1–50 个目的地，声明各 origin、用途和出站数据类别，不包含凭据 |
| `validateConfiguration(settings, operator)` | 可选：在字段/schema 校验后执行授权规则；禁止网络 IO |
| `deploymentIssues(operator, target)` | 可选：目标平台额外约束；例如生产 Worker 不接受 HTTP/内网实例 |
| `collect(context, operator)` | 必需：在事务外访问上游，返回 PollResult |

基类先解析运营配置和 descriptor，校验配置身份；每次 poll 再验证插件 ID/config_version、账户设置和取消信号。`context` 只包含只读的 `configuration`、复制后的 `checkpoint` 和 `signal`，不注入 owner、数据库、账户会话或完整来源对象。运营者秘密仅由闭包传给插件实现，不下发客户端。`describe`/`destinations` 必须保持公开数据边界，host 还会再次校验配置描述和目的地。

运行模块是受信任代码，基类不是安全沙箱。只读 TypeScript 类型/冻结快照限制意外修改，不撤销进程或网络权限；安装前仍需审查插件代码、上游地址与部署 egress。

| SDK 导出 | 用法 |
| --- | --- |
| `PluginSettingsError(code, status)` | 账户配置错误，status 为 400（默认）或 403；返回稳定 code |
| `CollectorError({code,retryable,blocked?,retry_after_ms?})` | 采集失败；由 host 持久化重试/阻塞状态 |
| `requestBytes(url, options)` / `requestJSON(url, options)` | GET、禁止重定向、最多 30 秒/4 MiB；返回 200+有界字节/unknown JSON 或 304；网络错误脱敏，429/5xx 可重试，遵守 Retry-After |
| `retryAfter(header, now?)` | 转换秒数或 HTTP 日期，保持持久时间可表示 |
| `collectionResult({items,checkpoint?,warnings?,notModified?})` | 从 RawContent 构造计数与规范化存储 hash，并校验总量/单条大小 |
| `CollectorContext` / `Configuration` / `RawContent` / `PollResult` | 实现所用的公共类型 |

`requestJSON` 不授权目标地址。插件必须先从运营配置选定目标并校验账户参数，不能从来源正文/账户设置中任意取 URL。请求 options 可缩短 timeoutMs 或缩小 maxBytes，不扩大最大限制；测试可注入 transport。模板使用固定路径和主题参数，不补抓全文或下载附件。

已有条件请求的采集器应把 checkpoint 绑定实例、路由和凭据等实际请求身份；RSSHub 展示了完整做法。无有效 validator 的 304 应报错。host 负责原始条目/revision/receipt/checkpoint 同事务提交，仅完整成功推进 checkpoint；插件不自行持久化重试或游标。

## 注册与配置

1. 在 [组合根](../src/plugins/index.ts) 导入生成的 `examplePlugin`，加入 `installedPlugins`。这是唯一需要修改的业务代码注册处。
2. 在 [启用清单](../plugins.json) 加入与 `plugin.manifest` 完全一致的 manifest：

```json
{"enabled":true,"manifest":{"id":"culture-notes","version":"1.0.0","runtime":"builtin","targets":["node","cloudflare"],"capabilities":["https"],"required_bindings":[]}}
```

3. 通过运营者 `PLUGIN_CONFIG`（Node YAML 为 `plugins`）提供独立配置；API 与后台采集进程使用相同值：

```json
{"culture-notes":{"base_url":"https://feeds.example.org","allowed_topics":["culture","science"]}}
```

可选 token 由服务端秘密配置提供，不能写入 Git、descriptor、来源配置或日志。`server/plugins.json` 声明已编译实现，不是下载地址或动态代码加载器。启用未知 ID、错误 manifest 或不支持的平台能力会被预检拒绝。

## 设置、集合与动作

text 字段可用 `format: "url"` 声明地址语义；客户端校验格式、服务器执行地址授权，字段本身不会加载资源。

descriptor 必须包含 `collection`，声明 `list` 或 `table`、标题和最多 8 个合法列绑定。每一行是独立 source；`add_from_suggestions` 可提供最多 20 项的批量创建；大型动态目录使用互斥的 `preset_catalog` 和基类可选 `presets(operator)` provider（list/resolve），由 host 校验返回值并复核授权。表单/建议/列/动作都来自插件描述，macOS 负责原生样式、导航与交互。详见 [设置 DSL](plugins.md)。

当前 `collect` 和 `validate` 是 host 支持的动作效果；插件声明动作 ID/文案，客户端调用固定的服务器 actions API。扩展新的效果需要先在 host 与契约中实现，不能在 descriptor 放脚本或外部 endpoint。

## 验证与交付

```sh
rtk proxy python3 scripts/dev.py exec npm run check
rtk proxy python3 scripts/dev.py exec npm run test:unit
rtk proxy python3 scripts/dev.py exec npm run plugins:check -- node
rtk proxy python3 scripts/dev.py exec npm run worker:check
rtk proxy python3 scripts/dev.py check
```

模板自动测试覆盖授权主题、隐藏秘密、partial、缺日期、稳定 hash 和取消。SDK 测试另外覆盖生成器拒绝覆盖/路径穿越、生成源码可导入、HTTP 限额/状态分类。集成测试将模板经 Wrangler 打包，在真实 workerd 里经过 registry/service/结果校验运行；模板上游使用注入 fixture。这不证明你新接入的真实源、运营权限、网络限制或许可证已经验证。

实际插件还需测试条件请求、超时、429、正文上限与非预期格式；通过同套 Node/PG、DO/Queue 契约检查，并记录真实来源请求时间、运行状态及入库数量。只有有界规范化结果交给 host；租约/fencing、幂等、去重/修订、暂停/删除栅栏和 checkpoint 事务继续由共用层负责。
