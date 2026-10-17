# 应用图标的系统显示核对

日期：2026-10-17，Asia/Singapore。用户再次要求完成应用图标；检查确认正式图标资产及构建绑定已经存在，本轮沿用正式 m 矢量与暖白/褐色配色，补验系统实际显示，没有重新设计近似标识或改动运行代码。

- assets/app-icon 提供 SVG、1024 RGBA PNG、多尺寸 ICNS；swift scripts/generate-app-icon.swift --check 通过，原始品牌与 palette 一致。
- ICNS 含 ic04、ic05、ic07、ic08、ic09、ic10、ic11、ic12、ic13、ic14 十种必需图像块。
- 当前 build/latest/Melted.app 的 CFBundleIconFile=AppIcon，Bundle ID com.alkinum.melted，0.2.0（2）；包内 ICNS 与正式资产 SHA-256 同为 0accca51f2971af0b147ac0726c0bcd19154e46a57f815a2564dda5be1437f19，codesign --verify --deep --strict 通过。
- Finder 实际打开该路径应用的“显示简介”，标题小图标与大预览均正确显示正式图标，见 [Finder](app-icon-system/finder.jpg)。
- 运行中 Melted 的原生 About Melted 面板实际显示正式图标与版本，见 [原生关于面板](app-icon-system/about.jpg)；该面板保留供查看。
- 主程序 SHA-256：75a6306b35b4dde6c8c160e95d4c5073c5a5e5b50b3ac7a0b2cd6f9dd618d3b1，沿用文案复核的当前构建；本轮无运行代码/图标数值变更，不额外重建 App。

尝试读取 Dock 原生界面超时，未据此声称 Dock 或 Launchpad 缓存已验证，也未重启 Dock 或清理系统缓存。当前没有 iOS App，本轮未制作 iOS 或动态深色图标目录。
