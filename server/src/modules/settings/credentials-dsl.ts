// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import type { Config } from "../../config/schema.js";
import { authorizeCredentials } from "../processing/credentials.js";
export const credentialSectionSchema = z
  .object({
    id: z.literal("model_credentials"),
    scope: z.enum(["account", "server"]),
    title: z.string().max(1000),
    description: z.string().max(3000),
    fields: z
      .array(
        z
          .object({
            id: z.enum(["generator_key", "decision_key"]),
            type: z.literal("secret"),
            label: z.string().max(1000),
            placeholder: z.string().max(1000),
            max_length: z.literal(4096),
          })
          .strict(),
      )
      .length(2),
    load: z
      .object({
        method: z.literal("GET"),
        path: z
          .string()
          .regex(/^\/v1\/settings\/credentials\/(?:account|server)$/),
      })
      .strict(),
    save: z
      .object({
        method: z.literal("POST"),
        path: z
          .string()
          .regex(/^\/v1\/settings\/credentials\/(?:account|server)$/),
        format: z.literal("write-only-secrets-v1"),
        label: z.string().max(1000),
        confirmation: z.string().max(3000),
      })
      .strict(),
  })
  .strict()
  .refine(
    (s) =>
      new Set(s.fields.map((f) => f.id)).size === 2 &&
      s.load.path.endsWith("/" + s.scope) &&
      s.save.path === s.load.path,
  );
export function credentialSection(config: Config, owner: string) {
  const mode = config.processing?.credentials.mode;
  if (!mode || mode === "operator") return undefined;
  const scope = mode === "byok" ? "account" : "server";
  try {
    authorizeCredentials(config, owner, scope);
  } catch {
    return undefined;
  }
  const p = config.processing!,
    path = "/v1/settings/credentials/" + scope;
  return credentialSectionSchema.parse({
    id: "model_credentials",
    scope,
    title: scope === "account" ? "我的模型凭据（BYOK）" : "服务器模型凭据",
    description:
      (scope === "account"
        ? "仅用于当前账户的整理任务，不与其他账户共用"
        : "用于全服务器的整理任务，仅管理员可配置") +
      `。生成模型：${p.generator.model}（${new URL(p.generator.endpoint).origin}）；判断模型：${p.decision.model}（${new URL(p.decision.endpoint).origin}）。密钥写入服务器后加密保存，不回显`,
    fields: [
      {
        id: "generator_key",
        type: "secret",
        label: "生成模型 API Key",
        placeholder: "输入新密钥，留空保留已保存密钥",
        max_length: 4096,
      },
      {
        id: "decision_key",
        type: "secret",
        label: "Jev API Key",
        placeholder: "输入新密钥，留空保留已保存密钥",
        max_length: 4096,
      },
    ],
    load: { method: "GET", path },
    save: {
      method: "POST",
      path,
      format: "write-only-secrets-v1",
      label: "保存凭据",
      confirmation:
        (scope === "account"
          ? "将密钥保存到当前服务器，仅供本账户整理任务使用"
          : "将共用密钥保存到当前服务器，供所有账户整理任务使用") +
        "。保存不验证密钥有效性；变更后需要重新编译并确认偏好，已发出的模型请求可能仍产生费用",
    },
  });
}
