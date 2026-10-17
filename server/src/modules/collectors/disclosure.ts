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
  const destinations = configured
    .flatMap((plugin) => plugin.destinations)
    .sort(
      (a, b) => a.id.localeCompare(b.id) || a.origin.localeCompare(b.origin),
    );
  const agent = destinations.some((d) => d.purpose === "agent_collection");
  return {
    version: "plugins-v1:" + (await hash(JSON.stringify(destinations))),
    destinations,
    description: `启用来源后，服务端向 ${destinations.map((d) => d.origin).join("、")} 请求公开内容并保存原始数据；RSSHub 实例可能继续访问上游，其请求记录由运营者管理。${agent ? "Agent 采集会将采集目标、来源地址及新抓取的公开内容发送给已声明的 ACP 网关和模型服务，由模型选择入库条目并消耗额度。" : ""}不会发送 Melted 账户凭据或已有资料库内容；采集结果尚不自动进入 AI 简报`,
  };
}
