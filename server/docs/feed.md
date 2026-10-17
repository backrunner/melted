# RSS、Atom 与 JSON Feed 订阅

`feed@1.0.0` 是独立 collector，通过 `BaseCollectorPlugin` 接入统一注册、来源 API、后台任务和原始数据存储。它直接请求 Feed URL，不依赖 RSSHub。客户端从 `/v1/plugins/feed` 获取表单、list/table 集合和动作，没有 Feed 专用页面。

## 运营者配置

在 `PLUGIN_CONFIG` map 中加入 `feed`（Node YAML 对应 `plugins.feed`）；API 与采集进程必须使用同一配置：

```json
{
  "feed": {
    "allowed_origins": ["https://feeds.bbci.co.uk", "https://github.com", "https://www.jsonfeed.org"],
    "suggestions": [
      {"value":"https://feeds.bbci.co.uk/news/world/rss.xml","label":"BBC 世界新闻","group":"新闻"},
      {"value":"https://github.com/DIYgod/RSSHub/releases.atom","label":"RSSHub 发布记录","group":"项目"},
      {"value":"https://www.jsonfeed.org/feed.json","label":"JSON Feed 公告","group":"项目"}
    ]
  }
}
```

`allowed_origins` 是运营者信任的精确 HTTPS 站点，不接受通配符、路径、凭据、非默认端口或 IP 地址。账户可选择这些站点上的 Feed 路径和查询参数，不能新增目标服务器。`suggestions` 可省略；建议不是授权规则，所有 URL 都经过同一 origin 检查。多个允许站点会逐一进入 processing manifest，地址变化会改变声明版本，discovery 的 collectors 按插件去重。

Node 确需内部/HTTP 来源时，只能逐个写入 `private_origins`，例如 `{"private_origins":["http://127.0.0.1:12000"]}`；这明确授权该 origin，不开放其他内网目标。两个列表合计最多 50 个不同 origin。生产 Cloudflare 预检拒绝任何 private_origins。

这是运营者指定上游的模式，不是对任意用户域名开放的爬虫。运营者应只批准自己信任的站点，并在部署层限制出站网络；origin 检查不等于 DNS/IP 固定或网络沙箱。当前不提供任意公网 URL 的 DNS 重绑定防护模式。无自动重定向、HTML 页面查找 Feed、附件下载、全文补抓、分页或私人 Feed 凭据输入。

本机 Apple Container 的额外插件配置统一放 `.local/plugins.env`，其中 PLUGIN_CONFIG 包含所有插件。`dev.py rsshub` 只更新 map 的 rsshub 项，保留 feed 等其他配置；更新后执行 `dev.py up` 并重新启动独立 collector。不要将秘密提交到仓库。

## DSL 与来源配置

| 字段 | DSL 控件 | 规则 |
| --- | --- | --- |
| `url` | text + `format:url` | 完整 HTTP(S) Feed 地址，最多 2048 字符；禁止用户信息、空白、反斜线、fragment 和无效百分号编码；服务器再检查允许站点 |
| `format` | select | auto（默认）、rss、atom、json；指定格式不匹配时明确失败 |
| `max_items` | integer | 1–100，默认 100；可选 20/50/100 或自定义 |
| name / enabled / interval_seconds | 共用来源表单 | 名称、自动采集、默认 900 秒且最短 300 秒 |

列表/表格每行对应独立 source、设置、启停、任务和 checkpoint。配置了 suggestions 时可多选批量添加；也可输入自定义地址。`collect` 提交异步任务，`validate` 只检查配置及授权站点，不证明上游实时可用。

```json
{
  "plugin":"feed", "config_version":1, "name":"BBC 世界新闻",
  "configuration":{"url":"https://feeds.bbci.co.uk/news/world/rss.xml","format":"auto","max_items":100},
  "enabled":true, "interval_seconds":900
}
```

调用 `POST /v1/sources` 并带 Idempotency-Key 创建；后续管理、动作、receipt、items 与 raw-items 使用现有账户鉴权接口，见 [插件 API](plugins.md)。客户端 URL 字段只提供输入/校验，不直接访问该地址。

## 解析与存储

- 支持 [RSS 2.0](https://www.rssboard.org/rss-specification)、[Atom 1.0](https://www.rfc-editor.org/rfc/rfc4287) 和 [JSON Feed 1/1.1](https://www.jsonfeed.org/version/1.1/)。auto 根据实际 JSON/XML 结构识别，不依赖文件扩展名或只相信 Content-Type。
- 保存原始标题、正文/摘要、链接、作者、语言、时间、标签与媒体引用。RSS content:encoded 优先于 description；Atom 支持 text/html/xhtml、xml:base、xml:lang 和摘要。外部 content src 不发起请求；只有标题的 XML 条目用原始标题作为文本内容。
- 原始 HTML 不可信，不执行。XML 使用严格 SAX，禁止 DTD/自定义实体，最多 64 层、20,000 个元素、每元素 100 个属性。响应最多 4 MiB，30 秒超时；正文条目最多 256 KiB。识别 UTF BOM、HTTP charset 与 XML encoding，无法解码明确失败。
- ID 优先使用 RSS guid / Atom id，其次原文链接；都缺失时以内容 hash 标识。最后一种情况内容变化视为新条目，无法推断稳定修订关系。没有发布时间保持 null；Atom updated 单独保存，不能代替 published；无效日期使该条目 partial。
- 单次只处理 Feed 顺序中的前 max_items 条，其余处于本次窗口之外，不计作无效。最多接受 1,000 个条目的文档。空 Feed 为成功；选定窗口内无效条目记录 partial，不推进 checkpoint。没有历史回填或停机不漏项保证。
- ETag/Last-Modified 绑定规范化 URL、格式和条数上限；改变设置不会复用旧条件请求。304 必须有匹配的 validator。按 owner/source/external ID 去重，内容变化建立 revision；事务、租约、取消/删除栅栏与重试仍由共用 host 管理。

## 验证入口

`rtk proxy python3 scripts/dev.py check` 覆盖共享检查及真实 workerd/PG 集成。`tests/unit/feed.test.ts` 覆盖格式、编码、XML 限制、授权、条件请求和字段语义；`tests/integration/feed-runtime.test.ts` 通过真实 HTTP fixture 在两端执行来源 API、持久采集与隔离。Swift 使用同一 plugin-settings/feed-source fixture 验证 URL/select/integer/list/table。

显式的公开来源验证：先配置上述 origin，执行编译及测试 Worker 打包，然后运行：

```sh
rtk proxy python3 scripts/dev.py exec node --import tsx tests/live/feed.ts ../.agents/validation/2026-10-17/feed-collector/live.json
```

测试只向专用测试库和隔离 DO 写入临时账户，结束后清理；不修改既有订阅。它报告真实成功或失败，不属于确定性回归测试，也不代表生产 Cloudflare 已部署。

本地 Linux workerd 如果报告 `unable to get local issuer certificate`，可显式补入同容器 Node 自带的公开根证书后重试；仍验证上游证书，不使用跳过 TLS 的开关。这只影响该次本地测试，不改变生产 Worker：

```sh
rtk proxy python3 scripts/dev.py exec node --input-type=module -e 'import {rootCertificates} from "node:tls"; import {writeFileSync} from "node:fs"; writeFileSync("/workspace/.local/feed-public-ca.pem", rootCertificates.join("\n"))'
rtk proxy python3 scripts/dev.py exec env NODE_EXTRA_CA_CERTS=/workspace/.local/feed-public-ca.pem npm run test:live:feed -- ../.agents/validation/2026-10-17/feed-collector/live.json
```

首轮默认 CA 失败与补入公开根证书后的实际结果分别保留于 [Feed 验收](../../.agents/validation/2026-10-17/feed-collector/README.md)，不把环境问题记为上游空更新。
