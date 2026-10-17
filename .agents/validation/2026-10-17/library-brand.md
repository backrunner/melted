# 列表底栏品牌恢复

2026-10-17，按用户截图，将正式 m + Melted 字标恢复到列表底栏左侧，真实条数与加载状态保留在右侧。复用 `MeltedWordmark` 的紧凑样式：标识 16 pt、文字 13 pt、间距 6 pt；底栏仍使用 canvas 底色及水平 24 / 垂直 10 pt 边距。空列表和初始加载也使用同一底栏。

## 构建与范围

- macOS 27.0.1（26A434），从当前源码构建并替换 `build/latest/Melted.app`，实际启动版本 **0.2.0（13）**，Bundle ID **com.alkinum.melted**；设置中的版本字段亦确认 13。
- 可执行文件 SHA-256：`bd65812caa8a90194800d3f99942b3d1e5e89ace0c5c12956ae9e1823a963392`。
- `sh scripts/build-macos.sh`、`codesign --verify --deep --strict`、设计 token / 品牌生成器 `--check`、`check_design.py` 与 `git diff --check` 通过。
- 本次验证列表底栏；使用现有本机开发服务器的 7 条样例，阅读字号 100%。未重跑完整阅读/登录/辅助设置矩阵，也未验证 iOS。初始加载中的底栏由源码结构确认，未捕获单独的加载截图。

## 原生检查

| 场景 | 结果与截图 |
| --- | --- |
| 标准窗口，浅色 | m + Melted 左对齐，7 条靠右，文字清楚；[截图](library-brand/light.jpg) |
| 标准窗口，深色 | 暖褐标识与暖灰文字匹配现有主题，列表滚动到底部后底栏位置不变；[截图](library-brand/dark.jpg) |
| 紧凑窗口，浅色 | 通过原生“紧凑阅读窗口”菜单切换为 680 pt 宽，字标与数量保持单行，内容仍可滚动；[截图](library-brand/compact-light.jpg) |
| 未读空列表，浅色 / 深色 | 筛选返回真实 0 条，字标和条数仍显示在底栏，没有挤压空态；[浅色](library-brand/empty-light.jpg)、[深色](library-brand/empty-dark.jpg) |

完成后恢复全部内容、深色、标准窗口；正式标识几何与应用图标未改动。
