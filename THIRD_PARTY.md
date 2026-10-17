# 第三方依赖

Node 依赖由 server/package-lock.json 锁定，Swift 依赖由 Package.resolved 锁定。Melted 原创部分采用 GPL-3.0-or-later；下列第三方依赖保留各自许可证与版权声明。

| 依赖 | 版本 | 用途 | 上游许可 |
| --- | --- | --- | --- |
| Hono | 4.13.13 | Node/Worker 共享 HTTP | MIT |
| @hono/node-server | 2.1.5 | Node 原生适配 | MIT |
| pg | 8.23.1 | PostgreSQL | MIT |
| zod | 4.6.7 | 输入/产物校验 | MIT |
| jose | 6.2.12 | OIDC 签名验证 | MIT |
| js-yaml / @types/js-yaml | 5.4.3 / 4.0.9 | 可选 YAML 配置 / 类型声明 | MIT |
| sax / @types/sax | 1.6.1 / 1.2.7 | 严格 RSS/Atom XML 解析 / 类型声明 | BlueOak-1.0.0 / MIT |
| @noble/curves / @noble/hashes / @scure/base | 2.4.0 | Nostr Schnorr 签名、事件哈希与 npub 解码 | MIT |
| @deepseek-ai/dsh（可选独立网关） | 0.2.0-rc.2 | ACP Agent runtime，独立 package-lock 锁定 | MIT；传递依赖另列 |
| ws / @types/ws | 8.22.0 / 8.18.2 | Node WebSocket 采集与测试 relay / 类型声明 | MIT |
| TypeScript | 7.0.2 | 类型检查与构建 | Apache-2.0 |
| Wrangler | 4.151.0 | Cloudflare 构建/部署 | MIT OR Apache-2.0 |
| Miniflare | 5.20261012.0-beta | workerd 持久性测试 | MIT |
| @cloudflare/workers-types | 5.20261014.1 | CF 类型 | MIT OR Apache-2.0 |
| tsx / Prettier | 4.23.15 / 3.9.10 | 开发运行 / 格式 | MIT |
| @types/node / @types/pg | 24.19.2 / 8.23.1 | 类型声明 | MIT |
| swift-markdown | 0.7.3 | Markdown AST | Apache-2.0 with Swift exception |
| swift-cmark | 0.9.0 | Markdown parser | 运行时 MIT/BSD 通知；测试规范另有 CC-BY-SA 声明 |
| HighlightSwift | 1.1.0 | 离线代码语法高亮，原生 AttributedString | MIT |
| highlight.js（由 HighlightSwift 捆绑） | 11.9.0 | 代码语言识别与 token 着色 | BSD-3-Clause |

Node 镜像保留 node_modules 中的上游许可文件；macOS 开发包保留 swift-markdown LICENSE、swift-cmark COPYING、HighlightSwift 和 highlight.js 的完整许可。代码仅作为字符串交给捆绑高亮器，不执行正文代码，不请求远端语法/字体。传递依赖与 Linux 基础镜像的软件包仍需正式发行时按实际产物生成完整清单。系统 SwiftUI、AppKit、Security、CryptoKit 和 AuthenticationServices 由 Apple SDK 提供。旧 Go/Argon2/pgx 依赖已删除。

可选采集实例使用 [RSSHub](https://github.com/DIYgod/RSSHub) 官方镜像，保留其 AGPL-3.0 许可；它作为独立服务运行，不嵌入 Melted 或 macOS 应用。Compose 与 Apple Container 入口固定镜像 digest，版本及验证见 [RSSHub 指南](server/docs/rsshub.md)。

可选 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) runtime 由 [独立锁文件](server/agent-runtime/package-lock.json) 固定，不嵌入 macOS 或 Worker bundle。网关镜像保留完整 npm 包内许可；锁文件含 MIT、Apache-2.0、BSD、ISC、MPL-2.0、LGPL-3.0-or-later 等传递许可（含未在当前平台安装的 optional 包）。正式镜像分发须按实际安装包保留通知并履行相应源码义务；上游完整材料见 [THIRD_PARTY_NOTICES](https://github.com/deepseek-ai/deepseek-harness/blob/master/THIRD_PARTY_NOTICES.md)。
