# 可选列表底栏

2026-10-17，macOS 27.0.1 (26A434)。从当前工作树运行 `rtk proxy sh scripts/build-macos.sh`，构建与签名校验成功。工作树含其他并行改动，HEAD 为 `93741ebe60023adf54efc7284d472d6766ab368c`。

- App：`build/Melted.app`，Bundle ID `com.alkinum.melted`，0.2.0 (13)
- 可执行文件 SHA-256：`64b22c6d52eb872e49409b40dc42a96edd30532bbeb9c2dd78d470d9bb903300`
- CUA 真实窗口：列表截图 1360×1116 px（Retina，680×558 pt），阅读字号 100%；设置窗口 520 pt 宽

## 操作与结果

1. 退出旧进程，打开新构建。设置 → 外观出现原生“显示列表底栏”开关，初始为开启，AX 含说明“在列表底部显示 Melted 标识、内容条数和载入状态”。见 [深色设置](settings-dark.png)与[浅色设置](settings-light.png)。
2. 关闭开关后关闭设置，品牌、数量与分隔线消失，滚动列表延伸到窗口底部，无底栏占位。深色与浅色均通过。见 [深色关闭](footer-off-dark.png)、[浅色关闭](footer-off-light.png)。
3. 关闭状态退出 App，再打开同一新构建：底栏仍隐藏；设置 AX 为 `Value: off`。见 [重启后](footer-off-restarted-dark.png)。
4. 重新开启，品牌、7 条数量与分隔线恢复，AX 重新出现“Melted 共 7 条内容”。见 [重新开启](footer-on-dark.png)。
5. 验证后恢复原来的深色外观，底栏保持默认开启，用户可自行选择关闭。

静态检查：设计检查（66 Markdown、477 本地链接、5 JSON 示例、34 组颜色及 reference token 一致性）、设计 token 生成器 `--check`、`git diff --check` 均通过。本次为本机显示偏好，不改变服务端契约；未新增镜像实现的单元测试。

范围：验证有内容列表的开关、布局、两套外观和重启持久保存；未执行完整 VoiceOver、加载/失败状态、全屏或 iOS 运行验收。空列表与初始加载的底栏使用同一条件分支，已源码复核，未单独运行截图。
