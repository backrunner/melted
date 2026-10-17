// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";

export const manifestSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9.-]{2,99}$/),
    version: z.string().min(1),
    targets: z.array(z.enum(["node", "cloudflare"])).min(1),
    runtime: z.enum([
      "builtin",
      "node-process",
      "worker-module",
      "remote-https",
      "wasm",
    ]),
    capabilities: z.array(
      z.enum([
        "https",
        "websocket",
        "filesystem",
        "subprocess",
        "native-addon",
        "raw-tcp",
        "persistent-process",
        "r2",
        "queues",
      ]),
    ),
    required_bindings: z
      .array(z.string().regex(/^[A-Z][A-Z0-9_]*$/))
      .default([]),
    endpoint: z.url().optional(),
  })
  .strict();
export type Manifest = z.infer<typeof manifestSchema>;
export const pluginSettingsSchema = z
  .object({
    plugins: z.array(
      z.object({ enabled: z.boolean(), manifest: manifestSchema }).strict(),
    ),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.plugins.map((p) => p.manifest.id)).size ===
      value.plugins.length,
    "Duplicate plugin ID",
  );
export function checkCompatibility(
  value: unknown,
  target: "node" | "cloudflare",
  bindings: string[] = [],
): string[] {
  const parsed = manifestSchema.safeParse(value);
  if (!parsed.success) return ["invalid_manifest"];
  const m = parsed.data,
    issues: string[] = [];
  if (!m.targets.includes(target)) issues.push("unsupported_target");
  if (target === "cloudflare") {
    if (m.runtime === "node-process") issues.push("node_process_unavailable");
    for (const capability of m.capabilities)
      if (
        [
          "filesystem",
          "subprocess",
          "native-addon",
          "raw-tcp",
          "persistent-process",
        ].includes(capability)
      )
        issues.push("unsupported_capability:" + capability);
  }
  if (m.runtime === "remote-https") {
    if (!m.endpoint) issues.push("missing_endpoint");
    else {
      const url = new URL(m.endpoint);
      if (url.protocol !== "https:" || url.username || url.password || url.hash)
        issues.push("invalid_endpoint");
    }
  }
  for (const required of m.required_bindings)
    if (!bindings.includes(required))
      issues.push("missing_binding:" + required);
  return issues;
}
