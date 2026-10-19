# 订阅名称 placeholder

日期：2026-10-18。沿用本日 source-card-add 的 macOS App 构建（0.2.0 / 13，com.alkinum.melted）；本次只修改服务端表单元数据，未改变 Swift 源码。

来源公共表单的 `name` 字段增加 `placeholder: "例如：世界新闻"`，同步生成共享 `contracts/fixtures/plugin-settings.json`。所有插件共用这一名称字段，不把 placeholder 作为实际输入或默认名称。

通过 Apple Container 运行契约生成、TypeScript build 和 `tests/unit/plugin-host.test.ts`（8 项通过）。重新启动现有 melted-api 容器，保留其配置与数据。客户端重新打开来源面板后，RSS / Atom 添加订阅页的 AX 返回 `名称, Placeholder: 例如：世界新闻`；[深色真实窗口截图](dark.png)可见空输入框中的提示。未填写或提交新订阅。

`git diff --check` 通过。本次未扩展到保存流程或完整主题/辅助功能验收。
