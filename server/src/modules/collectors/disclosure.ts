// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { hash } from "../../shared/crypto.js";
import { collectorEnabled } from "../plugins/registry.js";
import type { RSSHubConfig } from "./config.js";

export async function collectionDisclosure(config: RSSHubConfig | undefined) {
  if (!config || !collectorEnabled())
    return {
      version: "local-v1",
      destinations: [],
      description: "此版本存储并展示内容，尚未配置外部采集或 AI 处理服务",
    };
  const destinations = [
    {
      id: "rsshub",
      origin: config.base_url,
      purpose: "public_feed_collection",
      data_categories: ["source_route"],
    },
  ];
  return {
    version: "rsshub-v1:" + (await hash(JSON.stringify(destinations))),
    destinations,
    description: `启用来源后，服务端向 ${config.base_url} 请求公开订阅路由并保存原始内容；该实例可能继续访问上游来源，其请求记录由运营者管理。不会发送 Melted 账户凭据、已存正文或附件，也未启用 AI 整理`,
  };
}
