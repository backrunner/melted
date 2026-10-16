# App 图标与原生代码渲染验证

日期：2026-10-17，Asia/Singapore。开发版本 0.2.0（2），Bundle ID com.alkinum.melted，Apple Development 签名。范围为正式图标、Markdown 行内代码与代码块，未修复此前记录的搜索面板挂载缺口。

## 实现与资产

- 同一原始 m 矢量和设计 palette 生成 AppIcon.svg、1024 RGBA PNG、多分辨率 ICNS；构建绑定 CFBundleIconFile=AppIcon，图标 hash 为 0accca51f2971af0b147ac0726c0bcd19154e46a57f815a2564dda5be1437f19。
- 行内代码使用系统 monospaced 与浅底色；代码块使用统一 10 pt 圆角、16 pt inset、36 pt 语言/复制栏、1 pt 分隔边框、13 pt 等宽字体与低饱和成对语法色。
- HighlightSwift 1.1.0（锁定 revision 784ca3ccfc8a2cf724fbb2f06cb6ec3329424da3）捆绑 highlight.js 11.9.0，资源放 Contents/Resources，完整 MIT/BSD 许可随包。只执行固定高亮器，不执行显示的代码或加载远端字体/脚本。
- 异步结果校验来源/语言/外观；空白、plaintext、未知/错误或超过 64 KiB 回退原文。上游裁剪的边界空白恢复，无法完整匹配则回退。复制使用原始代码字符串。

## 自动与打包检查

- sh scripts/check.sh 通过：静态文档/token、品牌/图标生成一致性、6 项 Python 签名测试、TypeScript/格式、5 项服务端单元与 15 项 PG/workerd 集成、Worker 预检/dry-run、10 项共享 Swift 与 10 项 macOS 状态测试、原生构建/签名检查。
- 新增 3 项代码测试覆盖 Swift/TypeScript/JSON/Python/Bash 亮暗着色、中文/缩进/空行原样、语言别名、HTML 字面文本、空/未知/超大回退。上述测试包含在共享 Swift 的 10 项中。
- token 34 组指定颜色对通过，最低 4.71:1；不包含实际 opacity/系统材质或全项无障碍验证。
- 补充 59 个文档/HTML 本地资源引用、21 个 ADR 唯一性通过；核对 Info.plist、图标 ICNS 十种必需图像块、高亮 JS 资源和两份第三方许可；codesign --verify --deep --strict 通过。没有验证 Dock/Launchpad 图标缓存或其他系统版本。
- 最终构建主程序 SHA-256：c1d9006d672856ea07d732cc9e16d2155de971868526dded273e5b6f092f2b95，产物 build/Melted.app 与 build/latest/Melted.app，主程序和资源为同一最终构建。

## 原生操作与截图

实际启动 build/code-preview/Melted.app，主程序 SHA-256 为 31a761828b0bdd1a315a6be9e13bed1f17961bbd815f317023a9de0dcb8e2b8f。它是本次预验收构建；之后仅对语言栏截短/复制布局与状态复用作收敛并完成最终构建，不把预验收图片称为最终二进制全项验收。

使用服务端 CLI 向现有本机开发账户导入 contracts/fixtures/code-reading.json，未通过 App 内开发入口或修改已有正文。该新增内容为公开开发样例，数据库原有六条样例保留；新样例被实际打开后标为已读，不是 AI 输出。

- 浅色/深色标准窗口下，行内等宽代码、Swift/TypeScript/JSON 着色、语言/复制栏均实际显示。见 [浅色](code-and-icon/code-light.png)、[深色](code-and-icon/code-dark.png)。
- 点击 Swift 复制按钮后 AX 显示“代码已复制”；未另外读取剪贴板作逐字节比较。
- JSON 长行出现独立横向滚动区，正文未扩成宽画布。未知语言显示原文。
- 执行“紧凑阅读窗口”后 AX 切换为返回 + 阅读结构，仍存在局部横滚；随后 Mac 锁屏，未保存紧凑截图、未完成实际横滚与 200% 字号复验。已请求用户解锁；当前未把这些场景记为通过。

本记录不证明最低 macOS、完整 VoiceOver/iOS、远端 CI、Developer ID 公证或 App Store 发行。最终构建是否已重新启动及尚缺场景，按后续实际操作追加记录。
