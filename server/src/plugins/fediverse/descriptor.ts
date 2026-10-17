// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { descriptorSchema } from "../../modules/plugins/sdk/index.js";
import { actions } from "../shared/social.js";
export const descriptor = descriptorSchema.parse({
  dsl_version: 1,
  id: "fediverse",
  version: "1.0.0",
  kind: "collector",
  config_version: 1,
  title: "Fediverse",
  description: "订阅 Mastodon 兼容实例的公开账号和话题",
  capabilities: ["collector.poll"],
  form: {
    fields: [
      {
        id: "instance",
        type: "text",
        label: "实例",
        max_length: 200,
        format: "url",
        help: "使用服务器已授权的 Mastodon 兼容实例",
      },
      {
        id: "mode",
        type: "select",
        label: "订阅类型",
        default: "account",
        options: [
          { value: "account", label: "账号" },
          { value: "hashtag", label: "话题" },
        ],
      },
      {
        id: "target",
        type: "text",
        label: "订阅目标",
        max_length: 320,
        placeholder: "用户名@实例 或话题名称",
        help: "账号不要加开头的 @，话题不要加 #；远程账号须已被所选实例发现",
      },
      {
        id: "include_replies",
        type: "boolean",
        label: "包含回复",
        default: true,
      },
      {
        id: "include_boosts",
        type: "boolean",
        label: "包含转嘟",
        default: false,
      },
      {
        id: "max_items",
        type: "integer",
        label: "单次条数上限",
        minimum: 1,
        maximum: 40,
        default: 40,
        help: "采集最新公开窗口，最多 40 条",
      },
    ],
  },
  collection: {
    layout: "table",
    title: "订阅",
    columns: [
      { scope: "source", field: "name", label: "名称" },
      { scope: "configuration", field: "target", label: "订阅目标" },
      { scope: "configuration", field: "instance", label: "实例" },
      { scope: "source", field: "enabled", label: "状态" },
    ],
  },
  actions,
});
