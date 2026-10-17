// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import type { CloudBindings } from "../bindings.js";
import { CloudSources } from "./proxy.js";
import { executeClaim } from "../../../modules/jobs/execute.js";
import { configFromEnv } from "../../../config/schema.js";

const messageSchema = z
  .object({
    owner: z.string().regex(/^acc_[a-f0-9]{64}$/),
    run_id: z.string().regex(/^run_[a-f0-9]{32}$/),
  })
  .strict();
export async function consumeCollections(
  batch: MessageBatch<unknown>,
  env: CloudBindings,
) {
  const sources = new CloudSources(env.ACCOUNTS),
    config = configFromEnv({
      MELTED_SERVER_ID: env.MELTED_SERVER_ID,
      MELTED_OPERATOR: env.MELTED_OPERATOR,
      PUBLIC_ORIGIN: env.PUBLIC_ORIGIN,
      RSSHUB_CONFIG: env.RSSHUB_CONFIG,
      RSSHUB_ACCESS_KEY: env.RSSHUB_ACCESS_KEY,
    });
  for (const message of batch.messages) {
    const parsed = messageSchema.safeParse(message.body);
    if (!parsed.success) {
      message.ack();
      continue;
    }
    try {
      const claim = await sources.claim(parsed.data.owner, parsed.data.run_id);
      if (claim) await executeClaim(sources, claim, config.rsshub);
      message.ack();
    } catch {
      message.retry({ delaySeconds: 30 });
    }
  }
}
