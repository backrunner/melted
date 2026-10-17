// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { descriptorSchema } from "../../src/modules/plugins/sdk/index.js";
export const descriptor = descriptorSchema.parse({
  dsl_version: 1,
  id: "example.articles",
  version: "1.0.0",
  kind: "collector",
  config_version: 1,
  title: "文章采集示例",
  description: "从运营者配置的 JSON 服务订阅多个主题",
  capabilities: ["collector.poll"],
  form: {
    fields: [
      {
        id: "topic",
        type: "text",
        label: "主题",
        max_length: 50,
        placeholder: "culture",
      },
    ],
  },
  collection: {
    layout: "table",
    title: "订阅",
    columns: [
      { scope: "source", field: "name", label: "名称" },
      { scope: "configuration", field: "topic", label: "主题" },
      { scope: "source", field: "enabled", label: "状态" },
    ],
    add_from_suggestions: { field: "topic", maximum: 20 },
  },
  actions: [
    {
      id: "sync",
      label: "立即采集",
      description: "创建后台采集任务",
      effect: "collect",
      input: { fields: [] },
    },
    {
      id: "validate",
      label: "检查配置",
      description: "检查主题是否获运营者允许",
      effect: "validate",
      input: { fields: [] },
    },
  ],
});
