// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { pluginRegistry, pluginConfiguration } from "../../../plugins/index.js";
import { z } from "zod";
import type { CloudBindings } from "../bindings.js";
import { CloudSources } from "./proxy.js";
import { executeClaim } from "../../../modules/jobs/execute.js";
import { configFromEnv } from "../../../config/schema.js";
import { CloudRepository } from "../repository.js";
import {
  effectiveProcessing,
  guardedProcessing,
} from "../../../modules/processing/credentials.js";
import { processingDisclosure } from "../../../modules/processing/config.js";
import { executeProcessing } from "../../../modules/processing/execute.js";
import { HTTPProcessingModels } from "../../../modules/processing/provider.js";

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
      PLUGIN_CONFIG: env.PLUGIN_CONFIG,
      RSSHUB_ACCESS_KEY: env.RSSHUB_ACCESS_KEY,
      PROCESSING_CONFIG: env.PROCESSING_CONFIG,
      PROCESSING_SEAL_KEY: env.PROCESSING_SEAL_KEY,
    });
  const repo = new CloudRepository(env),
    processing = repo.processing;
  for (const message of batch.messages) {
    const task = z
      .object({
        owner: z.string().regex(/^acc_[a-f0-9]{64}$/),
        processing_id: z.string().regex(/^[A-Za-z0-9_]{1,256}$/),
      })
      .strict()
      .safeParse(message.body);
    if (task.success) {
      try {
        const current = await effectiveProcessing(
            repo,
            config,
            task.data.owner,
          ),
          ai = await processingDisclosure(current);
        const claim = await processing.claim(
          task.data.owner,
          task.data.processing_id,
          ai?.fingerprint ?? "unconfigured",
          current?.daily_call_limit ?? 0,
        );
        if (claim && current)
          await executeProcessing(
            guardedProcessing(repo, config),
            claim,
            current,
            new HTTPProcessingModels(current),
          );
        message.ack();
      } catch {
        message.retry({ delaySeconds: 30 });
      }
      continue;
    }
    const parsed = messageSchema.safeParse(message.body);
    if (!parsed.success) {
      message.ack();
      continue;
    }
    try {
      const claim = await sources.claim(parsed.data.owner, parsed.data.run_id);
      if (claim)
        await executeClaim(
          sources,
          claim,
          pluginRegistry,
          pluginConfiguration(config),
        );
      message.ack();
    } catch {
      message.retry({ delaySeconds: 30 });
    }
  }
}
