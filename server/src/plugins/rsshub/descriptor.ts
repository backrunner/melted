// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { descriptorSchema } from "../../modules/plugins/sdk/index.js";
export const descriptor = descriptorSchema.parse({
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
    primary_field: "route",
    columns: [
      { scope: "source", field: "name", label: "名称" },
      { scope: "configuration", field: "route", label: "订阅路由" },
      { scope: "source", field: "enabled", label: "状态" },
      { scope: "source", field: "interval_seconds", label: "采集间隔" },
    ],
    preset_catalog: { field: "route", maximum: 20 },
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
        help: "从实例目录选择来源，或填写运营者允许的相对路由；无需实例地址",
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
});
