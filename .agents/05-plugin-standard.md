# 插件标准草案 v1

更新：2026-10-17。已实现受信任模块注册、设置 DSL v1、原生来源管理，以及独立 RSSHub `collector.poll`、持久任务与原始入库；远程第三方插件执行与模板属于后续能力，原生正文呈现边界与 [UI v1.1](11-ui-design-system.md)一致。

## 运行形态

自托管支持后续独立进程 HTTP/JSON；Cloudflare 只接受明确声明兼容的 Worker module 或 HTTPS 远程实现，不运行宿主进程、文件系统/原生扩展或任意 WASM 宿主能力。插件版本和协议版本分别管理。独立进程不是自动沙箱，安全隔离需真实操作系统/容器权限；首期只有管理员可安装可执行插件。

插件能力按操作、媒体和来源定义，不把技术领域作为准入条件。文化活动、工作消息、个人资料和技术资讯的采集器使用同一输入协议；领域专用 rubric/模板由配置声明，不能要求修改核心 schema。主动获取能力取决于来源接口，不取决于主题是不是技术。

| 类型 | 能力 | 首期参考实现 |
| --- | --- | --- |
| collector | poll、可选 pull/query，返回 ingest envelope | 内置 RSS/Atom；外部 HTTP collector |
| provider | decision/generate/embed/vision/transcribe/search | Jev、生成模型、图像/ASR adapters |
| stage | 声明 schema 的自定义阶段 | 文本规范化示例 |
| memory | upsert/search/delete/summarize | 账户存储适配器；外部协议参考服务 |
| channel | 授权目标交付及纠正 | 内置 HMAC webhook；外部渠道示例 |

插件仅声明实际能力；poll/pull 语义区分。每种类型提供契约 fixture，核心流程不依赖外部 mem/stage。首期外部 memory 示例验证协议，不代表已经选定任何商业 mem 厂商。

## 部署兼容性预检（已实现）

`server/plugins.json` 保存启用清单；`server/src/modules/plugins/compatibility.ts` 校验 targets、runtime、capabilities、required_bindings 与 HTTPS endpoint。未知能力、缺失 binding、Cloudflare 的本地进程/文件系统/原生扩展/raw TCP/常驻进程均拒绝。`npm run worker:check` 还实际打包 Worker；`worker:deploy` 先拒绝占位服务器配置。注册表按已编译模块核对身份与 manifest；目前随包提供 `rsshub@1.0.0`、runtime=builtin 和 `collector.poll`，与实际执行一致；Cloudflare 还要求 COLLECTION_QUEUE。其他 enabled 插件仍明确阻止部署，不会静默忽略。部署预检通过不表示插件代码已沙箱化。

部署 descriptor 与下方业务协议 manifest 分开；前者描述能否运行，后者描述能做什么。内置实现见 [RSSHub 指南](../server/docs/rsshub.md)；以下远程请求/返回、外部来源权限、样例插件仍属目标契约。

## 原生设置 DSL（已实现）

模块接口与注册方法见 [插件开发说明](../server/docs/plugins.md)。`GET /v1/plugins` 返回 DSL v1：text/integer/boolean/select 字段、校验约束与动作描述；来源保存 plugin/config_version/configuration。原生客户端根据有限语法渲染设置，不执行服务端代码、HTML 或任意 URL。动作 ID 由插件定义，v1 效果仅限 host 的 collect/validate，额外动作参数未开放。运营者秘密与账户设置分开。模块升级改变语法或配置版本时拒绝静默回退。

## Manifest（远程协议目标）

`GET /melted-plugin/v1/manifest` 有大小上限，管理员核对再授权。示例使用 Melted 定义的字符串：

```json
{
  "id": "org.example.collector",
  "version": "0.1.0",
  "protocol": {"min": 1, "max": 1},
  "types": ["collector"],
  "capabilities": ["collector.poll", "collector.pull"],
  "permissions": {
    "network_hosts": ["feeds.example.invalid"],
    "data_scopes": ["source.config", "subject.query"],
    "secret_refs": ["source_access"]
  },
  "input_schema": "melted.collector.request.v1",
  "output_schema": "melted.ingest.envelope.v1",
  "limits": {"max_concurrency": 2, "timeout_seconds": 30, "max_response_bytes": 1048576},
  "license": "GPL-3.0-or-later"
}
```

host 取运营者授权、用户权限和声明的交集，manifest 不自行扩权。安装元数据附 config schema、维护者、镜像 digest/签名、文档与处理目的地。schema 用已登记 ID，不从任意 URL 加载。升级权限/数据去向须重新批准及必要的用户同意；签名只证明来源。

## 请求与返回

host `POST /melted-plugin/v1/invoke`，每插件短期 token 或 mTLS。远程服务用 TLS；本机 sidecar 仍有服务认证和进程权限。

```json
{
  "protocol_version": 1,
  "operation": "collector.pull",
  "request_id": "req_01",
  "idempotency_key": "run_01:source_01",
  "deadline": "2026-10-13T08:00:30Z",
  "context": {"owner_ref": "opaque_owner", "source_ref": "src_01", "trace_id": "trace_01"},
  "input": {"query": "相关产品发布", "time_window_hours": 24, "cursor": null, "max_items": 20}
}
```

只传操作必要上下文。响应 result/error 联合，不同时存在；含 request_id、schema_version、partial、next_cursor、usage、warnings。host 验证 schema/所有权，不信任插件提供的 owner、费用或 citation ID。

首期同步 invoke 有 deadline，host 拆块、持久重试；不开放任意 callback URL。可选 `POST /melted-plugin/v1/cancel`；`GET /melted-plugin/v1/health` 返回就绪/存活。超大响应、超时、无效 schema/越权明确失败。

collector 返回 envelope 数组及 cursor，host 入库成功才提交 cursor；external_id 去重。推送采集器也可用 scoped token 调公开 ingest，不必常驻。provider 返回标准产物、实际 model/version、usage、finish_reason；host 配置价格对账，confidence 保留来源语义。

memory 条目稳定 ID、TTL/反馈引用、用户与记录级删除、幂等重试；无删除能力不进入官方兼容目录。channel 只接收授权 document projection 与 delivery_id，支持 publish/correct；不支持原位修正则发新纠正消息。accepted 不等于用户已读。

## 权限、密钥与隔离

不给整个数据库连接或全部 keys。优先 host broker 代发网络请求/签名，否则只挂载所需 secret。临时对象 URL 绑定本次内容；不同 owner 不共享。

网络 allowlist 必须由容器/egress proxy 实施，manifest 自述无强制效果。非 root、只读文件系统、限临时空间/CPU/内存、不挂 Docker socket、不用 host network、不挂无关目录。第三方插件默认禁用，安装展示权限/许可。内网源仅按插件/目标放行，不关闭全局 SSRF 保护。

## 自定义流程

登记 DAG：`normalize -> candidate -> extract -> classify -> verify -> compose -> validate -> deliver`。hook 可插入/替换 stage，启动校验环、schema、版本、步数、deadline/总预算。每个 run 固定 pipeline version。

插件可改处理内容与建议，不能绕过身份/所有权、用户传输同意、预算、输出安全和审计。可降低核验深度但必须如实标注范围，不得直接写“已证实”绕开 evidence 规则。Markdown/HTML 都经 host sanitizer。

normalize/extract 可输出通用 InformationUnit，事件聚类与外部核验按内容性质选用；`not_applicable` 是明确产物，不是插件失败。静态 HTML 模板仍未接入当前 App。后续模板只控制正文允许的结构与样式，不能修改原生 App 导航、按钮、字号设置、证据标识或权限提示；使用共享亮暗 palette 与阅读宽度，不注入品牌条、背景融化、反馈按钮或大核验卡。主题和渲染边界见 [UI 规范](11-ui-design-system.md)。

失败策略 `stop|skip_optional|use_last_valid`；后者限不影响真实性/权限且有新鲜度限制的阶段，不复用过期证据或别的用户结果。失败断路，管理员可停用/回滚。

## 社区契约

发布 schema、fixture、verifier/conformance runner，覆盖 manifest、幂等、cursor 重放、deadline、取消、隐私删除、越权、超大返回和错误分类。首期参考插件和贡献文档优先于插件市场。

独立进程不自动免除 GPL，需看实际耦合与派生关系；SDK/schema/官方插件的许可在发行前单独决定，不承诺任意闭源插件必然合规。详见 [许可文档](07-apns-apple-and-license.md)。
