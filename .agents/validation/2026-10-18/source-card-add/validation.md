# 来源卡片独立添加按钮

日期：2026-10-18。系统：macOS 27.0.1（26A434），Apple Silicon。

## 实现

所有来源类型卡片的标题行右侧增加 32×32 pt 的加号按钮，尺寸复用 `MeltedPanelMetrics.controlHeight`。共享 disclosure 增加独立 trailing 槽，按钮不嵌入折叠按钮。共享图标按钮复用次要按钮的配色、hover、按压与禁用反馈。点击打开该插件的现有添加订阅流程；忙碌、不可用或不支持的插件禁止添加，规则与顶部菜单一致。

## 构建与检查

- `rtk proxy sh scripts/build-macos.sh` 成功，签名验证成功
- 运行包：`build/Melted.app`，Bundle ID：`com.alkinum.melted`，版本：0.2.0（13）
- 二进制 SHA-256：`d451d3dfbda4e1b7cc20c383ef06543c19da84855e77c30b9d93fa2a6d3c3f64`
- macOS `swift test`：21 项通过
- MeltedKit `swift test`：设计系统 4 项通过；Core/Rendering 29 项中 28 项通过、1 项公共 WebP 网络测试按默认配置跳过
- `git diff --check` 通过

## 原生操作证据

重新启动本次编译的 App，连接现有本机开发服务器，来源面板 760×520 pt，阅读字号 100%。AX 中 RSSHub、RSS / Atom、Bluesky、Fediverse、Nostr 各有独立的“添加 … 订阅”按钮。

- 深色：按钮为等宽高圆角方形，与标题行对齐；[截图](dark.png)展示 Fediverse / Nostr
- 浅色：同一布局及可读加号；[截图](light.png)展示 RSSHub / RSS / Atom / Bluesky
- 分别点击 Fediverse、Nostr 加号，打开的添加订阅表单副标题与插件一致，取消后返回来源列表
- 收起 RSSHub 卡片后点击其加号，正确打开 RSSHub 来源目录；取消后 RSSHub 仍收起
- 点击卡片标题只改变折叠状态，不打开编辑器
- 验证结束恢复原来的深色外观，保留来源面板；未提交任何新订阅

本次验证覆盖空来源卡片及添加入口；没有执行实际保存、离线/错误状态、不可用插件交互、VoiceOver 或 iOS 运行验收。
