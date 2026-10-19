// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { pluginRegistry, pluginConfiguration } from "../plugins/index.js";
import { setTimeout as delay } from "node:timers/promises";
import { configFromEnv } from "../config/schema.js";
import { nodeEnvironment } from "../config/node-loader.js";
import { connect } from "../storage/postgres/connection.js";
import { PostgresSources } from "../storage/postgres/sources/repository.js";
import { executeClaim } from "../modules/jobs/execute.js";
import { PostgresRepository } from "../storage/postgres/repository.js";
import {
  effectiveProcessing,
  guardedProcessing,
} from "../modules/processing/credentials.js";
import { processingDisclosure } from "../modules/processing/config.js";
import { executeProcessing } from "../modules/processing/execute.js";
import { HTTPProcessingModels } from "../modules/processing/provider.js";

Object.assign(process.env, nodeEnvironment());
const config = configFromEnv(process.env),
  { database, pool } = connect(),
  sources = new PostgresSources(database);
const repo = new PostgresRepository(database),
  processing = repo.processing;
const controller = new AbortController(),
  running = new Set<Promise<void>>();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => controller.abort());
let lastSchedule = 0;
try {
  while (!controller.signal.aborted) {
    try {
      if (Date.now() - lastSchedule >= 10_000) {
        await sources.scheduleDue();
        if (config.processing) await processing.scheduleAll();
        lastSchedule = Date.now();
      }
      if (running.size < 4) {
        const claim = await sources.claimNext();
        if (claim) {
          const task = executeClaim(
            sources,
            claim,
            pluginRegistry,
            pluginConfiguration(config),
            controller.signal,
          )
            .catch(() => console.error("Collector storage unavailable"))
            .finally(() => running.delete(task));
          running.add(task);
          continue;
        }
        if (config.processing) {
          const claim = await processing.claimNext(async (owner) => {
            const current = await effectiveProcessing(repo, config, owner),
              ai = await processingDisclosure(current);
            return {
              fingerprint: ai?.fingerprint ?? "unavailable",
              dailyLimit: current?.daily_call_limit ?? 0,
            };
          });
          if (claim) {
            const current = await effectiveProcessing(
              repo,
              config,
              claim.owner,
            );
            if (!current) continue;
            const task = executeProcessing(
              guardedProcessing(repo, config),
              claim,
              current,
              new HTTPProcessingModels(current),
              controller.signal,
            )
              .catch(() => console.error("Organization storage unavailable"))
              .finally(() => running.delete(task));
            running.add(task);
            continue;
          }
        }
      }
    } catch {
      console.error("Collector scheduling unavailable");
    }
    await delay(1000, undefined, { signal: controller.signal }).catch(() => {});
  }
} finally {
  await Promise.allSettled(running);
  await pool.end();
}
