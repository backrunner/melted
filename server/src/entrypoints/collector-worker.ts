// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { pluginRegistry, pluginConfiguration } from "../plugins/index.js";
import { setTimeout as delay } from "node:timers/promises";
import { configFromEnv } from "../config/schema.js";
import { nodeEnvironment } from "../config/node-loader.js";
import { connect } from "../storage/postgres/connection.js";
import { PostgresSources } from "../storage/postgres/sources/repository.js";
import { executeClaim } from "../modules/jobs/execute.js";

Object.assign(process.env, nodeEnvironment());
const config = configFromEnv(process.env),
  { database, pool } = connect(),
  sources = new PostgresSources(database);
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
