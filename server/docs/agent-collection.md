# DeepSeek Harness Agent 采集

独立 `deepseek-harness` collector 通过 Melted ACP 网关驱动 DeepSeek Harness。Node / PostgreSQL 与 Workers / SQLite DO 使用同一插件、来源 API、任务、去重和 revision；网关是独立 Node 进程，Worker 不启动子进程。配置面板使用现有有限 DSL，没有客户端插件 ID 分支。

当前范围是 **目标 → Agent 选择公开来源 → 工具抓取 → Agent 选择证据 → 原始入库**。AI 简报、自动聚类、偏好学习仍未接上；不能把这次采集能力描述成整个后处理流水线已完成。

## ACP 与数据边界

- 固定 `@deepseek-ai/dsh@0.2.0-rc.2`，完整依赖锁在 [agent-runtime](../agent-runtime/package.json)。[官方 ACP](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/acp/acp/README.md) 使用 ACP v1 JSON-RPC stdio；[ACP HTTP transport](https://agentclientprotocol.com/protocol/v1/transports) 仍为草案。Melted 网关的 HTTPS JSON 接口是自己的承载协议，不冒充标准 ACP HTTP。
- 网关每次生成独立 DSH home / workspace 和显式最小 profile，仅挂载 Agent kernel、模型、ACP 与本次 MCP 工具。不读取运营者日常 DSH home，不恢复旧会话，不挂载 bash、文件操作、插件管理、子 Agent、通用网络或 telemetry。工具只有 `collect_url`、`submit_collection`；ACP 文件/终端能力未声明，权限请求全部拒绝并使任务失败。
- `collect_url` 只能访问管理员声明的精确公开 HTTPS origins，禁止重定向、用户信息、fragment；网页不运行 JS，不自动抓附件、图片或链接。它接收 Feed 或 UTF-8 HTML/plain text，保留原文，缺失日期为空。Feed 条目 external_id 包含实际抓取 Feed URL 与上游 ID 的 hash，网页条目以实际抓取 URL 为 ID；原文链接另存 canonical_url。给模型的正文预览最多每条 12,000、每次工具结果累计 64,000 字符，并标注截断；实际入库仍是已校验的完整原文。HTML 不被解释成客户端代码。
- `submit_collection` 只能选择本次实际抓取并登记的 evidence IDs。Agent 的自由文本、思考、自己编写的标题/日期/正文不入库。必须成功抓取过至少一个来源才可提交空列表；未提交、伪造 ID、未完成 turn、超时都失败。来源局部解析/请求失败保留 partial warnings。模型筛选可能漏选；这不是事实核验或召回保证。
- 每任务至多 60 秒、10 次网页请求、20 条选择；每请求最多 2 MiB，证据累计 3 MiB / 200 条，单条沿用 256 KiB 上限。ACP 总输出 8 MiB、单帧 1 MiB。当前 90 秒宿主租约内结束，不为长任务延长所有采集器租约。
- 单网关并发 2，滚动 24 小时默认最多 24 次新运行；拒绝的重复提交不消耗额度。模型每 step 最大输出 2048 tokens，但墙钟时间/网页次数/每日运行数不是精确金额预算，当前不返回账单 token 统计。建议 Agent 来源按小时或更长间隔运行。超限后明确失败，修正配置或手动重试；不无限自动重试付费任务。

来源目标及新抓取的公开内容发送到模型。`/.well-known/melted/processing` 显示网关、模型 origin 与授权来源，purpose=`agent_collection`；不发送 Melted bearer、账户 ID、已有资料库或其他账户上下文。模型密钥只通过网关运行环境注入选定子进程，不出现在 DSL、receipt、错误或日志中。工具返回的内容始终是数据，不能扩大 origin / 工具权限。

## 运营者配置

先复制 [网关配置](../agent-gateway.example.json)。`profiles` 决定实例标签、允许抓取的网站及模型路由；`api_key_env` 指向网关环境中的密钥，JSON 本身不存密钥。当前适配 DSH 的 DeepSeek Messages provider，默认 `https://api.deepseek.com/anthropic`；其他 provider 需要独立实现/验证，不能仅替换成 OpenAI Chat Completions 地址。

服务器 `PLUGIN_CONFIG` 增加以下成员。`profiles` 的 `id`、`allowed_origins`、`model_origin` 必须与网关一致；每次请求校验 policy hash，不匹配时模型不会执行。label 可独立本地化。

```json
{
  "deepseek-harness": {
    "gateway_origin": "https://agents.example.com",
    "access_token": "replace-with-at-least-32-random-characters",
    "profiles": [{
      "id": "public",
      "label": "公开新闻与文化",
      "allowed_origins": ["https://feeds.bbci.co.uk", "https://www.bbc.com"],
      "model_origin": "https://api.deepseek.com"
    }]
  }
}
```

`access_token` 与网关环境 `MELTED_AGENT_GATEWAY_TOKEN` 相同，按服务端秘密管理。自托管专用容器可用 `http://agent-gateway:8430` 并显式设置 `allow_private: true`；生产 Cloudflare 必须连接运营者配置的公开 HTTPS 网关，部署预检拒绝私有网关。生产反向代理须保持认证头、关闭重定向，并给予至少 70 秒请求时限；不要公开 MCP endpoint 或把网关开放给未授权账户。

客户端配置：采集环境（服务器 select）、采集目标、起始网页/Feed、关注时间窗、条数/网页请求/运行时间上限。每个来源是一项独立周期任务，不接受用户自选命令、模型密钥、MCP 服务器或额外网络权限。建议先设置较长采集间隔，手动运行一次确认质量与成本；来源启用开关默认仍与现有来源表单一致，启用后会按间隔自动运行。

## 运行与部署

本机后端仍经 Apple Container。安装固定 runtime 后可运行网关；配置路径、数据目录及 DSH package 路径必须是**容器内**绝对路径。

```sh
python3 scripts/dev.py exec npm ci --prefix agent-runtime --ignore-scripts
python3 scripts/dev.py exec npm run agent:gateway -- /workspace/.local/agent-gateway.json
python3 scripts/dev.py collector
```

`scripts/dev.py exec` 从忽略的 `.local/plugins.env` 读取 `DEEPSEEK_API_KEY`、`MELTED_AGENT_GATEWAY_TOKEN` 等环境变量。不要将它们写入仓库或命令行。开发配置可使用 `/workspace/server/agent-runtime/node_modules/@deepseek-ai/dsh` 与 `/workspace/.local/agent-data`。网关和 API 在不同容器时使用显式授权的容器地址；配置后重启 API / collector。未提供密钥时网关拒绝启动，不回退到模拟模型。

可选容器入口：

```sh
docker compose -f compose.yaml -f compose.agent.yaml --profile agent up -d agent-gateway
```

[Dockerfile.agent-gateway](../../Dockerfile.agent-gateway) 将固定 Harness 和编译网关放入独立容器，非 root、只读根目录、独立数据 volume；不挂载宿主仓库。`MELTED_AGENT_CONFIG` 指向运营者配置文件。Cloudflare 不自动部署该容器；由运营者单独提供网关。

这套受限 profile 和 URL 检查不是任意第三方代码沙箱或 DNS/IP pinning；管理员应选择可信 origins，按部署需要配置实际网络出口隔离。不要替换固定 runtime 或把宽权限插件挂进该 profile 后继续沿用本次验证结论。

## 重试、恢复与保留

宿主将 owner / receipt / generation hash 成不透明 execution ID。网关 SQLite 先持久登记，再启动模型；同一 ID、同一输入复用结果，并发重复共享同一 promise；改变输入拒绝。崩溃留下的未知执行不会再次调用模型，返回 `agent_run_indeterminate`。手动重试会创建新的 receipt，可再次计费；这不是恰好一次外部计费保证。

成功结果和失败结果暂存于网关，供队列重复投递/宿主写入失败后复用；24 小时后由每分钟维护替换成过期状态。小型 ID/hash 墓碑保留，过期 ID 不自动重跑。SQLite journal / 备份仍按运营者保留策略管理。停机时维护暂停，重启先清理过期结果；未提供自动备份删除或网关远程擦除接口。

正常运行结束删除临时 DSH home / workspace；进程崩溃可能留下临时目录，停网关后可清理 `data_directory/workspaces`，不要删除 `runs.sqlite` 来“修复”重试，否则会失去去重记录。一个数据目录供一个网关服务实例使用。

Melted 停用/删除来源后仍以 generation/fencing 拒绝迟到结果。正常网关运行时，已经发出的模型调用可能继续至取消或 60 秒上限；来源删除不会撤回模型请求或立即清除网关 24 小时缓存，外部模型的保留政策由运营者负责。网关无用户资料库读取接口，不运行 AI 简报阶段。

## 验证命令

```sh
python3 scripts/dev.py check
python3 scripts/dev.py exec npm run test:acp
```

`test:acp` 必须安装独立 runtime，使用**真实固定版本 Harness + 合成 Messages 模型**，验证真实 ACP/MCP 三步循环与只有两个工具；它不证明真实 DeepSeek 模型的采集质量。普通契约测试通过真实 Node/PG 与 workerd/DO/Queues，驱动独立 ACP 子进程 fixture；真实模型与真实来源的联合验收需要运营者提供可用密钥，不能由 mock 结果替代。
