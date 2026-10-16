# 参与 Melted

Melted 仍在早期开发。欢迎可复现的问题报告、原生界面改进、契约测试和文档修正。新增功能先对照[实施状态](.agents/14-implementation-status.md)与[设计索引](.agents/README.md)，说明要解决的具体问题；产品处理通用信息，不局限于技术内容。

## 开发与检查

macOS 开发需要 Xcode、Python 3 和已启动的 Apple Container。服务端、PostgreSQL 和 workerd 在容器内运行，Swift 使用本机工具链。

```sh
python3 scripts/dev.py up
sh scripts/check.sh
```

`check.sh` 检查设计引用、生成资产、TypeScript 类型与格式、两个后端的契约/集成测试、Swift 测试和 macOS 构建。UI 改动还要运行当前构建，记录深浅色、窗口尺寸与实际操作；构建成功不代表交互已验证。单项命令见 [README](README.md) 与[开发规范](.agents/12-development-standards.md)。

品牌图形源为 [mark.svg](assets/brand/mark.svg)。修改后运行 `python3 scripts/generate-brand-assets.py`，同步生成 Swift 路径和 README 亮暗标识；不要分别手改生成文件。

## 提交与评审

- 一次提交解决一类问题，说明结果和必要的验证。不要提交 `.local`、`.env`、真实配置、凭据、数据库或构建产物。
- 行为变化补充有意义的回归场景；契约变化同步 OpenAPI、共享 fixture 和两个后端。不要降低测试或对比度要求来掩盖失败。
- PR 写清触发条件、改动后的行为、已执行的检查和未验证范围；截图使用本机服务器实际提供的内容，本地数据由服务端命令行导入，避免私人内容。
- 依赖变更同步锁文件与 [THIRD_PARTY.md](THIRD_PARTY.md)，保留上游许可。

## 贡献许可

提交贡献表示你有权提供这些内容，并同意按项目的 **GPL-3.0-or-later** 许可发布。版权仍归各贡献者；不要求转让版权，也不授予维护者任意改为闭源许可的权利。完整条款见 [LICENSE](LICENSE) 和 [COPYRIGHT](COPYRIGHT)。本项目当前没有 App Store 分发例外。
