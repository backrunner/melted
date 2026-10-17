// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { rsshubConfigSchema } from "./config.js";
import { authorizeRoute } from "./routes.js";
import { pollRSSHub } from "./collector.js";
import {
  descriptorSchema,
  validateSettings,
} from "../../modules/plugins/dsl.js";
import type { CollectorPlugin } from "../../modules/plugins/definition.js";
import { manifestSchema } from "../../modules/plugins/compatibility.js";
import { routeSuggestions } from "./catalog.js";

export const rsshubPlugin: CollectorPlugin = {
  manifest: manifestSchema.parse({
    id: "rsshub",
    version: "1.0.0",
    runtime: "builtin",
    targets: ["node", "cloudflare"],
    capabilities: ["https"],
  }),
  descriptor: descriptorSchema.parse({
    dsl_version: 1,
    id: "rsshub",
    version: "1.0.0",
    title: "RSSHub",
    kind: "collector",
    config_version: 1,
    description:
      "订阅新闻、文化生活、社区等公开来源，保存当前订阅窗口中的原始内容",
    capabilities: ["collector.poll"],
    collection: {
      layout: "table",
      title: "订阅",
      columns: [
        { scope: "source", field: "name", label: "名称" },
        { scope: "configuration", field: "route", label: "订阅路由" },
        { scope: "source", field: "enabled", label: "状态" },
        { scope: "source", field: "interval_seconds", label: "采集间隔" },
      ],
      add_from_suggestions: { field: "route", maximum: 20 },
    },
    form: {
      fields: [
        {
          id: "route",
          type: "text",
          label: "订阅路由",
          placeholder: "/bbc/world-asia",
          max_length: 2048,
          monospaced: true,
          help: "选择订阅建议，或填写运营者允许的相对路由；无需实例地址",
        },
      ],
    },
    actions: [
      {
        id: "sync",
        label: "立即采集",
        description: "创建后台采集任务，可查看实际入库结果",
        effect: "collect",
        input: { fields: [] },
      },
      {
        id: "validate",
        label: "检查配置",
        description: "检查路由格式与运营者授权范围，不发起网络请求",
        effect: "validate",
        input: { fields: [] },
      },
    ],
  }),
  deploymentErrors(operator, target) {
    const config = rsshubConfigSchema.parse(operator);
    return target === "cloudflare" &&
      (config.allow_private || !config.base_url.startsWith("https://"))
      ? ["Production Cloudflare RSSHub requires a public HTTPS instance"]
      : [];
  },
  configure(operator) {
    const config = rsshubConfigSchema.parse(operator);
    const descriptor = descriptorSchema.parse({
      ...this.descriptor,
      form: {
        fields: [
          {
            ...this.descriptor.form.fields[0],
            suggestions: routeSuggestions(config),
          },
        ],
      },
    });
    return {
      descriptor,
      destination: {
        id: descriptor.id,
        origin: config.base_url,
        purpose: "public_feed_collection",
        data_categories: ["source_route"],
      },
      validate(value) {
        const normalized = validateSettings(descriptor.form, value);
        authorizeRoute(config, String(normalized.route));
        return normalized;
      },
      poll: (source, signal) => pollRSSHub(source, config, signal),
    };
  },
};
