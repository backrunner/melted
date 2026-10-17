# RSSHub 提交前完整复审

日期：2026-10-17，Asia/Singapore。复审范围为内置插件注册、输入归一化、来源 API、双存储事务、任务恢复、部署配置与验收材料。此前实施记录见 [初次验收](README.md)。本次没有修改原生客户端或启用 AI 处理。

## 发现与修复

| 问题 | 修复与回归证据 |
| --- | --- |
| 同一 feed 中相同 external ID 对应不同内容，每轮可能反复新增 revision | 归一化阶段识别冲突，拒绝该 ID 的全部冲突项并报告 `conflicting_external_id`；保留已存版本和 checkpoint。相同 ID、相同内容仍作为重复处理。两端集成测试验证连续重放不会制造修订。 |
| NUL 或孤立 UTF-16 surrogate 可通过 JSON 输入，却导致 PostgreSQL JSONB 整批失败，与 SQLite 不一致 | 共用文本可移植性校验，单条异常只计无效；来源配置、路径 ID 和 cursor 同样拒绝异常文本。有效 emoji 保留。两端验证无效输入返回 400，其他条目仍能提交。 |
| 日期解析会接受不存在的日历日期；大整数 ID 已在解析中失真 | 使用带时区的严格 ISO 日期校验，缺日期继续为 null；数值 ID 仅接受安全整数。验证非法日期、闰日、时区及超出安全整数范围。 |
| 更换 RSSHub 实例或凭据后仍可能带上旧 ETag/Last-Modified | checkpoint 绑定实际请求目标的 SHA-256；目标变化后重新获取当前窗口。仅保存摘要，来源接口不暴露 checkpoint 或凭据。 |
| 运行时插件启用判断比预检宽松，可接受缺失能力、重复或未知启用项 | 运行时与预检共用严格设置 schema 和内置插件注册；目标、runtime 和 capability 必须精确匹配，异常配置关闭执行。 |
| 列表在数据库/RPC 读取完整正文后才去掉正文，批量长文会放大传输开销 | PostgreSQL 和 SQLite 查询直接投影元信息；仓储与 Cloudflare RPC 使用 `RawItemSummary`。回归断言列表没有 `content` 字段。详情接口继续返回原始正文。 |
| feed 级作者等继承元数据可使归一化批次显著超过响应限制 | 在单条 256 KiB 限制外增加归一化批次 4 MiB 上限，超限项报告 `batch_too_large`，不推进 checkpoint。 |
| 极大 Retry-After 在解析后等待事务，提交时间差可使日期溢出，破坏状态查询 | 在持久化任务时再次限制可表示时间范围；回归先复现越界，再验证 receipt 能输出重试时间。普通 Retry-After 的持久化两端契约测试继续通过。 |

先加入的五个复审回归测试在原实现上失败，再逐项修复；另补充继承元数据批次上限测试，最终检查又复现并修复 Retry-After 日期溢出。已有租约、fencing、暂停/删除、outbox、重启和跨账户测试继续执行，没有用新测试替换原有测试。

## 最终检查

所有 Node、PostgreSQL 和 workerd 运行均在 Apple Container 中完成：

```sh
rtk proxy python3 scripts/dev.py check
rtk proxy python3 scripts/dev.py exec npm run build
rtk proxy python3 scripts/dev.py exec npm run test:live:rsshub -- ../.agents/validation/2026-10-17/rsshub/review-live.json
rtk proxy python3 .agents/skills/melted-guard/scripts/check_design.py --repo .
rtk proxy git diff --check
```

- 类型检查、Prettier、19 个单元测试、39 个集成测试、插件预检和 Worker dry-run 全部通过。共 58 个测试，包含既有认证/阅读测试。Worker 包为 957.35 KiB / gzip 166.94 KiB。
- `npm run build` 通过；[编译产物启动检查](compiled-smoke.json)验证 API health 200、发现接口声明 rsshub、未认证来源请求 401、SIGTERM 正常退出，错误数 0。
- [增量迁移重放](migrations.json)使用编译后 CLI，从 001/002 和已有账户/正文升级，两次执行后保留旧数据并存在 003 来源表；临时 schema 已清理。
- 文档、链接、JSON 和现有设计 token 检查通过；此检查不代表原生 UI 或生产运行验收。

## 真实来源复测

固定实例镜像与首次验收相同，版本见 [instance.json](instance.json)。[复测记录](review-live.json)包含 2026-10-17 11:13 UTC 的实际请求时间、数量与重复采集结果。

| 来源 | PostgreSQL 新增/存储 | SQLite DO 新增/存储 | 重复采集新增 |
| --- | --- | --- | --- |
| BBC `/bbc/world-asia` | 18 / 18 | 18 / 18 | 两端均 0 |
| 豆瓣 `/douban/book/latest/fiction` | 10 / 10 | 10 / 10 | 两端均 0 |
| Hacker News `/hackernews` | 30 / 30 | 30 / 30 | 两端均 0 |

每端共 58 条，首次任务全部 complete，无效项和 worker 错误均为 0。豆瓣未提供发布日期，入库保持 null。实际路径为编译后 Node worker 与 workerd Alarms/Queues；临时账户及正文均已清理，提交材料不包含抓取正文或凭据。

## 剩余边界

验证覆盖本机真实 PostgreSQL/workerd、受控恢复场景及上述三个公开路由，不代表所有 RSSHub 路由或生产 Cloudflare 运行。尚未验证 Docker daemon 完整 Compose 启动、生产负载、长期连续采集、私人订阅或浏览器/Cookie 路由；没有执行公网部署。当前 feed 窗口不保证历史回填或停机不漏项，原始内容不会自动生成简报。
