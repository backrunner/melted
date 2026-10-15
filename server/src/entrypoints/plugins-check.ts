import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  checkCompatibility,
  manifestSchema,
} from "../modules/plugins/compatibility.js";

const target = process.argv[2] ?? "node";
if (target !== "node" && target !== "cloudflare")
  throw new Error("Target must be node or cloudflare");
const config = z
  .object({
    plugins: z.array(
      z.object({ enabled: z.boolean(), manifest: manifestSchema }).strict(),
    ),
  })
  .strict()
  .parse(
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
for (const p of config.plugins) {
  if (!p.enabled) continue;
  failures.push(
    ...checkCompatibility(p.manifest, target, bindings).map(
      (issue) => `${p.manifest.id}: ${issue}`,
    ),
  );
  // Compatibility is a contract check, not an execution engine or a sandbox.
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
  if (worker.vars.DEVELOPMENT_SAMPLES === "true")
    failures.push("Development samples cannot be enabled in production");
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Plugin preflight passed (${target}; ${config.plugins.filter((p) => p.enabled).length} enabled)`,
  );
