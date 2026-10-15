<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/lockup-dark.svg">
    <img src="assets/brand/lockup-light.svg" width="268" height="96" alt="Melted">
  </picture>
</p>

<p align="center">让信息回到适合阅读的样子。</p>
<p align="center">原生 macOS 阅读器 · 可自托管 TypeScript 服务端 · GPL-3.0-or-later</p>
<p align="center"><a href="#快速开始">快速开始</a> · <a href="#部署">部署</a> · <a href="#路线图">路线图</a> · <a href="CONTRIBUTING.md">参与贡献</a></p>

Melted 是一个通用个人信息工作台。资料、消息、观点和兴趣内容，在一个安静的阅读界面里浏览、搜索和收藏；数据服务可以运行在你自己的服务器上。

项目处于 **0.2 开发阶段**。当前交付的是身份、内容存储和原生阅读基础。自动采集、AI 整理与偏好学习仍在建设中，开发样例由项目编写，不代表模型生成质量。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/screenshots/reader-dark.png">
  <img src="assets/screenshots/reader-light.png" width="1120" alt="Melted 原生 macOS 阅读器：内容列表、统一搜索与阅读正文">
</picture>

当前 SwiftUI 构建的真实窗口，展示项目编写的开发样例。[连接入口](assets/screenshots/landing-light.png)同样使用暖色设计系统。

## 现在可以做什么

- **专注阅读**：SwiftUI / AppKit 原生窗口，暖纸白与暖炭灰主题，Markdown 标题、列表、引用、代码和表格，阅读字号可放大至 200%。
- **找到内容**：全部、未读与收藏视图；在统一搜索面板中组合正文、分类、标签和关注条件。
- **保留依据**：正文与来源分开呈现，区分有佐证、单一来源、尚未确认与存在不同说法。
- **自行部署**：Node.js + PostgreSQL，或 Cloudflare Workers + SQLite Durable Objects，共用 API 契约与隔离测试。
- **密钥登录**：P-256 私钥保留在 Apple Keychain，服务器保存公钥；另提供 OIDC 浏览器登录协议支持。

## 快速开始

需要 macOS、Xcode、Python 3，以及已启动的 [Apple Container](https://github.com/apple/container)。客户端最低目标为 macOS 14；本机 Node、PostgreSQL 和 workerd 均在容器内运行。

在项目根目录执行：

```sh
python3 scripts/dev.py up
sh scripts/build-macos.sh
open build/Melted.app
```

连接 `http://127.0.0.1:8421`，确认服务器后登录。没有内容时，可以在设置中载入开发样例；这一入口只在启用开发样例的本地服务器提供。

构建脚本会将唯一可用的 Apple Development 证书固定在本机 `.local/macos-signing.json`，后续构建沿用同一签名身份。多个证书或没有证书时需显式配置，详见 [开发签名](apps/macos/README.md#固定开发签名)。从旧临时签名迁移时，既有钥匙串项目可能需要一次授权；同步钥匙串不可用时，仍可明确选择本机凭据。跨设备同步和公证发行需分别验证。

| 快捷键 | 操作 |
| --- | --- |
| `⌘F` | 搜索与筛选 |
| `⌘R` | 刷新资讯 |
| `⌘,` | 设置 |
| `⌘+` / `⌘-` / `⌘0` | 放大、缩小、还原阅读字号 |

## 部署

| 方式 | 运行环境 | 持久化 | 配置入口 |
| --- | --- | --- | --- |
| 自托管 | Node.js 24 + Hono | PostgreSQL 17 | [Compose](compose.yaml) / [环境变量](.env.example) |
| Cloudflare | Workers + Hono | SQLite Durable Objects | [Wrangler](server/wrangler.jsonc) |

**自托管**：复制 `.env.example` 为 `.env`，填写随机 URL-safe 数据库密码、稳定 server ID、运营者与 HTTPS origin，再运行 `docker compose up --build -d`。迁移完成后 API 才启动；默认只绑定 `127.0.0.1:8421`，数据库不发布端口。公网访问需要 HTTPS 反向代理。环境变量可独立启动服务，可选 YAML 配置不会覆盖显式环境变量。

**Cloudflare**：填写 Wrangler 顶层 vars，在开发容器中运行 `python3 scripts/dev.py exec npm run worker:check` 验证配置及打包。配置自己的 Cloudflare 账号后再执行 `worker:deploy`；占位配置会被拒绝。当前不依赖外部数据库、Redis 或 VPS。

详细配置、OIDC 与迁移说明见 [部署指南](deploy/README.md) 和 [TypeScript 部署说明](.agents/15-typescript-transition.md)。生产数据库操作前先备份；旧账号不会自动合并。

## 开发

```sh
# 设计与生成资产、服务端双后端测试、Swift 测试和 macOS 构建
sh scripts/check.sh

# Cloudflare 本地模拟器（前台运行）
python3 scripts/dev.py worker

# 在容器内构建服务端
python3 scripts/dev.py exec npm run build

# 停止本项目容器，保留数据库卷
python3 scripts/dev.py down
```

`.local/` 存放本机环境文件，`melted-pg-data` 卷保存数据库。源码、配置模板和锁文件纳入 Git，真实凭据、数据库和构建产物不纳入 Git。

| 目录 | 内容 |
| --- | --- |
| `apps/macos` | 原生 macOS 应用 |
| `apps/apple/Packages/MeltedKit` | Swift 协议、设计系统与 Markdown 渲染 |
| `server` | TypeScript 领域模块、HTTP、PostgreSQL / Cloudflare 适配 |
| `contracts` | OpenAPI、JSON Schema 与共享 fixture |
| `assets/brand` | 同源矢量 Logo 与亮暗标识 |
| `.agents` | 产品设计、开发约定与带日期的验证记录 |

更多信息：[客户端模块与签名](apps/macos/README.md) · [服务端开发](server/README.md) · [设计索引](.agents/README.md) · [贡献指南](CONTRIBUTING.md)。

## 路线图

| 当前已有 | 后续计划 |
| --- | --- |
| 双部署、密钥身份、多用户隔离 | 来源采集、任务恢复与插件执行 |
| 搜索筛选、阅读与收藏状态 | AI 整理、证据核验、偏好与记忆 |
| macOS 原生阅读器 | 正文磁盘缓存与完整离线同步 |
| Swift 共享基础包 | iOS、可选 APNs 中继与发行准备 |

搜索目前使用字面子串匹配。查询快照上限为 5 分钟、2,000 条、8 MiB。原始 HTML 与远程图片不会在阅读器中执行或自动加载。完整进度与验证边界见[实施记录](.agents/14-implementation-status.md)。

## 许可

Copyright © 2026 Melted contributors。Melted 原创代码、文档与品牌资产采用 **GNU GPL 第三版或任何后续版本（GPL-3.0-or-later）**，不提供任何担保。完整条款见 [LICENSE](LICENSE) 与 [COPYRIGHT](COPYRIGHT)，第三方依赖见 [THIRD_PARTY.md](THIRD_PARTY.md)。本次不添加 App Store 分发例外。
