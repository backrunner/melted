// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import settings from "../../plugins.json" with { type: "json" };
import { PluginRegistry } from "../modules/plugins/registry.js";
import type { Manifest } from "../modules/plugins/compatibility.js";
import { rsshubPlugin } from "./rsshub/plugin.js";
import { feedPlugin } from "./feed/plugin.js";
import { blueskyPlugin } from "./bluesky/plugin.js";
import { fediversePlugin } from "./fediverse/plugin.js";
import { nostrPlugin } from "./nostr/plugin.js";

// The composition root is the only file changed to register another installed module.
export const installedPlugins = [
  rsshubPlugin,
  feedPlugin,
  blueskyPlugin,
  fediversePlugin,
  nostrPlugin,
];
export const pluginRegistry = new PluginRegistry(installedPlugins, settings);
export function executableBuiltin(manifest: Manifest) {
  return pluginRegistry.matches(manifest);
}
export function collectorEnabled(value: unknown = settings) {
  try {
    return new PluginRegistry(installedPlugins, value)
      .catalog({})
      .plugins.some((p) => p.unavailable_reason === "collector_unconfigured");
  } catch {
    return false;
  }
}
export function pluginConfiguration(config: {
  plugins?: Record<string, unknown>;
}): Record<string, unknown> {
  return config.plugins ?? {};
}
