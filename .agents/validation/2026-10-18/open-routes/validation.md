# RSSHub 只展示开放路由

日期：2026-10-18。沿用当日 source-card-add 的 macOS App 构建与深色外观；本次变更为服务端目录行为，无 Swift 修改。

## 行为

RSSHub 仍从运营者实例获取目录，但在搜索、计数和分页之前按 `allowed_routes` 过滤。返回项均为开放路由；未开放项不返回。游标绑定加入本次过滤策略标识，避免继续使用旧全量目录游标。直接解析未开放的 preset ID 返回 403；解析后的实际路径及手动填写路径继续执行原有路由授权。

用户可以从开放目录选择路由、指定参数后加入所选列表，也可以手动填写开放范围内的相对路由。未扩大服务器的开放范围。

## 验证

均通过 Apple Container 执行：

- TypeScript build 通过
- RSSHub 目录及插件 host 单元测试共 15 项通过
- Worker dry-run 打包通过
- `feed-runtime.test.ts` 两项通过，分别为 Node/PostgreSQL 与 workerd/SQLite DO + Queues；覆盖目录过滤、搜索计数、分页、未开放 ID 拒绝、参数解析及后续来源流程
- `git diff --check` 通过

重新启动现有本机 API 容器并保留配置、数据库，使用原生 App 打开 RSSHub 添加订阅页：

- [完整可选目录](catalog.png)：当前配置提供 9 个可选路由，AX 全部属于 ABC、BBC、豆瓣开放子路由和 Hacker News；没有未开放条目
- [未开放路由搜索](blocked-search.png)：搜索 Twitter 返回 0 个可选路由，无“服务器未开放”占位行
- [参数解析与选择](selected-route.png)：搜索 BBC 返回 5 个路由，选择 News 并填写 `site=world`，成功解析 `/bbc/world`、加入所选列表，显示已选 1 个订阅；取消草稿后总来源仍为 0

上述参数操作只验证解析和选择，不表示该示例实际抓取成功。本次未执行远端部署或新增真实订阅。
