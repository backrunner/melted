# Collector boilerplate

这是可类型检查、可运行测试的插件模板，提供独立 config、descriptor、基类实现及测试。它演示一个固定 HTTPS JSON 来源，不默认启用，也不附带真实公共服务。

从仓库根运行 `rtk proxy python3 scripts/dev.py exec npm run plugins:new -- culture-notes`，生成模块与测试；现有文件不会被覆盖。修改上游协议后，在组合根与启用清单注册，运营配置使用 PLUGIN_CONFIG。

完整生命周期、注册步骤、秘密边界及双部署验证见 [插件开发指南](../../docs/plugin-development.md)。
