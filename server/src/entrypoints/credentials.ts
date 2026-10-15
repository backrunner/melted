// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { parse } from "../shared/validation.js";
import { hash, random } from "../shared/crypto.js";
import { hashPassword } from "../modules/identity/password.js";

// Read secrets from stdin, never argv/environment or a logged command line.
try {
  const mode = process.argv[2];
  if (!["password", "api-key"].includes(mode ?? "") || process.stdin.isTTY)
    throw new Error();
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk.toString();
    if (Buffer.byteLength(input) > 8192) throw new Error();
  }
  const subject = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
  if (mode === "password") {
    const data = parse(
      z
        .object({
          subject,
          username: z.string().trim().min(1).max(200),
          password: z.string().min(12).max(1024),
        })
        .strict(),
      JSON.parse(input),
    );
    console.log(
      JSON.stringify(
        {
          subject: data.subject,
          username: data.username,
          password_hash: await hashPassword(data.password),
        },
        null,
        2,
      ),
    );
  } else {
    const data = parse(z.object({ subject }).strict(), JSON.parse(input));
    const apiKey = "melted_" + random();
    console.log(
      JSON.stringify(
        {
          api_key: apiKey,
          account: {
            subject: data.subject,
            api_key_hashes: [await hash(apiKey)],
          },
        },
        null,
        2,
      ),
    );
  }
} catch {
  console.error(
    "Provide valid JSON on stdin. password: {subject, username, password (12–1024 characters)}; api-key: {subject}.",
  );
  process.exitCode = 1;
}
