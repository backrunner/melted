# 连接背景清晰度

日期：2026-10-17。修复连接页液体边缘发虚。

## 改动

- 移除 MeltedBackdrop 液体 Canvas 最外层的 0.8 pt 模糊。保留内部用于形状融合的模糊与 alpha threshold，最终轮廓直接输出。
- 光晕、颜色、透明度、时间参数和 Reduce Motion 分支保持原样。设计规范增加最终轮廓不叠加模糊的要求。
- README 使用本轮浅色连接页截图；历史验证截图保留原样。

## 构建与实际检查

- 系统：macOS 27.0.1（26A434）。应用：build/latest/Melted.app，Bundle ID com.alkinum.melted，版本 0.2.0（9）。设置页实际显示新版本。
- 主程序 SHA-256：395818400a28111a230bfd4fcbd525919efca620e1926deed05461a717b05831。
- scripts/build-macos.sh 原生构建和 Apple Development 签名通过；替换后 codesign --verify --deep --strict 通过，退出旧 App 后启动新构建。
- 设计静态检查通过：44 个 Markdown、293 个本地链接、5 个 JSON 示例、34 组颜色，最低对比 4.71:1；git diff --check 通过。
- 同一标准窗口截图为 2240 × 1520 像素。浅色与深色均目视检查顶部滴坠、底部波形：边缘清晰，中央表单正常，无明显裁切。截图分别见[修改前浅色](backdrop-clarity/before-light.jpg)、[修改后浅色](backdrop-clarity/after-light.jpg)、[修改后深色](backdrop-clarity/after-dark.jpg)。
- [稍后深色帧](backdrop-clarity/after-dark-later.jpg)记录后续动画状态；多帧检查不等于帧率或性能测试。
- 检查后恢复深色、100% 阅读字号，使用既有身份登录同一本机服务器；原有 7 条内容正常返回，新版保持运行。

本次没有执行完整页面、最低系统、非 Retina 屏幕或辅助功能矩阵；Reduce Motion 本轮仅核对分支未改动。局部视觉修改不重跑后端测试，也不称为远端 CI 或公证发行。
