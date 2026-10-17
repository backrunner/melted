# MeltedKit 原生媒体渲染

正文继续使用原生 Markdown AST。`EmbeddedMedia` 只解析媒体引用，`ReadingMedia` 管理加载/失败/关闭状态，图片由独立 URLSession 获取，已支持的视频播放器使用独立 WKWebView。新增平台应扩展明确的媒体类型与规范化规则，不向正文开放脚本或通用 WebView。

## 支持的写法

```markdown
![图片说明](https://images.example.org/photo.webp)

[视频标题](https://www.youtube.com/watch?v=M7lc1UVf-VE)

[视频标题](https://www.bilibili.com/video/BV1B7411m7LV?p=1)
```

- 图片支持段落内和独立图片，保留前后文字及强调/链接。JPEG、PNG、GIF、WebP 解码为原生静态图片；动画格式展示首帧。支持图片语法直接引用已知视频链接。
- 视频链接需独占段落，支持 YouTube watch、youtu.be、shorts、live、embed，以及 B 站 BV/av 页面、官方 player URL 和分 P 参数。独立裸视频 URL 也会识别；普通段落中的链接维持普通链接。
- 独立 `img` / `iframe` 标签只提取 src 与说明，不执行原标签。已支持播放器重建官方地址，源 onload、style、autoplay 等属性全部丢弃；重复属性、srcdoc、混合任意 HTML 不接受。未支持的公开 HTTPS iframe 降级为浏览器链接。复杂 HTML、短链解析、通用 iframe、SVG、附件认证、直接 MP4/HLS 与动画播放未实现。
- 共享示例：[embedded-media.json](../../../../contracts/fixtures/embedded-media.json)。现有 Briefing 的 markdown 字段保持不变；原始 feed HTML/附件尚不会自动生成这份正文。

## 加载与隔离

默认不发起媒体请求；读者点击每个媒体的加载按钮后才连接外站，图片说明/来源与浏览器入口始终可用。无自动播放、全局自动加载偏好或持久同意。关闭媒体、切换文章/离开阅读区会取消图片任务或停止并销毁播放器。失败可重试。

图片只接收公开域名的 HTTPS 地址，无 userinfo/非标准端口；拒绝 IP、常见本地域名、重定向、HTTP 鉴权及不支持的 MIME。独立 ephemeral 会话不携带 Melted 会话、Cookie、Authorization 或共享缓存。响应最多 8 MiB，最多 4000 万像素，最长边下采样到 2048 px；网络请求超时 15 秒、资源超时 20 秒。URL 校验不等同于 DNS/IP 固定，当前没有客户端 egress sandbox。

播放器仅加载重建的官方地址，使用非持久 WebKit 数据存储，不共享 Melted 凭据，不注入正文 HTML或原生 bridge。保留官方控件；阻止任意主框架导航、弹窗、下载及摄像头/麦克风权限，用户点选的外链交回原生浏览器确认。播放器自身可连接供应商的服务；非持久存储不代表加载后匿名或没有追踪。原生“已加载”只表示页面加载，地区/版权/登录限制及实际播放状态仍由官方播放器呈现，外部打开入口一直保留。

YouTube 请求以实际 App Bundle ID 构造 Referer，符合[官方客户端身份说明](https://developers.google.com/youtube/terms/required-minimum-functionality#api-client-identity-and-credentials)；不伪造来源网站。[YouTube 参数](https://developers.google.com/youtube/player_parameters)与[B 站播放器参数](https://player.bilibili.com/)于 2026-10-18 核对。演示图片引用 [Google WebP Gallery](https://developers.google.com/speed/webp/gallery)，不随项目分发图片副本。

## 验证

```sh
swift test --package-path apps/apple/Packages/MeltedKit -Xswiftc -warnings-as-errors
MELTED_LIVE_MEDIA=1 swift test --package-path apps/apple/Packages/MeltedKit --filter publicWebPDecodesThroughTheProductionImageTransport
```

第二条命令显式访问公开 WebP 样例；日常测试不请求外网。运行时记录见[媒体验收](../../../../.agents/validation/2026-10-18/embedded-media/README.md)，测试、原生画面与真实视频播放分别记录。
