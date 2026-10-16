# 实施记录

更新：2026-10-15。用户已授权开始实现。本轮交付第一个可运行的阅读闭环，版本 0.2.0；不代表 P0 或 M1 全部完成。

## 已实现

TypeScript + Hono 双入口：Node 24 / PostgreSQL 与 Workers / SQLite Durable Objects。服务器声明认证版本、可用方式与首选方式；支持预置账号密码/API Key、P-256 持有权及配置后的 OIDC 浏览器登录。密钥可自动开户并可关闭注册；运营者预置的账户仍可登录。15 分钟 access、30 天会话族、refresh 轮换与重放撤销；所有读取/写入按认证账户隔离。浏览器使用 state、双侧 PKCE、nonce、issuer/audience/exp/iat 和一次性短期授权码。认证不依赖 Apple 账号信息；可同步 Keychain 不等于 Apple 身份认证。

Dockerfile、Compose 迁移任务、Wrangler SQLite DO 配置、插件目标预检已提供。Apple Container 内运行所有本机后端、PG、workerd 与测试；旧 Go 源码已删除，数据库旧 schema/增量迁移保留，旧开发库已备份恢复到容器。

资讯列表、详情、词表、多维查询、中文子串搜索、固定快照分页、收藏/已读/隐藏的幂等与版本冲突，以及按账户锁排序提交的 changes 提示。分页快照有 TTL、账户容量与字节上限，不暴露原始信息流。列表的正文与证据字段为空，详情返回服务端导入的已整理内容；本机开发数据由管理 CLI 载入，没有面向 App 的样例入口或开发种子端点。

共享 OpenAPI 3.1、JSON Schema 与 TypeScript/Swift fixture；本机开发数据库/构建/测试脚本；Swift Package 分层为 MeltedCore、MeltedDesignSystem、MeltedRendering 和 macOS shell。没有提前引入商业能力。

原生 SwiftUI 资讯窗口、无侧栏布局、隐藏文字标题、右侧设置与 Spotlight 式组合搜索、双栏/窄窗导航；设置集中入口；亮暗两套 token 自动生成；100–200% 阅读字号；服务器运营者确认、登录、Keychain 会话恢复、真实服务端读写。Markdown 支持标题、正文、列表/任务列表、引用、代码、表格与受控链接；原始 HTML 不渲染，远程图片不加载。设置暂只开放已实现的外观和账户功能。

2026-10-15 进一步精修阅读详情：标题下的时间和操作合并，使用轻量原生按钮，普通核验说明下移至依据区；任务清单、分节间距、引用、表格和代码样式统一到共享阅读 token。新增状态仍默认在正文前提示。详见[阅读界面验收](validation/2026-10-15/reader-refinement.md)。

## 里程碑状态

| 里程碑 | 当前状态 | 仍需完成 |
| --- | --- | --- |
| M0 | 部分完成 | GPL/贡献许可确定、完整协议冻结、来源授权与质量语料、完整威胁模型 |
| M1 | 部分完成 | 邀请/恢复、摄取/上传、持久队列、租约 fencing、outbox、预算/同意、备份恢复、完整运维备份/导出 |
| M2 | 未开始 | RSS/URL/push、处理插件、真实模型与多模态、证据/聚类、输出安全与渠道 |
| M3 | 阅读链路已运行 | SQLite 缓存、snapshot/changes 重放、偏好/来源/关注管理、反馈、完整 Markdown/HTML 与附件验收 |
| M4 | 未开始 | QueryPlan、主动获取、调度、学习、memory 与回滚 |
| M5 | 未开始 | conformance、质量/安全/负载评测、签名公证、持续使用与 alpha 发布 |

## 本轮具体决策

- 先实现可验证的账户到阅读闭环。App 不内置占位内容，连接后只显示服务器实际提供的内容；本机开发数据由服务端管理 CLI 的 `import-demo` 命令导入到开发数据库，不经 App 操作。导入数据 `is_demo=true`，非模型输出，也不证明信息处理质量。
- discovery 返回 `registration=key|closed`；默认 key 允许通过持有证明创建新账户。已有 PG 账户可由管理员绑定公钥，不能根据邮箱自动关联。邀请、恢复、凭据管理 UI 尚未提供。
- 输入、主动获取、HTML、APNs 与完整 snapshot sync 均声明为未支持；不创建看似可用的占位接口或按钮。
- 查询首版采用 PostgreSQL / SQLite 字面子串，支持中文，不称为 FTS 或语义搜索；正式容量/召回需要单独验收。
- API 返回 development subset 的 OpenAPI，尚未冻结完整 v1。独立 schema 从同一 OpenAPI definitions 导出，测试检查一致性。
- macOS 部署目标 14，Swift tools 6.0；本机实际构建使用 Swift 6.4 / Xcode 27。本轮不实现 iOS 页面。
- Keychain 名空间包含 origin、server_id、account_id；不把服务器声称的同一个 ID 当作不同 origin 之间共享凭据的依据。发现/认证请求不跟随重定向；仅开发 loopback 允许 HTTP。
- SwiftUI toolbar 搜索焦点通过原生 NSSearchField 补齐；保留系统搜索与清除行为。
- 当前没有正文磁盘缓存，不把内存保留的内容宣称为完整离线支持。过期或撤销会话回到登录，网络失败保留已加载正文并提示重试。

## 下一步实现顺序

先补齐 M1：有权限的 text ingestion、receipt、持久队列/租约/fencing、取消与账户 generation、outbox、预算与处理目的地同意，再接可替换的 decision/generation provider。随后以授权 RSS/push 输入完成一条真实模型整理链路，保存质量、成本、失败和证据记录；继续完善 macOS 导入/来源/偏好/反馈和离线同步。没有真实 provider 或授权语料时，不用演示结果替代模型验收。

验证事实与缺口记录在 [TypeScript 验收](validation/2026-10-15/typescript-migration.md)；[旧版验收](validation/2026-10-14/implementation.md)仅保留历史事实。运行入口见 [项目 README](../README.md)。


Cloudflare 不使用 Hyperdrive 或外部 PostgreSQL；附件 R2、后台 Queues/Workflows、AI/memory 仍是后续集成，不把配置方案当作已完成业务。插件目前只检查部署兼容性，任何 enabled 插件都会因运行引擎未实现而阻止部署。

服务器协商认证的测试、原生登录/重启与截图见 [2026-10-16 认证验证](validation/2026-10-16/authentication.md)。
