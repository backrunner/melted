// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import settings from "../../../plugins.json" with { type: "json" };
import { rsshubCollector } from "../collectors/rsshub.js";
import { pluginSettingsSchema, type Manifest } from "./compatibility.js";

export function executableBuiltin(manifest: Manifest) {
  return (
    manifest.runtime === "builtin" &&
    manifest.id === rsshubCollector.id &&
    manifest.version === rsshubCollector.version &&
    manifest.targets.includes("node") &&
    manifest.targets.includes("cloudflare") &&
    manifest.targets.length === 2 &&
    manifest.capabilities.length === 1 &&
    manifest.capabilities.every((v) => v === "https") &&
    !manifest.endpoint &&
    manifest.required_bindings.length === 0
  );
}
export function collectorEnabled(value: unknown = settings) {
  const parsed = pluginSettingsSchema.safeParse(value);
  if (!parsed.success) return false;
  const enabled = parsed.data.plugins.filter((p) => p.enabled);
  return (
    enabled.length === 1 && enabled.every((p) => executableBuiltin(p.manifest))
  );
}
