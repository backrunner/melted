# 服务端设置 DSL v1

服务器决定提供哪些账户偏好、表单字段及读写接口，Melted 使用原生控件渲染。该协议与采集插件目录独立，复用有限的 text/integer/boolean/select 表单词汇；text 可声明 `multiline: true`。不包含脚本、表达式、远程 HTML 或动态网络权限。

当前实现四类自然语言要求：分类与标签、想看到的内容、个人偏好、输出偏好。保存的是显式原文，不做静默推断。配置整理模型后，目录附加 `processing-actions-v1` 工作流：保存原文 → 显式同意编译 → 查看结构化草案 → 确认启用 → 自动处理已有与新增原文。未配置模型仍仅保存，返回 `application: "stored"`。修改已启用偏好会撤下旧生成内容并取消旧任务，新版本需重新编译确认。详见[自动整理管线](processing.md)。

## 发现与读取

`/.well-known/melted` 的 `capabilities.server_settings: 1` 声明此能力。缺省时客户端不请求或展示该入口；未知能力/DSL 版本提示升级，不猜测接口。服务器实现版本独立于 DSL 版本，字段可随服务器演进；每个 section 的 `schema_version` 标识其当前表单配置版本。

鉴权后的 `GET /v1/settings` 返回 [共享 fixture](../../contracts/fixtures/server-settings.json) 所示目录。每个 section 声明 id/title/description/form，以及：

```json
{
  "load": {"method": "GET", "path": "/v1/settings/preferences"},
  "save": {
    "method": "PUT",
    "path": "/v1/settings/preferences",
    "format": "versioned-values-v1",
    "max_bytes": 32768,
    "label": "保存偏好"
  }
}
```

客户端按声明的方法和路径发请求。v1 仅允许同服务器的 `/v1/settings/` 子路径，读取 GET、保存 PUT/POST/PATCH、JSON `versioned-values-v1` 格式；当前服务器实际声明并实现 PUT。不允许绝对 URL、查询/片段、百分号编码、路径穿越、认证端点、任意 header 或脚本。Bearer 仍由 API actor 管理，不交给表单。未知字段类型/传输格式禁用对应 section，其他可支持 section 不受影响。

## versioned-values-v1

读取返回 `{schema_version, version, values, application}`。从未保存时 version=0，values 使用表单默认值。保存提交 JSON：

```json
{
  "schema_version": 1,
  "expected_version": 0,
  "values": {
    "classification": "按文化、生活、工作分类，标注相关城市",
    "content": "关注本地活动，少看重复推广",
    "preferences": "保留不同观点和不确定性",
    "output": "简体中文，先给摘要，再列来源"
  }
}
```

同时提交 `Idempotency-Key`（1–128 个 ASCII 字母、数字或 `._:-`）。请求不得指定 owner。未知字段、错误类型、超长或无法跨后端存储的文本均拒绝；客户端和服务端分别校验。单字段最多 4096 UTF-16 单元，请求整体不得超过 descriptor 声明的 32 KiB。留空/清空表示不指定要求，完整 PUT 不做隐式字段合并。

成功响应回传完整状态，version 增加 1，客户端只在校验响应后更新已保存状态。网络失败保留输入；相同输入重试复用原幂等键。相同 key/相同请求重放原响应，不重复增加版本；不同请求使用同 key 返回 409。键至少保留 7 天，过期重试仍受 expected_version 保护。

schema_version 变化或并发修改返回 409。客户端保留编辑内容；版本冲突可重新获取最新目录与状态、展示服务器当前值供比较，再显式保存，格式变化则要求重新打开。加载失败可重试；编辑未保存时关闭会确认，保存期间阻止重复操作。

## 存储与验证

Node 使用迁移 `004_settings.sql` 的账户隔离设置、版本历史与幂等请求表；写操作在账户锁内检查版本并原子记录状态/历史/幂等响应/changes。Cloudflare 使用账户 DO 内相同语义的 SQLite 同步事务，哈希计算在事务外。读取和写入都由会话 owner 定位；设置正文不写日志；仅在用户同意编译后发送给声明的模型目的地，不交给采集插件。历史记录随账户删除级联；客户端历史浏览/回滚及完整账户删除 API 尚未实现。

共享契约见 [OpenAPI](../../contracts/openapi.json)、[JSON Schema](../../contracts/server-settings.schema.json)。重新生成使用 `rtk proxy python3 scripts/dev.py exec npm run contracts:settings`；表单词汇变更还需先运行 `contracts:plugins`。两后端测试覆盖鉴权、账户隔离、空态、清空、格式/类型校验、并发冲突、版本历史及幂等重试；Swift 测试覆盖描述符安全边界、未知版本和表单/保存状态。实际运行证据按日期记录在 `.agents/validation/`。

## processing-actions-v1

服务端可选下发 `workflow: {format, fingerprint, status, actions}`。status 为同服务器的 GET 路径，actions 仅含 compile/activate/reprocess、POST 路径、enabled_phases、label 和 confirmation。未知格式/动作/越界路径禁用，客户端不执行任意脚本或 header。配置指纹包含模型、目的地、阈值与预算，不含密钥；目的地/模型等变化需重新同意。API 请求格式是 `{expected_version, fingerprint, action}` 并带 Idempotency-Key；相同键重放不重复创建任务，返回最新处理状态。

状态 stored/pending/ready/active/failed 与原文保存独立；无模型为 unavailable，配置变化为 consent_required。GET 状态返回草案 preview、任务统计和保守预留调用数；`active` 表示当前策略已启用，不表示全部材料都成功生成。held/filtered 保留原文；失败可显式重试，仍受每日预算约束。GET `/v1/processing/jobs` 提供最近 50 项任务版本、错误码和各阶段实际模型/usage，不返回模型阶段正文或凭据。

## write-only-secrets-v1

可选的顶层 `credentials` 表单与自然语言 sections 分离，字段 type=secret，只支持 generator_key/decision_key。scope=account/server，由服务端模式及当前账户权限决定；普通用户不能通过修改 DSL 或请求路径获得管理员权限。服务器未开放客户端配置时完全不下发。客户端只按 descriptor 渲染 SecureField 与读取/保存动作，保留/替换/清除协议与加密存储详见 [凭据模式](processing.md#可选的客户端凭据配置)。密钥从不放进 versioned-values-v1、普通设置版本历史或表单 defaults。

原生偏好页仅展示四类自然语言输入。规则检查位于独立“整理规则”页面，主操作依次为保存、生成整理规则、检查并启用。任务统计与重试放在规则详情，避免挤占编辑区域；“草案”是协议内部 ready policy 的概念，不作为常驻 UI 区块。
