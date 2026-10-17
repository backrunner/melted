# 完整插件目录与滚动面板验收 — 2026-10-17

## 实现

- RSSHub 从运营者实例 `/api/namespace` 获取全部 feed 路由，不再内置 21 条精选列表或接受 route_suggestions；不包含 apiRoutes。通用 SDK 提供 PresetProvider/list/resolve，DSL 的 preset_catalog 与有限建议入口互斥。
- 账户鉴权目录搜索/分页和参数解析；snapshot/query/授权绑定 cursor，过期返回 409。目录 8 MiB / 15 秒上限、5 分钟缓存、冷请求合并；凭据仅在出站请求注入，错误脱敏。
- 普通参数、可选参数、路径型参数、空根别名和嵌套 namespace 均覆盖。上游正则不执行；复杂模式可回退完整相对路由输入。参数空缺不能造成后面参数错位。解析后再次授权；同 namespace 的不同路由不会因前缀相交而误显示为开放。
- 平台与路由说明合并、有界（16,000 字符），原生安全 Markdown 按需展开；HTML/远程图片不执行或加载。授权状态和实例声明的配置条件分开显示，不声称密钥已配置。
- 普通 Feed 去掉来源预设及该运营配置字段，直接填写名称和 URL；采集格式/条数/间隔收拢。泛用 suggestions DSL 继续用于数字常用值等其他字段。
- 选中来源跨搜索保留，最多 20 项，服务器解析得到相对路由后才加入选择；沿用独立来源与幂等批次保存。
- 统一列表末尾分隔线；“加载更多”居中、标准次要按钮高度、加载态并防重复点击。
- 新共享 MeltedScrollView 自动测量内容与视口，复用 ScrollEdgeFade。应用于来源管理、添加/动作/参数表单、建议列表、搜索结果、许可正文和连接页。渐隐只作用于内容，固定标题、footer、滚动条不受影响；到达首尾恢复不透明。带 pinned headers 的主资讯列表继续直接复用同一底层 modifier。

## 真实实例目录验证

实例镜像：`ghcr.io/diygod/rsshub@sha256:1db5e6b65a2cbabc95def7e495801ccd50ce5c77ade6408d454867333c28b1a4`，Apple Container `melted-rsshub`。

2026-10-17 14:54:55 UTC，读取并解析 81 页，共 **4,006 条唯一 feed 路由**，2,772 条有参数，Twitter/X 共 10 条。上游全部 path 别名也都出现在 namespace route keys 中，未发现遗漏。原始目录 3,988,171 bytes；规范化条目 JSON 2,851,254 bytes。记录见 [catalog-live.json](catalog-live.json)。

本地运营策略仍只开放已有公开范围，此策略下可用模板为 9 条；其他模板可浏览但不能添加。用独立临时配置仅验证 `/twitter/user` 的参数解析得到 `/twitter/user/_RSSHub`，没有扩大运行实例的授权，也没有请求 Twitter 内容。平台凭据、反爬与上游实际采集能力仍取决于运营者部署。

## 测试与构建

后端全部在 Apple Container 内执行：

- `python3 scripts/dev.py exec npm run check`：TypeScript 通过
- `python3 scripts/dev.py exec npm run format:check`：通过
- `python3 scripts/dev.py exec npm test`：46 个单测、45 个集成测试通过，包含实际 PostgreSQL 与 workerd/SQLite DO/Queues/Alarms、迁移重放；新增目录 API 鉴权、分页、禁止越权和不创建账户数据断言
- `python3 scripts/dev.py exec npm run build`：通过
- `python3 scripts/dev.py exec npm run worker:check`：预检与 Worker dry-run 打包通过；最终 npm test 也重新打包 Worker
- `npm run contracts:plugins` 生成 OpenAPI、schema 与共享 fixture，注册表匹配测试通过
- `swift test --package-path apps/macos`：21 个测试通过，含旧搜索迟到不能覆盖新结果
- `swift test --package-path apps/apple/Packages/MeltedKit`：19 个 Core、4 个 DesignSystem 测试通过
- `sh scripts/build-macos.sh`：原生构建通过，无新增编译警告

## 原生 UI

macOS 27.0.1 (26A434)，`build/Melted.app`，0.2.0 (13)，100% 字号，编辑面板 620×520 points；深浅主题均实际操作。最终启动构建 SHA-256：`083d86ce2e7e594507a7d4e42a9b3f565459c530bdb352fd9c3a29e12a753aa5`。

- [普通 Feed](feed-direct-dark.png)：没有选择来源或预设入口，采集设置前只有一道规则线
- [目录顶部](catalog-top-dark.png)、[深色滚动中](catalog-scroll-dark.png)、[浅色滚动中](catalog-scroll-light.png)：边缘渐隐、正文对比和原生滚动条
- [加载更多](load-more-dark.png)：按钮尺寸、居中和与采集设置之间的单分隔线；实际点击将 gov 搜索结果从 40 条追加到 80 条，保留滚动位置
- [参数表单](preset-parameters-light.png)：参数在首屏，其他说明按需展开；点击加入所选经真实服务器解析为 `/bbc`，随后搜索 Twitter 仍保留已选 BBC；最终取消，没有创建测试来源
- [Twitter 条件](twitter-requirements-dark.png)、[说明表格](twitter-description-dark.png)：完整参数/条件入口、原生 Markdown 表格与滚动效果，未开放时添加按钮禁用

顶部/说明截图在最终构建复核；其余截图来自同一轮实现中对应 UI 已稳定的构建，最终变动为路由说明补全。验证结束恢复原深色主题和 100% 字号，账户数据未修改。

## 边界

本次真实验证的是实例目录获取、全部条目规范化、参数解析和 UI，不是 4,006 个上游逐个采集成功。Twitter 未配置凭据并未采集；此前新闻/文化/社区入库证据仍见对应历史记录。没有公网发布或远端 CI。本次没有重跑全量 VoiceOver、200% 字号和系统辅助设置矩阵；减少透明度/增强对比度回退复用既有实现，属于代码复核。连接页/许可页等迁入通用滚动容器已构建验证，未逐页重新完成视觉矩阵。

仓库中已有阅读渐隐、底栏开关及相关文档改动保留在工作区，不混入此次提交。
