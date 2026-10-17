# 服务端部署

服务端已迁移到 TypeScript。完整操作说明以 [迁移与部署](../.agents/15-typescript-transition.md) 为准，避免维护另一套冲突步骤。

- 自托管：根目录 Dockerfile、compose.yaml，Node 24 / PostgreSQL 17。migrate 独立执行，事务及 advisory lock 保证并发重放安全；API 与 collector 在迁移完成后分别启动。可选 `rsshub` profile 提供固定镜像实例。
- Cloudflare：server/wrangler.jsonc，Workers + SQLite AccountStore / ControlStore，基础设施不依赖第三方数据库。采集通过 AccountStore Alarms、事务 outbox 和 Queues；首次部署须先建立配置中的采集/死信 Queue。生产 deployment 先检查插件/配置并打包 Worker。
- 本机：python3 scripts/dev.py up / worker / rsshub / collector / check / down，所有服务与模拟器运行在 Apple Container，Swift App 原生运行。

配置包括 DATABASE_URL（仅 Node）、稳定 MELTED_SERVER_ID、MELTED_OPERATOR、PUBLIC_ORIGIN、REGISTRATION_MODE=key|closed，以及可选 OIDC_ISSUER / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET。插件使用 `PLUGIN_CONFIG` JSON map；RSSHub 兼容 `RSSHUB_CONFIG`，两种方式均支持独立服务端秘密 `RSSHUB_ACCESS_KEY`，配置与来源 API 见 [采集指南](../server/docs/rsshub.md)。密钥不得提交或记录。Node 默认容器内 0.0.0.0:8421，主机端口只映射 loopback。

查询快照 5 分钟、最多 8 份/账户、2,000 条/8 MiB；状态 mutation 幂等记录保留至少 7 天。changes 是提交有序提示，完整离线同步尚未提供。公开注册按凭据持有权，客户端可同步钥匙串不证明 Apple 身份。
