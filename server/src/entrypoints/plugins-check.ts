// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { executableBuiltin } from "../modules/plugins/registry.js";
import { rsshubConfigSchema } from "../modules/collectors/config.js";
import { readFile } from "node:fs/promises";
import {
  checkCompatibility,
  pluginSettingsSchema,
} from "../modules/plugins/compatibility.js";

const target = process.argv[2] ?? "node";
if (target !== "node" && target !== "cloudflare")
  throw new Error("Target must be node or cloudflare");
const config = pluginSettingsSchema.parse(
  JSON.parse(
    await readFile(new URL("../../plugins.json", import.meta.url), "utf8"),
  ),
);
const worker = JSON.parse(
  await readFile(new URL("../../wrangler.jsonc", import.meta.url), "utf8"),
);
const bindings = (worker.durable_objects?.bindings ?? []).map(
  (b: { name: string }) => b.name,
);
const failures: string[] = [];
if (
  target === "cloudflare" &&
  config.plugins.some((p) => p.enabled && executableBuiltin(p.manifest)) &&
  !(worker.queues?.producers ?? []).some(
    (p: { binding: string }) => p.binding === "COLLECTION_QUEUE",
  )
)
  failures.push("rsshub: missing_binding:COLLECTION_QUEUE");
for (const p of config.plugins) {
  if (!p.enabled) continue;
  failures.push(
    ...checkCompatibility(p.manifest, target, bindings).map(
      (issue) => `${p.manifest.id}: ${issue}`,
    ),
  );
  // Compatibility is a contract check, not an execution engine or a sandbox.
  if (!executableBuiltin(p.manifest))
    failures.push(`${p.manifest.id}: plugin_execution_not_implemented`);
}
if (target === "cloudflare" && process.argv.includes("--deployment")) {
  if (
    worker.vars.PUBLIC_ORIGIN.includes("replace.") ||
    worker.vars.MELTED_SERVER_ID.startsWith("replace-")
  )
    failures.push(
      "Configure stable MELTED_SERVER_ID and PUBLIC_ORIGIN before deployment",
    );
  if (!worker.vars.PUBLIC_ORIGIN.startsWith("https://"))
    failures.push("Production PUBLIC_ORIGIN requires HTTPS");
  if (worker.vars.RSSHUB_CONFIG) {
    try {
      const rsshub = rsshubConfigSchema.parse(
        JSON.parse(worker.vars.RSSHUB_CONFIG),
      );
      if (rsshub.allow_private || !rsshub.base_url.startsWith("https://"))
        failures.push(
          "Production Cloudflare RSSHub requires a public HTTPS instance",
        );
    } catch {
      failures.push("Invalid RSSHUB_CONFIG in production Worker vars");
    }
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Plugin preflight passed (${target}; ${config.plugins.filter((p) => p.enabled).length} enabled)`,
  );
