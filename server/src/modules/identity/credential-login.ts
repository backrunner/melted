// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import type { Config } from "../../config/schema.js";
import { hash } from "../../shared/crypto.js";
import { parse } from "../../shared/validation.js";
import { Problem } from "../../shared/problem.js";
import { requireMethod } from "./auth-policy.js";
import { verifyPassword } from "./password.js";
import type { IdentityRepository } from "./repository.js";

type CredentialRepository = IdentityRepository & {
  limit(key: string, maximum: number): Promise<void>;
};
export async function credentialLogin(
  repo: CredentialRepository,
  config: Config,
  method: "password" | "api_key",
  body: unknown,
) {
  requireMethod(config, method);
  const accounts = config.authentication?.accounts ?? [];
  let subject: string | undefined;
  if (method === "password") {
    const input = parse(
      z
        .object({
          username: z.string().trim().min(1).max(200),
          password: z.string().min(1).max(1024),
        })
        .strict(),
      body,
    );
    await repo.limit(
      "password:" + (await hash(config.serverID + "\n" + input.username)),
      10,
    );
    const account = accounts.find((a) => a.username === input.username);
    if (await verifyPassword(input.password, account?.password_hash))
      subject = account?.subject;
  } else {
    const input = parse(
      z
        .object({ api_key: z.string().regex(/^melted_[A-Za-z0-9_-]{43}$/) })
        .strict(),
      body,
    );
    const digest = await hash(input.api_key);
    subject = accounts.find((a) => a.api_key_hashes.includes(digest))?.subject;
  }
  if (!subject) throw new Problem(401, "invalid_credentials");
  // Namespace prevents accidental merging with key or OIDC identities. Only the operator
  // can bind a password and API key to the same stable subject in AUTH_CONFIG.
  const owner =
    "acc_" + (await hash(config.serverID + "\nmanaged\n" + subject));
  return repo.managedSession(owner);
}
