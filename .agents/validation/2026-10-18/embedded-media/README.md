# 原生图片与视频嵌入验证

2026-10-18，基线 `7ccb6d2`，工作分支 `main`。本次在现有原生 Markdown 阅读区加入按需加载图片、YouTube 与哔哩哔哩官方播放器。服务端生产代码、API 与数据库结构未改；增加了两端共用的 Briefing 示例。

## 实现与复核

- Markdown 图片从行内文字拆分为原生媒体块，保留前后正文、强调及链接；独立视频链接转换为播放器占位。
- 只从独立 img/iframe 提取引用，重建已知供应商地址。原始 HTML、事件属性、srcdoc 与任意脚本不进入 WebKit；未知公开 HTTPS iframe 保留浏览器入口。
- 加载由每个媒体的按钮触发。图片请求不复用 API 会话、Cookie、Authorization 或缓存；限制响应、像素与解码大小，拒绝重定向和不支持的内容类型。
- 视频使用独立非持久 WebKit，无正文脚本/native bridge，关闭自动播放、弹窗、下载及媒体捕获权限；外部链接沿用阅读器的浏览器确认流程。
- WebKit 可选代理方法的 actor/Sendable 声明按当前协议匹配，测试检查实际 Objective-C selector，避免只编译警告而未执行导航/权限策略。
- 图片任务绑定视图生命周期并显式取消 URLSession；播放器拆除时暂停媒体、取消加载并清除代理。代码路径已复核，真实切页后音频停止仍待原生验收。

## 已执行

| 检查 | 结果 |
| --- | --- |
| MeltedKit，`-warnings-as-errors`，显式开启 `MELTED_LIVE_MEDIA=1` | Core/Rendering 29 + DesignSystem 4 项通过 |
| macOS App，`-warnings-as-errors` | 21 项通过；Swift 合计 54 项 |
| 模拟图片传输 | 正常图片、错误 MIME、声明/流式超限、302、错误正文、取消、凭据隔离和拒绝重定向通过 |
| 引用解析与边界 | YouTube/B 站地址规范化、时间/分 P、伪造 host、私有/凭据 URL、HTML 混合内容/重复属性/srcdoc、官方主框架限制通过 |
| 真实图片传输 | 通过生产 RemoteImageLoader 请求 `https://www.gstatic.com/webp/gallery/1.webp`，ImageIO 解码为 550 × 368 像素 |
| TypeScript 类型与共享 fixture | Apple Container 内 `npm run check`、`tests/unit/contracts.test.ts` 通过 |
| 格式与设计同步 | 受影响 TypeScript 的 Prettier、`git diff --check`、token 生成检查通过；静态设计检查覆盖 72 Markdown、519 本地链接、5 JSON、34 色对及参考页 token 一致性 |
| 原生构建与开发签名 | `scripts/build-macos.sh` 通过，Bundle ID `com.alkinum.melted`，0.2.0 (13)，arm64 |

当前 App 可执行文件 SHA-256：`98486a22e5224fd86ff65e7d80ab65b2908daec9193cf8b2790540f005926e8d`。

上述真实图片检查是网络与解码验证，不是原生窗口显示证据；常规测试不开启 `MELTED_LIVE_MEDIA` 时跳过外网样例。服务端只改共享 fixture 测试，本次没有重跑与此变更无关的完整数据库/队列集成套件。

## 未验证与限制

- 当前 macOS 27.0.1 上，CUA 在最新构建后仍报告 Mac 已锁屏且不能自动解锁。已请求用户解锁，尚未收到回复。因此无新截图，也未执行亮暗、最窄窗口、200% 字号、VoiceOver、加载/失败/重试交互或切页停止音频的实际窗口检查。
- YouTube 与 B 站实际播放、播放器全屏、地区/登录/版权限制尚未运行验收。页面 didFinish 仅表示 WebKit 页面加载，不证明视频能播放。
- macOS 14、iOS 和真实移动设备未验证。没有远端 CI 工作流，不宣称远端 CI 通过；未进行公网部署或 Apple 发行。
- 图片 URL 过滤不等于 DNS pinning 或客户端 egress sandbox。用户主动加载后，媒体供应商会收到网络请求；非持久 WebKit 不保证匿名或无追踪。
- 图片支持 JPEG/PNG/GIF/WebP 静态首帧；复杂 HTML、通用 iframe、短链展开、SVG、认证附件、直接 MP4/HLS 及动画播放不在本次实现内。原始采集附件不会自动生成简报。

支持格式、组件分工与官方参数参考见 [MeltedKit 媒体说明](../../../../apps/apple/Packages/MeltedKit/README.md)。
