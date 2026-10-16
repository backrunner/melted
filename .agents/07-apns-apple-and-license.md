# APNs、自托管、苹果规则与 GPL

规则资料核查日期：2026-10-13 至 2026-10-14；实现/文档状态更新于 2026-10-17，本次未重新核查外部法律及平台规则。下面区分官方规则、工程推论与待确认发行决策；阅读资料不等于 Apple 批准或法律许可结论。

## 自托管注册的结论

未在查阅的规则中发现禁止用户输入服务器地址并在其注册的普遍条款。因此可按自托管客户端设计，但仍须满足可审核、隐私、内容、购买与安全要求，不能承诺“任意服务器均能通过审核”。提交时准备可访问的参考服务、演示账户/邀请和完整流程，详见 [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)。

服务器协议需提供注册策略和处理方声明。客户端不能因为 URL 符合协议就视其可信，也不能替第三方运营者保证隐私；用户选择服务器之前明确说明信任对象。

## 为什么标准服务器不能只拿 device token 就推送官方 App

device token 对设备和 App 唯一；provider 需要与该 App 所属开发者团队/topic 对应的 APNs key 或证书。任意运营者自己的 Apple 开发者 key 不能直接给官方 App 的 topic 推送。依据 [注册 APNs](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns) 和 [token-based APNs](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns)。

由此推导：开放自托管与官方 iOS/macOS 二进制的推送身份是两层问题。禁止把官方 `.p8` 私钥分发给社区服务器；这是安全设计边界。Apple 协议也约束 APNs 身份和第三方服务商使用，公开共享并非可直接假定获准的模式。依据 [Developer Program License Agreement，Attachment 1](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)。

| 模式 | 是否完全独立 | 能力与代价 |
| --- | --- | --- |
| 官方 App + 不启用中继 | 内容服务独立 | 前台同步正常；macOS 应用运行时本地通知；退出/移动后台没有可靠及时提醒 |
| 官方 App + 可选官方中继 | 内容处理独立；通知依赖中继 | 推荐日后支持；运营者不接触 APNs 私钥 |
| 运营者自己构建、签名 App | 可以独立推送 | 自己的 Team/App ID/key/topic；还需自己的分发、许可和 Apple 权限 |
| 其他输出渠道 | 内容服务独立 | webhook、后续邮件/聊天，无 APNs；各渠道仍有自身隐私/服务要求 |

## 中继的最小设计

推荐只转发固定通知模板与 opaque route，不接收正文、摘要、偏好、来源 URL、Subject 名称、模型凭据或 App 登录 token。中继仍能观察设备 token、绑定和发送时间等元数据，不能称为零数据依赖。

1. App 向 APNs 每次注册，获得当前 token；用户同意通知和中继数据处理后，App 通过 HTTPS 将 token 注册给官方中继，不给任意自托管服务器。
2. App 从已经登录的服务器取得带 nonce 的实例身份/relay 专用公钥，用户确认绑定；App 与中继完成一次性 challenge，绑定 App instance、账户、该服务器和允许的通知类别。中继生成只对应此绑定的不透明 routing handle。
3. App 将路由 handle 和受限授权信息登记回用户服务器。服务器用自己的 relay 专用私钥签名出站请求，中继校验绑定、nonce/时效、用户授权、类别和配额；不能传入任意 device token、topic 或通知文本。
4. 中继持有 APNs key，按预配置 topic/environment 发送固定“有新的信息更新”。App 打开后用自己的服务器认证拉真实变化。内网服务器只需出站连中继，不要求中继回连内网。
5. App 撤销、服务器切换、登出/删账号均撤销绑定；密钥泄漏可撤销单服务器授权。debug/test 环境与正式环境隔离；App attestation 可在平台支持时增加防伪，但不是唯一身份依据。

这个流程需要先做攻击验证：伪造注册、绑定重放、同设备跨账户、恶意服务器刷通知、撤销竞态、路由枚举、topic 串用。只有 App 明确选择的绑定才可创建；不能让任意公共 server 自行给陌生设备登记。

中继有用户级静默时间、类别白名单、每绑定/服务器/IP 配额、审计及封禁。优先只发更新提示，不能把中继变成供社区任意发送内容的公共 APNs 服务。中继使用模式在发行前需依据实际 Apple 协议及审核反馈确认，不是已有官方特许。

APNs 成功响应只代表接收请求，不是送达/已读。处理 410 无效 token 时停用对应失效绑定（考虑新 token 注册时间，避免撤销更新的绑定）；429/5xx 退避，鉴权错误报警。collapse ID 合并提醒；通知丢失由同步变化日志补回。技术细节参考 [APNs 通信文档](https://developer.apple.com/library/archive/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/CommunicatingwithAPNs.html)，该文是历史文档，实施时复核现行接口。

## 审核设计约束

界面执行 [UI 设计规范](11-ui-design-system.md)，优先原生导航、材质、权限和设置行为。遵循 HIG 是设计与可用性要求，不代表 App Review、第三方服务授权或 GPL 发行许可已经通过。UI 参考页不能充当实际 App 的审核材料；远程 HTML 不能覆盖客户端的权限、证据状态及账户操作界面。

官方规则中的直接要求：通知不是使用前提，不能在通知放敏感内容；个人数据发给第三方 AI 必须明确披露并取得许可；App 内创建账号需提供删除；服务器端插件不意味着客户端可以任意下载执行代码。具体见 [审核规则 4.5.4、5.1.1、5.1.2、2.5.2](https://developer.apple.com/app-store/review/guidelines/)。

工程落实：通知拒绝仍可同步；默认不在通知放正文；连接时显示 provider/mem 去向，变更后重新授权；删除覆盖来源凭据、记忆、渠道、中继及备份期限；HTML 仅静态、安全处理。自托管服务器诚实执行删除与同意仍是运营者信任条件，App 无法强制控制恶意远端。

用户自己的私有信息处理与公共 UGC 平台不同；未来开放共享内容/社区 feed 时需重新评估内容举报、屏蔽和管理。采集第三方服务不因 AI 改写就自动获得版权/平台授权。纯开源阶段不做购买；未来收费需按实际 storefront 和服务分类评估 IAP，不能先断言一定属于 Reader 或免费伴随工具例外。以上均为对产品的设计推论，发行前核查对应规则。

另一个会影响采集插件的明确条款是 5.1.1(v)：社交网络凭据/token 的设备外存储和使用受到限制，不能把“用户同意”直接当作 App 上传社交凭据到任意服务端的许可。首期不实现这种 App 凭据转交；未来服务器端社交平台集成要单独核查具体授权模式及审核适用性。4.10 也限制将系统内置能力（含推送）本身商业化，后续不能设计“单独付费解锁 APNs”的卖点。依据 [Apple 审核规则](https://developer.apple.com/app-store/review/guidelines/)。

不要把 silent push 当后台任务队列。[Apple 后台推送说明](https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app)指出其为低优先级且不保证送达，发送频率受限制。持续采集、AI、定时获取放服务端，iOS 唤醒只补同步。

## GPL 与发行

2026-10-15 用户确认采用 **GPL-3.0-or-later**，本次不添加 App Store 分发例外。根目录 [LICENSE](../LICENSE) 保存完整 GPL 第三版正文，[COPYRIGHT](../COPYRIGHT) 明确“第三版或后续版本”对原创代码、文档与品牌资产的适用范围；第三方依赖保留上游许可。贡献沿用同一许可、版权留在各贡献者，不要求版权转让，见 [贡献说明](../CONTRIBUTING.md)。

GPL 允许商业使用和收费；一般服务端仅通过网络运行并不会因 GPL 自动触发向远端用户提供修改源码的义务。GPL 不是阻止第三方托管竞争的工具。见 [GNU FAQ 商业收费](https://www.gnu.org/licenses/gpl-faq.en.html#DoesTheGPLAllowMoney) 与 [未分发的修改](https://www.gnu.org/licenses/gpl-faq.en.html#UnreleasedMods)。官方即使日后托管，也建议公开核心改进维持社区信任。

App Store 的使用/分发限制与 GPL 下游权利存在许可冲突风险。FSF 曾针对 App Store 的 GPL 软件分发采取合规行动，见 [FSF 历史说明](https://www.fsf.org/news/2010-05-app-store-compliance)。这是风险依据，不足以单独断言 2026 年所有 GPL App 都绝对不能发行；必须结合选定许可、实际 Apple 条款和全部依赖评估。

建议首期 macOS 走 Developer ID + 公证 + 官网直接分发，发布对应源码和构建说明。iOS 之前做一个独立许可决策：

| 候选 | 好处 | 必要条件 |
| --- | --- | --- |
| GPL 源码 + 明确 App Store 分发例外 | 维持开源主线，目标清楚 | 例外由有权授权的所有版权方同意，依赖不能冲突 |
| GPL 源码 + 官方二进制另外授权 | 可安排商店发行 | 对全部相关代码拥有足够授权；贡献治理需支撑 |
| 严格 GPL、无例外 | 下游权利清晰 | 若商店条款不兼容，不能承诺商店发行；替代分发受地区/平台限制 |

社区 DCO 证明贡献来源，不自动授予未来任意重新许可权；选择例外/双许可要在接受贡献前明确相应授权机制。不能只改根目录 LICENSE 就解决第三方 GPL 依赖。协议/SDK/插件的独立性也须按实际通信耦合检查，参见 [GNU 插件 FAQ](https://www.gnu.org/licenses/gpl-faq.en.html#GPLPlugins)。

发行门槛应包括：源码/二进制对应、依赖 license 清单、源码构建说明、署名、隐私和用户授权流程、签名/公证、APNs 模式验证及 iOS 许可评审。目前已有真实 macOS 开发构建及本地许可/第三方声明 sheet，见 [开源准备记录](validation/2026-10-17/publication.md)；尚无 Developer ID 公证发行、APNs 联调或审核结果，不把本文结论写成通过记录。
