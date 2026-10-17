// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { hash } from "../../shared/crypto.js";
import type { PluginRegistry } from "../plugins/registry.js";

export async function collectionDisclosure(
  configuration: Record<string, unknown>,
  registry: PluginRegistry,
) {
  const configured = registry.configured(configuration);
  if (!configured.length)
    return {
      version: "local-v1",
      destinations: [],
      description: "此版本存储并展示内容，尚未配置外部采集或 AI 处理服务",
    };
  const destinations = configured.map((plugin) => plugin.destination);
  return {
    version: "plugins-v1:" + (await hash(JSON.stringify(destinations))),
    destinations,
    description: `启用来源后，服务端向 ${destinations.map((d) => d.origin).join("、")} 请求公开订阅路由并保存原始内容；该实例可能继续访问上游来源，其请求记录由运营者管理。不会发送 Melted 账户凭据、已存正文或附件，也未启用 AI 整理`,
  };
}
