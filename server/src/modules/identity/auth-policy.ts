// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import type { Config } from "../../config/schema.js";
import { Problem } from "../../shared/problem.js";

export const authMethodSchema = z.enum([
  "password",
  "api_key",
  "browser",
  "key",
]);
export type AuthMethod = z.infer<typeof authMethodSchema>;
// Fixed, bounded work factors on both runtimes. No parameters controlled by login requests.
export const passwordHashSchema = z
  .string()
  .regex(/^scrypt\$16384\$8\$5\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
export const authPolicySchema = z
  .object({
    methods: z.array(authMethodSchema).min(1).max(4),
    preferred: authMethodSchema.optional(),
    accounts: z
      .array(
        z
          .object({
            subject: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
            username: z.string().trim().min(1).max(200).optional(),
            password_hash: passwordHashSchema.optional(),
            api_key_hashes: z
              .array(z.string().regex(/^[a-f0-9]{64}$/))
              .max(10)
              .default([]),
          })
          .strict(),
      )
      .max(100)
      .default([]),
  })
  .strict()
  .superRefine((p, ctx) => {
    const invalid = () =>
      ctx.addIssue({
        code: "custom",
        message: "Invalid authentication configuration",
      });
    if (
      new Set(p.methods).size !== p.methods.length ||
      (p.preferred && !p.methods.includes(p.preferred))
    )
      invalid();
    const subjects = new Set<string>(),
      users = new Set<string>(),
      keys = new Set<string>();
    for (const a of p.accounts) {
      if (subjects.has(a.subject) || (a.username && users.has(a.username)))
        invalid();
      subjects.add(a.subject);
      if (a.username) users.add(a.username);
      if (Boolean(a.username) !== Boolean(a.password_hash)) invalid();
      if (!a.password_hash && !a.api_key_hashes.length) invalid();
      for (const key of a.api_key_hashes) {
        if (keys.has(key)) invalid();
        keys.add(key);
      }
    }
    if (
      p.methods.includes("password") &&
      !p.accounts.some((a) => a.password_hash)
    )
      invalid();
    if (p.methods.includes("api_key") && !keys.size) invalid();
  });

export function authentication(config: Config) {
  const methods: AuthMethod[] = config.authentication?.methods ?? [
    "key",
    ...(config.oidc ? ["browser" as const] : []),
  ];
  return {
    version: 1,
    methods,
    preferred: config.authentication?.preferred ?? methods[0]!,
    ...(methods.includes("key") ? { key_algorithm: "P-256" } : {}),
    ...(methods.includes("browser")
      ? { browser_callback: "melted://auth/callback" }
      : {}),
  };
}
export function requireMethod(config: Config, method: AuthMethod) {
  if (!authentication(config).methods.includes(method))
    throw new Problem(404, "auth_method_unavailable");
}
