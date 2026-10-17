# 多来源订阅与 DSL 集合验收

日期：2026-10-17。范围：RSSHub 路由建议、通用设置 DSL 的 list/table 集合、多选创建及原生界面一致性。沿用既有来源/任务/入库机制，不引入旧 RSS3 DSL。

## 实现与审查

- 一行对应一个独立 source，拥有自己的名称、路由、间隔、启停、checkpoint 与 receipt。表格/列表仅是同一来源集合的两种展示。
- 插件 descriptor 可声明 `collection`、有限列绑定及 `add_from_suggestions`；客户端没有按 RSSHub ID 分支。旧 descriptor 无 collection 时沿用原有逐来源管理。当前 v1 的新增字段均为可选展示数据，旧客户端可继续管理同一来源。
- RSSHub 内置 21 条新闻、文化生活、社区路由建议，按运营者实际 allowlist 过滤；运营者可以扩展/覆盖建议。建议不扩大权限，也不限制其他已授权的自定义路径。元数据依据见 [RSSHub 文档](../../../../server/docs/rsshub.md)。
- 一次可多选最多 20 条，每行提交独立幂等键。已成功行保留，错误逐行呈现；本面板内重试只重发未完成行的原始键和 payload。既有订阅不可再次勾选。批量创建不是跨来源原子事务，关闭面板或重启不恢复批量草稿。
- collection 列仅可绑定有限 source 字段或本插件 configuration 字段；不支持 URL 动作、脚本、任意表达式或无限嵌套表单。双端校验非法绑定、重复列、无效建议及数量限制。
- 共享 `MeltedPanel`、字段/菜单样式、字体与面板 token；保留原生窗口和表格行为。NSTableView 使用与主窗口一致的暖色选中底色，可横滚、调整列宽、键盘选行。无变化的轮询不重建表格行，避免菜单/选择/辅助功能焦点被打断。
- 原生检查发现并修复了建议弹窗方向键无效、表格系统蓝色选中与暖色主题不一致、重复菜单箭头，以及列表采集详情脱离所属行的问题。

## 自动验证

所有 Node/PostgreSQL/workerd 执行通过 Apple Container；Swift 在本机原生执行。

| 命令/范围 | 结果 |
| --- | --- |
| `python3 scripts/dev.py check` | 32 项 unit + 42 项 integration 通过；TypeScript、Prettier、插件预检与 Worker 打包通过 |
| 同套后端契约 | PostgreSQL 与真实 workerd/SQLite DO；原有迁移重放、隔离、竞争/租约、队列重复与 Alarms/outbox 恢复测试通过 |
| `swift test --package-path apps/apple/Packages/MeltedKit` | 22 项通过（18 core/rendering + 4 design） |
| `swift test --package-path apps/macos` | 20 项通过；包含“提交成功但响应丢失”的批量部分失败/同键重试与不重复创建 |
| `sh scripts/build-macos.sh` | 原生构建成功 |
| `codesign --verify --deep --strict build/Melted.app` | 签名校验通过，非公证发行验证 |
| Worker bundle | 986.48 KiB，gzip 173.42 KiB |
| 设计/token/差异检查 | 61 个 Markdown、435 个本地链接、5 个 JSON 示例、34 组颜色对比通过；参考页与生成的 Swift token 一致；`git diff --check` 通过 |

合计 116 项自动测试。此次没有新增存储字段或迁移；生成的 OpenAPI、JSON Schema 和共享 fixture 已同步。

## 真实来源与原生操作

实例镜像固定为 `ghcr.io/diygod/rsshub@sha256:1db5e6b65a2cbabc95def7e495801ccd50ce5c77ade6408d454867333c28b1a4`。最终后端复验时间为 12:42:51–12:43:02 UTC，详见 [live.json](live.json)。

| 来源 | 路由 | Node/PG 首轮入库 | workerd/DO 首轮入库 | 重复采集新增 |
| --- | --- | --- | --- | --- |
| 新闻 | `/bbc/world-asia` | 18 | 18 | 两端均 0 |
| 文化生活 | `/douban/book/latest/fiction` | 10 | 10 | 两端均 0 |
| 社区 | `/hackernews` | 30 | 30 | 两端均 0 |

所有运行 complete、invalid 0，worker error 0。Node 重放分别识别 18/10/30 条重复；DO 条件请求无新增。豆瓣无发布时间保持为空，没有以采集时间补造发布日期。上述仅证明三条路由在记录时间可用，不代表全部 21 条建议实时可用。

另在真实 App 的多选面板一次保存这三条来源（12:31:12 UTC），独立后台任务分别入库 18/10/30 条，详情见 [native-collection.json](native-collection.json)。检查完成后精确删除本次创建的三条来源及其原始数据，报告保留数量和状态、不含账户标识或正文。

原生实际操作通过：跨搜索结果多选并保留选择、已订阅项禁选、自定义路径入口、建议搜索的中文/类别/路径匹配、方向键和 Return 选建议、Escape 取消、表格/列表切换、键盘选行和显示独立采集结果。选中豆瓣行时打开 Hacker News 的管理菜单并暂停，只有 Hacker News 被暂停；豆瓣仍自动采集。列表详情在对应来源内展开。

## 构建与视觉证据

- 系统：macOS 27.0.1（26A434），arm64；App 0.2.0（13），`com.alkinum.melted`。
- 启动路径：仓库 `build/Melted.app`；最终可执行文件 SHA-256：`4007dd18ebc35c67b32a9bb8b84d81aad21ba0f208075b6d06fb6e7862a03447`。
- 来源/批量面板 760 × 520 pt，单项表单 620 × 520 pt，建议弹窗 500 × 340 pt。阅读字号 100%；已检查亮暗主题，结束时恢复原深色外观。
- 全部是当前实现的真实原生截图，没有网页示意或合成内容。table-light/table-dark/list-light 来自最终构建；其余展示同轮迭代中未再变动的表单、建议及批量组件。list-dark 是列表详情归位前的未展开状态，展开详情以 list-light 为准。

| 画面 | 证据 |
| --- | --- |
| 主窗口视觉基线 | [main-dark.png](main-dark.png) |
| 三来源表格，亮/暗 | [table-light.png](table-light.png)、[table-dark.png](table-dark.png) |
| 列表及行内采集状态 | [list-light.png](list-light.png)、[list-dark.png](list-dark.png) |
| 多选订阅与已订阅状态 | [batch-light.png](batch-light.png) |
| 搜索路由建议 | [routes-light.png](routes-light.png) |
| 单项设置 | [form-light.png](form-light.png) |

未验证：全部建议上游的实时可用性、最低 macOS、完整 VoiceOver/辅助设置矩阵、此次面板在 200% 系统字号下的可用性，以及 iOS 原生界面。批量失败重试由自动测试验证，未通过断网在原生面板重现。没有公网部署、远端 CI 或公证发行；本次采集仍止于原始入库，不自动产生简报。
