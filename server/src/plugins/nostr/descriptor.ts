// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { descriptorSchema } from "../../modules/plugins/sdk/index.js";
import { actions, maxItemsField } from "../shared/social.js";
export const descriptor = descriptorSchema.parse({
  dsl_version: 1,
  id: "nostr",
  version: "1.0.0",
  kind: "collector",
  config_version: 1,
  title: "Nostr",
  description: "从公开 relay 订阅已验证签名的短帖和长文",
  capabilities: ["collector.poll"],
  form: {
    fields: [
      {
        id: "relay",
        type: "text",
        label: "Relay",
        max_length: 200,
        help: "使用服务器授权的 wss:// relay",
      },
      {
        id: "mode",
        type: "select",
        label: "订阅类型",
        default: "author",
        options: [
          { value: "author", label: "作者" },
          { value: "hashtag", label: "话题" },
        ],
      },
      {
        id: "target",
        type: "text",
        label: "订阅目标",
        max_length: 200,
        placeholder: "npub1… 或话题名称",
        help: "作者填写 npub 公钥或 64 位十六进制公钥；话题不加 #，按原文匹配；不要输入私钥",
      },
      {
        id: "kind",
        type: "select",
        label: "内容类型",
        default: "notes",
        options: [
          { value: "notes", label: "短帖" },
          { value: "articles", label: "长文" },
        ],
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
      { scope: "configuration", field: "relay", label: "Relay" },
      { scope: "source", field: "enabled", label: "状态" },
    ],
  },
  actions,
});
