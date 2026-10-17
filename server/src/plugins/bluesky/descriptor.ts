// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { descriptorSchema } from "../../modules/plugins/sdk/index.js";
import { actions, maxItemsField } from "../shared/social.js";
export const descriptor = descriptorSchema.parse({
  dsl_version: 1,
  id: "bluesky",
  version: "1.0.0",
  kind: "collector",
  config_version: 1,
  title: "Bluesky",
  description: "订阅 Bluesky 账号和自定义 Feed 的公开帖子",
  capabilities: ["collector.poll"],
  form: {
    fields: [
      {
        id: "mode",
        type: "select",
        label: "订阅类型",
        default: "author",
        options: [
          { value: "author", label: "账号" },
          { value: "feed", label: "自定义 Feed" },
        ],
      },
      {
        id: "target",
        type: "text",
        label: "订阅目标",
        max_length: 1000,
        placeholder: "bsky.app",
        help: "账号填写 handle 或 DID；自定义 Feed 填写 at://…/app.bsky.feed.generator/…",
      },
      {
        id: "include_replies",
        type: "boolean",
        label: "包含回复",
        default: true,
      },
      {
        id: "include_reposts",
        type: "boolean",
        label: "包含转发",
        default: false,
      },
      maxItemsField,
    ],
  },
  collection: {
    layout: "table",
    title: "订阅",
    columns: [
      { scope: "source", field: "name", label: "名称" },
      { scope: "configuration", field: "target", label: "订阅目标" },
      { scope: "source", field: "enabled", label: "状态" },
      { scope: "source", field: "interval_seconds", label: "采集间隔" },
    ],
  },
  actions,
});
