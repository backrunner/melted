// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { descriptorSchema } from "../../modules/plugins/sdk/index.js";
export const descriptor = descriptorSchema.parse({
  dsl_version: 1,
  id: "feed",
  version: "1.0.0",
  kind: "collector",
  config_version: 1,
  title: "RSS / Atom",
  description: "直接订阅网站的 RSS、Atom 或 JSON Feed",
  capabilities: ["collector.poll"],
  form: {
    fields: [
      {
        id: "url",
        type: "text",
        format: "url",
        label: "订阅地址",
        placeholder: "https://example.com/feed.xml",
        max_length: 2048,
        help: "填写完整的 Feed 地址，网站首页不会自动查找订阅链接",
      },
      {
        id: "format",
        type: "select",
        label: "Feed 格式",
        default: "auto",
        options: [
          { value: "auto", label: "自动识别" },
          { value: "rss", label: "RSS 2.0" },
          { value: "atom", label: "Atom 1.0" },
          { value: "json", label: "JSON Feed" },
        ],
      },
      {
        id: "max_items",
        type: "integer",
        label: "单次条数上限",
        minimum: 1,
        maximum: 100,
        default: 100,
        help: "按 Feed 的条目顺序读取，最多保存前 100 条；不回填历史",
        suggestions: [
          { value: 20, label: "20 条" },
          { value: 50, label: "50 条" },
          { value: 100, label: "100 条" },
        ],
      },
    ],
  },
  collection: {
    layout: "table",
    title: "订阅",
    primary_field: "url",
    columns: [
      { scope: "source", field: "name", label: "名称" },
      { scope: "configuration", field: "url", label: "订阅地址" },
      { scope: "source", field: "enabled", label: "状态" },
      { scope: "source", field: "interval_seconds", label: "采集间隔" },
    ],
  },
  actions: [
    {
      id: "sync",
      label: "立即采集",
      description: "从 Feed 获取当前条目",
      effect: "collect",
      input: { fields: [] },
    },
    {
      id: "validate",
      label: "检查配置",
      description: "检查地址格式、允许的站点与采集设置",
      effect: "validate",
      input: { fields: [] },
    },
  ],
});
