// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { isAbsolute } from "node:path";
import { profileSchema } from "../modules/agent-collection/protocol.js";
export const DSH_VERSION = "0.2.0-rc.2";
export const gatewayConfigSchema = z
  .object({
    listen_host: z.enum(["127.0.0.1", "0.0.0.0"]).default("127.0.0.1"),
    port: z.number().int().min(0).max(65535).default(8430),
    access_token_env: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]+$/)
      .default("MELTED_AGENT_GATEWAY_TOKEN"),
    data_directory: z.string().refine(isAbsolute),
    dsh_package_directory: z.string().refine(isAbsolute),
    max_daily_runs: z.number().int().min(1).max(1000).default(24),
    profiles: z
      .array(
        profileSchema
          .safeExtend({
            model: z
              .string()
              .regex(/^[a-zA-Z0-9._-]{1,100}$/)
              .default("deepseek-v4-flash"),
            model_base_url: z
              .url()
              .default("https://api.deepseek.com/anthropic"),
            api_key_env: z
              .string()
              .regex(/^[A-Z][A-Z0-9_]+$/)
              .default("DEEPSEEK_API_KEY"),
          })
          .refine((p) => {
            const u = new URL(p.model_base_url);
            return (
              u.origin === p.model_origin &&
              !u.username &&
              !u.password &&
              !u.search &&
              !u.hash
            );
          }),
      )
      .min(1)
      .max(10),
  })
  .strict()
  .refine(
    (c) => new Set(c.profiles.map((p) => p.id)).size === c.profiles.length,
  );
export type GatewayConfig = z.infer<typeof gatewayConfigSchema>;
export type GatewayProfile = GatewayConfig["profiles"][number];
