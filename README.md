# Melted

通用个人信息工作台。TypeScript 服务端与原生 Swift macOS 客户端；iOS 后续加入。先开源，后续探索商业化，内容不限定技术领域。

当前 0.2 基础版本实现多用户鉴权、资讯阅读、搜索筛选、阅读/收藏状态和变化提示。采集、真实 AI 整理、偏好学习、媒体上传、插件执行与 APNs 仍在后续计划中。样例均明确标记为项目编写的开发内容。GPL 具体版本与发行许可尚待确定，见 [许可说明](.agents/07-apns-apple-and-license.md)。

## 部署

| 目标 | 运行时 | 持久化 | 入口 |
| --- | --- | --- | --- |
| 自托管 | Node.js 24 + Hono | PostgreSQL 17 | [Dockerfile](Dockerfile)、[Compose](compose.yaml) |
| Cloudflare | Workers + Hono | SQLite Durable Objects | [Wrangler 配置](server/wrangler.jsonc) |

Cloudflare 无外部数据库、Redis 或 VPS 依赖。后续附件和后台任务分别使用 R2、Queues，并保留任务幂等与账户事务。详细部署、插件预检、OIDC 配置及旧数据库迁移见 [.agents/15-typescript-transition.md](.agents/15-typescript-transition.md)。

自托管：复制 `.env.example` 为 `.env`，生成随机 URL-safe 数据库密码，填写稳定 server ID、运营者与 HTTPS origin，然后运行 `docker compose up --build -d`。API 默认只映射 `127.0.0.1:8421`，数据库不发布端口；公网接入使用 HTTPS 反向代理。migrate 成功后才启动 API。

Cloudflare：填写 Wrangler 顶层 vars，通过容器执行 `npm run worker:check` 检查配置/插件并实际打包。准备好目标 Cloudflare 账号后执行 `npm run worker:deploy`；该命令会拒绝占位配置。当前没有代替用户发布公网实例。`local` 环境仅用于模拟器。

## 本机开发

依赖 Apple Container（system 已启动）、Python 3 与 Xcode。Node、PostgreSQL、workerd 全部运行在 Apple Container 内，无需主机安装 Node 或 Go。

```sh
python3 scripts/dev.py up
sh scripts/build-macos.sh
```

启动 `build/Melted.app`，连接 `http://127.0.0.1:8421`，确认服务器后继续。默认生成 P-256 凭据，私钥保存在可同步 Keychain，会话仅留当前设备；服务器只保存公钥。iCloud Keychain 不代表 Apple 身份已验证。ad-hoc 构建可能无法访问同步钥匙串，此时可明确选择本机凭据；重新签名可能触发 macOS 钥匙串授权。正式签名与跨设备同步需要单独验收。设置中的“载入开发样例”仅在本地开发服务器显示。

```sh
# 可选 Cloudflare 本地模拟器（前台运行）
python3 scripts/dev.py worker
# 检查两个后端；测试自行启动隔离的 workerd，不依赖上述模拟器
sh scripts/check.sh
# 在容器内运行 Node 命令
python3 scripts/dev.py exec npm run build
# 停止本项目容器，保留数据库卷
python3 scripts/dev.py down
```

`.local` 保存 0600 环境文件，`melted-pg-data` 保存数据库。重复 setup 不重置数据库。迁移旧 Go 安装前先备份；旧 001 schema 与增量 002 保留，账户和内容不自动合并。管理员可用 CLI 绑定公钥恢复旧账户，详见迁移文档。

## 客户端与契约

标题栏保留全部/未读/收藏；搜索与分类、标签、关注组合进入 Spotlight 式面板，设置位于右侧。⌘F 搜索、⌘R 刷新、⌘, 设置、⌘+/⌘-/⌘0 调整阅读字号。分类为轻量胶囊，阅读器使用暖纸白/暖炭灰配色。Markdown 原始 HTML 与远程图片不执行/加载。

- [服务端目录与开发约定](server/README.md)
- [设计与开发索引](.agents/README.md)
- [实施状态](.agents/14-implementation-status.md)
- [后端验收](.agents/validation/2026-10-15/typescript-migration.md)
- [原生界面验收](.agents/validation/2026-10-15/reader-refinement.md)
- [OpenAPI](contracts/openapi.json) 与 [共享 fixture](contracts/fixtures/development-library.json)

当前查询为中文可用的字面子串，不是语义检索；查询快照有 5 分钟、2,000 条、8 MiB 上限。没有正文磁盘缓存、完整离线同步或账户恢复 UI，不把基础阅读闭环当作完整 AI 产品。
