# Feed collector 验收 — 2026-10-17

## 交付范围

独立 `feed@1.0.0` collector 支持 RSS 2.0、Atom 1.0、JSON Feed 1/1.1；复用注册、SDK、来源 CRUD、持久任务、去重/revision 与原始入库。RSSHub 保持独立，只把 JSON Feed 规范化移动至共享 ingest/feeds。SDK 目的地改为数组，同时更新 RSSHub、boilerplate 与 host；未添加旧接口兼容桥，无新数据库格式或迁移。

DSL 加入受限 `text.format=url`，Feed 声明 URL、格式、单次条数及 list/table。每条订阅仍有独立 source、任务和 checkpoint，运营者可声明多选建议。Swift 复用原生表单，select 使用与其他设置一致的菜单控件。

网络仅允许运营者列出的精确 origin。Node 私有/HTTP origin 需要单独授权，生产 Cloudflare 拒绝私有配置。禁止重定向、DTD/外部实体及额外内容请求，有界响应/正文/树深度；不是任意域名爬虫或 DNS 固定实现。配置与运行入口见 [Feed 指南](../../../../server/docs/feed.md)。

## 自动回归

本机服务端全部在 Apple Container 内执行，Swift 原生构建：

| 检查 | 实际结果 |
| --- | --- |
| `python3 scripts/dev.py check` | TypeScript、Prettier、42 单元、45 集成、双插件预检、Worker 打包全部通过 |
| PG / workerd 同套契约 | 来源 API、三种 Feed、多来源、条件请求、修订、partial 重试、跨账户拒绝、重定向失败通过 |
| 共享 host 回归 | 取消/删除 generation、租约/fencing、并发、重复 Queue、事务中断、outbox/Alarms 恢复和迁移重放通过 |
| Swift MeltedKit | 19 Core + 4 DesignSystem 通过 |
| Swift macOS | 20 通过 |
| 开发脚本 | 6 个 Python 测试通过 |
| Node 编译与迁移 | `dev.py up` 实际安装锁定依赖、迁移、编译并启动 API，通过；audit 0 漏洞 |
| macOS 构建 | `sh scripts/build-macos.sh` 通过，0.2.0 (13)，com.alkinum.melted |
| Worker 包 | 1062.21 KiB，gzip 189.32 KiB，dry-run；未上线 |

合计 136 个测试（87 服务端、43 Swift、6 开发脚本）。新增 Feed 单元测试覆盖缺日期、非法日历日期、HTML 原样保存、XML 命名空间/编码、DTD/实体/深树拒绝、空窗口、单条无效、内容修订、格式不符、大小与数量限制、URL/授权、多目的地披露和条件请求绑定。畸形运营者 URL 通过 safeParse 明确拒绝，不从 URL 构造器抛出未分类异常。

## 真实公网来源

[原始报告](live.json)，请求时间 2026-10-17 13:40 UTC。两个运行时分别创建隔离账户，经真正后台进程或 DO/Alarms/outbox/Queues 入库，然后重复采集；结束清理测试账户与 DO 持久目录。

| 来源 | Node 首次入库 | workerd 首次入库 | 重复采集 |
| --- | --- | --- | --- |
| BBC World，RSS 2.0 | 25 | 25 | 两端 25 重复、0 新增 |
| GitHub RSSHub releases，Atom 1.0 | 10 | 10 | 两端条件请求无更新、0 新增 |
| jsonfeed.org，JSON Feed | 2 | 2 | 两端条件请求无更新、0 新增 |

没有标题/内容合成或抓取代理。Atom 只有 updated 的条目保留 published_at=null，不以采集时间冒充发布日期。

[默认 CA 首次报告](live-default-ca.json)也保留：Node 成功，Linux workerd 三个站点均遇到 `unable to get local issuer certificate`，任务维持可重试错误，没有误报空 feed。第二次通过 NODE_EXTRA_CA_CERTS 补入同容器 Node 内置公开根证书，TLS 校验保持开启，三种来源才全部成功。复现命令在 Feed 指南中；没有修改生产 Worker 信任配置。

## 原生操作与证据边界

macOS 27.0.1 / arm64，100% 阅读字号，来源面板 760×520 pt、编辑面板 620×520 pt。构建身份见 [native-build.json](native-build.json)。同一 checkout 有并行的阅读界面工作，未将其源码/文档纳入本提交。

- 手动添加 BBC Feed，选择 RSS 2.0、20 条、暂停自动采集；保存后出现在表格，重新编辑值保持一致。
- 含用户信息的 URL 在本地验证阶段禁用保存；有效地址恢复保存。
- 深浅色表单及表格、深色 list/table 切换已实际操作；长 URL 在列表中完整展示、表格中按列截断。
- 验收只创建一个暂停的临时来源，没有触发真实账户采集；结束已按精确来源名称、配置及版本清理，未删其他资料。主题恢复为原有深色。

[深色表单](native-dark-form.png) · [浅色表单](native-light-form.png) · [深色表格](native-dark-table.png) · [浅色表格](native-light-table.png) · [深色列表](native-dark-list.png)

滚动捕获出现过标题/底栏未完整合成的画面，也观察到正常稳定画面；期间同一 App 被其他工作操作。临时共享面板裁切实验未能稳定证明有效，已撤回，不列为已修复或滚动稳定性通过。[捕获样本](native-light-form-scrolled.png)仅为诊断证据。未进行 VoiceOver、200% 字号、全屏或完整辅助设置矩阵，不宣称 iOS UI 或线上 Cloudflare 验证通过。

## 限制

不支持 RSS 1.0/RDF、网页自动发现、自动跳转、附件下载、全文补抓、私人凭据输入或历史回填。没有生产部署；本地可信 CA 补充不代表线上网络状态。原始数据不自动生成资讯或调用 AI。
