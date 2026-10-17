# RSSHub 采集与原始入库验收

日期：2026-10-17，Asia/Singapore。范围为 TypeScript 服务端、双存储适配、可选 RSSHub 实例和共享协议；未改动客户端来源管理或启用 AI 整理。

本文保留初次实施验收；后续问题修复、58 个测试及真实来源复测见 [提交前完整复审](review.md)。

## 实现

- 内置 `rsshub@1.0.0`，仅 `collector.poll`；注册、预检和执行指向同一实现。未知或第三方可执行插件仍拒绝启用。
- 来源 CRUD、手动 sync receipt、原始元信息列表/正文和历史 revision；所有读取和修改按账户鉴权。配置版本控制与任务 generation/fencing 分开。
- 条件请求、当前窗口去重与修订；缺日期保持 null，HTML/媒体只保存原始数据，不执行或下载。partial 保留失败原因且不推进 checkpoint。
- Node 独立 worker + PostgreSQL 持久任务；Cloudflare SQLite DO + Alarms/事务 outbox/Queues。租约 90 秒、请求 30 秒，账户并发 2；恢复与停用/删除迟到写入均受栅栏限制。
- 固定运营者实例与允许路由、大小限制、持久退避和 Retry-After；发现接口如实披露采集目的地，密钥仅供服务端请求。
- 增量迁移、OpenAPI、fixture、配置示例、Compose profile、Apple Container 入口及 [运行指南](../../../../server/docs/rsshub.md)。

## 确定性与恢复验证

全部 Node/PostgreSQL/workerd 在 Apple Container 内运行。初次验收执行：

```sh
rtk proxy python3 scripts/dev.py check
rtk proxy python3 scripts/dev.py exec npm run build
```

类型检查、Prettier、12 个单元测试、37 个集成测试、插件预检与 Worker dry-run 全部通过；Worker 包为 953.54 KiB / gzip 166.04 KiB。测试数包含既有认证/阅读测试，新增采集测试没有替代旧测试。

共同契约覆盖：重复入库、不可变修订、缺日期、空 feed、304、原始 HTML、无效项、超大输入/继承元数据、超时/429/403、条件 checkpoint、跨账户读取/修改拒绝、并发领取、过期租约、fencing、账户并发上限、暂停保留、删除清理及迟到结果拒绝。

写入中断用第二条原始记录的 NOT NULL 约束失败注入，验证首条记录、run 和 checkpoint 同事务回滚；这是受控存储失败，不代表真实磁盘故障实验。Node 恢复测试实际启动进程、在请求中 SIGKILL，再启动两个 worker；测试将持久租约时间提前，以免等待 90 秒。Cloudflare 使用真实 workerd/SQLite、Miniflare Alarms 和 Queue consumer，在未投递 outbox 时重启、重复投递后无重复抓取，并再次重启验证已入库数据保留。

审查并修复的调度问题：状态查询不再推迟已安排的 alarm；outbox 在首次唤醒立即投递；alarm 的临时恢复唤醒成功后换成真实下一到期时间，继续保留更早的来源/清理任务。

## 增量迁移与打包

[迁移记录](migrations.json)：在独立临时 PostgreSQL schema 中建立 001/002 旧结构和已有账户/正文，使用编译后 CLI 执行两次迁移。003 新表存在，旧正文保留，重复迁移无重复执行。测试后删除该临时 schema。常规集成测试还并发重放迁移；DO 新表使用 source_schema 版本标记，在同步事务初始化，重启测试保留原始内容。

Compose YAML 已解析并检查 collector 停用 API HTTP healthcheck、RSSHub 只读及不发布端口。未在 Docker daemon 上启动完整 Compose 栈。实际运行证据来自 Apple Container；正式 Cloudflare 账号的 Queue/PITR/负载和公网部署未验收。

## 真实公开来源

实例由 Apple Container 运行，arm64/Linux，非 root、只读根文件系统、无主机公开端口、内存缓存，不配置浏览器或 Redis。镜像和实际运行时见 [instance.json](instance.json)：

```text
ghcr.io/diygod/rsshub@sha256:1db5e6b65a2cbabc95def7e495801ccd50ce5c77ade6408d454867333c28b1a4
```

实际采集用编译后的 Node worker，以及 workerd Alarms/Queues，两个后端分别建立隔离临时账户；完整开始/完成时间、返回数量、重复采集结果见 [live.json](live.json)。

| 类别 | 实际路由 | PG 新增/存储 | DO 新增/存储 | 无效 |
| --- | --- | --- | --- | --- |
| 新闻 | `/bbc/world-asia` | 18 / 18 | 18 / 18 | 0 |
| 文化生活 | `/douban/book/latest/fiction` | 10 / 10 | 10 / 10 | 0 |
| 社区 | `/hackernews` | 30 / 30 | 30 / 30 | 0 |

每端合计 58 条，六次首次任务全部 complete；重复采集新增均为 0。Node 重复采集返回当前窗口并计为重复，DO 重复请求收到 0 条；worker 错误计数为 0。豆瓣源未声明发布日期，入库保持 null。临时账户及原始正文已清理，记录只保留数量和日期，不提交抓取正文。

复现：先 `scripts/dev.py rsshub`，完成 build 与测试 Worker 打包，再执行 `scripts/dev.py exec npm run test:live:rsshub -- REPORT_PATH`。本机脚本核对容器实际镜像后注入版本；其他运营者实例未提供版本时报告 null，不冒称固定镜像。

## 验证边界

这证明上述版本与时间的三个真实路由可采集；没有逐项验证 RSSHub 全部路由、私人订阅、浏览器/Cookie 路由或旧 RSS3 DSL。feed 仅代表当前窗口，不保证历史回填、上游删除同步或停机不漏项。原始条目与 revision 保留至来源删除，运行记录继续保留，长期容量需运营者监测。

基础设施故障/恢复测试使用受控条件；尚无生产负载、长时间连续运行或远端 Cloudflare 运行证据。本记录生成时未执行公网部署、Git 提交/推送、AI 整理或原生来源 UI 验收；后续提交状态以 Git 历史为准。
