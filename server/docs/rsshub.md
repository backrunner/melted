# RSSHub 采集

独立模块 `src/plugins/rsshub/` 通过通用 [插件 host 与设置 DSL](plugins.md) 注册；内置 `rsshub` collector 将公开 RSSHub 路由的 JSON Feed 1/1.1 内容保存为账户隔离的原始条目。支持 Node/PostgreSQL 与 Workers/SQLite DO；不依赖旧 RSS3 DSL，不执行第三方插件代码，不生成 AI 简报。

## 配置实例

实例地址与路由授权由运营者配置，用户只能选择相对路由。默认没有实例，不会自动连接公共服务。配置启用后，discovery 声明 collectors，processing 展示实例 origin、公开路由请求用途及版本 hash；不包含密钥。推荐 `PLUGIN_CONFIG` 的 `rsshub` 配置项；兼容 `RSSHUB_CONFIG` JSON 和 Node YAML 的 `rsshub` 字段。显式环境变量覆盖 YAML。

```json
{"base_url":"https://feeds.example.com","allowed_routes":["/bbc","/douban/book/latest","/hackernews"],"allow_private":false}
```

`allowed_routes` 按完整路径段匹配：`/bbc` 允许 `/bbc/world-asia`，不允许 `/bbcevil`。禁止 query、fragment、控制字符、路径穿越、双重编码和改变 origin。来源名称、ID 和游标拒绝无法在两个后端一致存储的文本。运营者应只授权公开路由；不要授权私人关注、登录通知、任意 URL 抓取或上游 AI 转换路由。固定实例是运营者信任的网络目标，不是任意 URL 抓取代理。实例 DNS、上游采集权限及 egress 隔离仍由运营者负责，路径检查不构成第三方 RSSHub 的沙箱。

实例配置的 `RSSHUB_ACCESS_KEY` 作为服务端秘密单独注入。RSSHub 当前使用 `key` query 验证访问密钥，采集器仅在出站请求时注入，不保存完整请求 URL、不记录上游异常原文，不将密钥传给账户。公开部署需 HTTPS，并在反向代理日志中屏蔽 query。不要把平台 Cookie 放入 Melted 来源配置。首版参考实例不包含登录源、浏览器、Redis 或额外模型服务。

### 路由目录与多订阅

RSSHub descriptor 提供新闻、文化生活和社区三组共 21 条内置建议，全部先通过同一 `allowed_routes` 授权检查，再下发客户端。BBC 的头条/亚洲/世界/商业/科技/中文、ABC 最新新闻、豆瓣新书 9 类和 Hacker News 5 类均保留相对路由。依据为上游 [BBC](https://github.com/DIYgod/RSSHub/blob/master/lib/routes/bbc/index.ts)、[ABC](https://github.com/DIYgod/RSSHub/blob/master/lib/routes/abc/index.ts)、[豆瓣新书](https://github.com/DIYgod/RSSHub/blob/master/lib/routes/douban/book/latest.ts)和 [Hacker News](https://github.com/DIYgod/RSSHub/blob/master/lib/routes/hackernews/index.ts) 的路由元数据，不代表每条路由已实时验收。

运营者可添加最多 50 条 `route_suggestions`，按 value 覆盖同路径标题或增加本实例支持的公开路由。它只改变提示，不扩大授权；未授权建议不会下发。示例：

```json
{"base_url":"https://feeds.example.com","allowed_routes":["/bbc","/douban/event/hot"],"route_suggestions":[{"value":"/bbc","label":"每日头条","group":"新闻"},{"value":"/douban/event/hot/118172","label":"同城活动","group":"文化生活"}]}
```

客户端从建议批量勾选多个订阅，也可通过“自定义 RSSHub 订阅”输入允许范围内的其他路由。订阅以多行表格/列表管理，每行单独采集与暂停；更改某一路由不会重置其他行。轮询菜单提供常用间隔，自定义间隔仍以秒保存。路由建议、集合列、批量入口均由通用 DSL 描述，客户端不内置 RSSHub 路径。

本次实际复测三类公开路由与批量原生操作见 [路由与多订阅验收](../../.agents/validation/2026-10-17/route-settings/README.md)。未验证的建议受上游与实例版本影响，失败时按真实 receipt 报告。

### Node 自托管

可选 `rsshub` Compose profile 使用固定的官方镜像 digest、非 root、只读根文件系统、内存缓存，不公开 RSSHub 端口。Melted 的 `collector` 服务独立于 API 运行，并与 API 共享数据库和 RSSHub 配置。

```sh
# 在 .env 中设置（这是明确授权的容器内地址）
RSSHUB_CONFIG={"base_url":"http://rsshub:1200","allowed_routes":["/bbc","/douban/book/latest","/hackernews"],"allow_private":true}

docker compose --profile rsshub up --build -d
```

不需要内置实例时，设置自己的 HTTPS 地址并使用普通 `docker compose up --build -d`。`allow_private` 只授权此固定实例，不允许用户提交其他内网地址；不跟随 HTTP 重定向。所有用户共享实例只适用于本版公开来源范围。

### Cloudflare

配置 `RSSHUB_CONFIG` Worker var 和可选 `RSSHUB_ACCESS_KEY` secret；正式配置使用 HTTPS 实例及 `allow_private:false`。RSSHub 是外部业务来源，Melted 的存储和任务仍只使用 Cloudflare 基础设施。

首次部署先建立 `melted-collections` 和 `melted-collections-dlq` 两个 Queue，再执行现有 `worker:deploy`。`wrangler.jsonc` 包含生产及本地 Queue binding/consumer。每个账户的持久 alarm 负责到期调度、outbox 投递和租约恢复；消费者只接收 owner/run ID，不在队列消息中携带正文或密钥。死信不等于任务成功，账户 outbox/租约 watchdog 可以恢复未完成任务。

插件预检仅允许已注册且版本匹配的内置实现，并检查 Queue binding；运行时与预检共用严格 schema，空能力、重复注册或未知启用插件均不会获得采集执行权限；其他插件仍返回 `plugin_execution_not_implemented`。

## 来源与入库接口

所有接口使用现有 `Authorization: Bearer …` 账户会话，owner 从认证上下文取得。详见 [OpenAPI](../../contracts/openapi.json)。

| 操作 | 接口 |
| --- | --- |
| 创建/列出来源 | `POST/GET /v1/sources` |
| 读取/修改/删除来源 | `GET/PATCH/DELETE /v1/sources/{id}` |
| 插件设置描述 | `GET /v1/plugins` |
| 插件动作 | `POST /v1/sources/{id}/actions/{action}` |
| 兼容手动采集 | `POST /v1/sources/{id}/sync` |
| 查询采集状态 | `GET /v1/receipts/{id}` |
| 原始条目元信息列表 | `GET /v1/sources/{id}/items?limit=30&cursor=…` |
| 原始正文或历史修订 | `GET /v1/raw-items/{id}?revision=1` |

创建示例；提供唯一 `Idempotency-Key` header：

```json
{"plugin":"rsshub","config_version":1,"name":"周末阅读","configuration":{"route":"/douban/book/latest/fiction"},"interval_seconds":900,"enabled":true}
```

创建启用来源后自动安排首次采集。创建和手动采集的幂等键保留七天，同操作同键异 payload 返回 409。手动采集返回 202、`receipt_id` 和 `status_url`；已有活动任务时合并到同一任务，每账户每分钟至多 60 次手动请求。

PATCH 必须包含 `expected_version`，DELETE 使用 GET 返回的 `ETag` 作为 `If-Match`。任何配置修改取消旧任务；更换 route 还会清除条件请求 checkpoint。停用保留原始内容，删除清理所属原始条目及全部 revision；删除与任务提交使用同一事务栅栏。来源配置版本与内部任务 fencing 独立，采集状态更新不会制造配置编辑冲突。

返回状态为 `queued/running/complete/partial/failed/cancelled`；计数区分收到、新增、更新、重复、无效。空 feed、304 和全部重复仍属于成功；401/403、路由配置或重定向错误阻止自动轮询，修正配置或手动重试恢复。临时错误最多四次尝试，30 秒起指数退避并遵守 `Retry-After`；后续定时槽仍可恢复失败源。

原始条目使用 `(owner, source_id, external_id)` 去重，数据库用 external ID 的 SHA-256 定长索引；正文变化保留历史 revision，hash 不包含采集时间。同一 feed 内同 ID 的冲突版本全部记为 partial，不按顺序选择正文或反复创建修订；相同副本仍计入重复。无法表示的 Unicode、无效日历日期和超出安全整数范围的数字 ID 按无效项处理，不阻塞其他有效条目。原始 HTML 只作为 JSON 数据保存；消费者必须按不可信内容处理。媒体仅记录引用，没有下载、执行或转录。缺少发布日期保留 null；语言和作者都是上游声明。列表在数据库查询及 DO RPC 层就只返回元信息，正文需单独鉴权读取。列表按稳定 ID 升序游标翻页，是实时列表而非冻结快照。

默认 15 分钟一次，允许 5 分钟至 24 小时；每账户最多 100 个未删除来源、并发 2 个采集任务，Node worker 总并发 4。每次读取最多 4 MiB、100 条，每条原始输入与规范化内容最多 256 KiB；规范化内容总量也限 4 MiB，防止继承作者等信息造成体积放大。deadline 30 秒，租约 90 秒。超限/无效条目报告 partial；仅完整成功提交新的 ETag/Last-Modified；校验器绑定实例、路由、请求格式和凭据的哈希，配置切换不会复用其他目标的 checkpoint。任务执行期间不持有数据库事务。

采集当前 feed 窗口，不按发布时间简单丢弃旧项，因此能发现窗口中的补发和修改；不承诺全历史、源站删除同步或停机期间不漏项。原始记录与修订保留至来源删除，运行历史保留用于排查；部署者应监测数据库容量。

## 本机验证

从仓库根执行；本机 Node、PostgreSQL、workerd 和 RSSHub 均通过 Apple Container：

```sh
rtk proxy python3 scripts/dev.py setup
rtk proxy python3 scripts/dev.py rsshub
rtk proxy python3 scripts/dev.py collector
# 另一终端运行 API 或 Worker；up 会重建并替换本项目 API 容器
rtk proxy python3 scripts/dev.py up
rtk proxy python3 scripts/dev.py worker
```

`rsshub` 命令保存本地容器地址到 `.local/rsshub.env`，不会覆盖账户凭据。`worker` 将该公开实例配置传给本地 Wrangler，正式 Worker 仍须单独配置。普通测试使用合成 JSON Feed 和独立测试库，不访问上游网站。

```sh
rtk proxy python3 scripts/dev.py check
rtk proxy python3 scripts/dev.py exec npm run build
rtk proxy python3 scripts/dev.py exec npm run worker:check -- --outdir .wrangler/test-build
rtk proxy python3 scripts/dev.py exec npm run test:live:rsshub -- ../.agents/validation/2026-10-17/rsshub/live.json
```

最后一条是显式真实来源验证：使用编译后的 Node worker，以及 workerd 的 Alarms/Queues，访问 BBC、豆瓣新书和 Hacker News，记录状态、数量、日期与重复采集结果；临时账户与测试正文结束后清理。数据源受网络、实例版本、反爬与上游变化影响，应按报告判断，不将“存在路由”写成“永远可用”。

本次固定镜像与两后端真实数量见 [2026-10-17 验收记录](../../.agents/validation/2026-10-17/rsshub/README.md)。

RSS3 转向 RSSHub 的背景与首版路线见 [官方公告](https://rss3.io/blog/the-next-stage-of-rss3.html)。RSSHub 保持独立服务及其 AGPL-3.0 许可，Melted 不嵌入其源码。
