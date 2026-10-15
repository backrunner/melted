// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { scrypt, timingSafeEqual } from "node:crypto";
import { b64 } from "../../shared/crypto.js";
import { Problem } from "../../shared/problem.js";

// OWASP's 16 MiB scrypt configuration fits Workers as well as Node.
// Bound in-flight work per isolate instead of building an unbounded memory queue.
let active = false;
async function derive(password: string, salt: string): Promise<Buffer> {
  if (active) throw new Problem(503, "authentication_busy");
  active = true;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(
        password,
        Buffer.from(salt, "base64url"),
        32,
        { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 },
        (error, result) => (error ? reject(error) : resolve(result)),
      );
    });
  } finally {
    active = false;
  }
}
export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 1024)
    throw new Error("Password must contain 12–1024 characters");
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  return `scrypt$16384$8$5$${salt}$${b64(await derive(password, salt))}`;
}
// Unknown usernames still perform the same password derivation.
const dummy = `scrypt$16384$8$5$${"A".repeat(22)}$${"A".repeat(43)}`;
export async function verifyPassword(password: string, encoded?: string) {
  const parts = (encoded ?? dummy).split("$");
  const actual = await derive(password, parts[4]!);
  return (
    timingSafeEqual(actual, Buffer.from(parts[5]!, "base64url")) &&
    encoded !== undefined
  );
}
