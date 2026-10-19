// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { hash } from "../../shared/crypto.js";
import type { PluginRegistry } from "../plugins/registry.js";
import {
  processingDisclosure,
  type ProcessingSettings,
} from "../processing/config.js";

export async function collectionDisclosure(
  configuration: Record<string, unknown>,
  registry: PluginRegistry,
  processing?: ProcessingSettings,
) {
  const ai = await processingDisclosure(processing);
  const configured = registry.configured(configuration);
  if (!configured.length && !ai)
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
    version:
      "plugins-v1:" +
      (await hash(
        JSON.stringify(ai ? [destinations, ai.fingerprint] : destinations),
      )),
    destinations,
    ...(ai
      ? {
          processing: {
            fingerprint: ai.fingerprint,
            destinations: ai.destinations,
          },
        }
      : {}),
    description: `启用来源后，服务端向 ${destinations.map((d) => d.origin).join("、") || "已配置的来源"} 请求公开内容并保存原始数据；RSSHub 实例可能继续访问上游，其请求记录由运营者管理。${agent ? "Agent 采集会将采集目标、来源地址及新抓取的公开内容发送给已声明的 ACP 网关和模型服务，由模型选择入库条目并消耗额度。" : ""}${ai ? `在偏好设置中明确同意并应用编译草案后，自然语言偏好和已采集的公开来源内容将发送至 ${ai.destinations.join("、")}，用于分类、筛选、生成和材料忠实性检查并消耗模型额度。不会发送账户凭据；原文保留，未经验证的输出不发布。` : "不会发送 Melted 账户凭据或已有资料库内容；采集结果尚不自动进入 AI 简报"}`,
  };
}
