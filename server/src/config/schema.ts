// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { rsshubConfigSchema } from "../modules/collectors/config.js";
import { z } from "zod";
import { parse } from "../shared/validation.js";
import { authPolicySchema } from "../modules/identity/auth-policy.js";

export const configSchema = z
  .object({
    serverID: z.string().min(1).max(100),
    operator: z.string().min(1).max(200),
    publicOrigin: z
      .url()
      .refine((v) => {
        const u = new URL(v);
        return (
          u.pathname === "/" &&
          !u.username &&
          !u.password &&
          !u.search &&
          !u.hash &&
          (u.protocol === "https:" ||
            (u.protocol === "http:" &&
              ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)))
        );
      })
      .transform((v) => new URL(v).origin),
    registration: z.enum(["key", "closed"]).default("key"),
    authentication: authPolicySchema.optional(),
    rsshub: rsshubConfigSchema.optional(),
    oidc: z
      .object({
        issuer: z.url().startsWith("https://"),
        clientID: z.string().min(1),
        clientSecret: z.string().optional(),
      })
      .optional(),
  })
  .refine(
    (c) => !c.authentication?.methods.includes("browser") || Boolean(c.oidc),
    "Browser authentication requires OIDC",
  );
export type Config = z.infer<typeof configSchema>;
export function configFromEnv(env: Record<string, string | undefined>): Config {
  const oidcPresent = [
    env.OIDC_ISSUER,
    env.OIDC_CLIENT_ID,
    env.OIDC_CLIENT_SECRET,
  ].some(Boolean);
  return parse(configSchema, {
    serverID: env.MELTED_SERVER_ID,
    operator: env.MELTED_OPERATOR ?? "Melted",
    publicOrigin: env.PUBLIC_ORIGIN,
    registration: env.REGISTRATION_MODE ?? "key",
    authentication:
      env.AUTH_CONFIG !== undefined
        ? parseAuthJSON(env.AUTH_CONFIG)
        : undefined,
    rsshub: env.RSSHUB_CONFIG
      ? {
          ...(parseAuthJSON(env.RSSHUB_CONFIG, "RSSHUB_CONFIG") as object),
          ...(env.RSSHUB_ACCESS_KEY
            ? { access_key: env.RSSHUB_ACCESS_KEY }
            : {}),
        }
      : undefined,
    oidc: oidcPresent
      ? {
          issuer: env.OIDC_ISSUER,
          clientID: env.OIDC_CLIENT_ID,
          clientSecret: env.OIDC_CLIENT_SECRET,
        }
      : undefined,
  });
}
function parseAuthJSON(value: string, name = "AUTH_CONFIG"): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${name} must be valid JSON`);
  }
}
