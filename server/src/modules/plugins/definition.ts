// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { PresetProvider } from "./presets.js";
import type { Manifest } from "./compatibility.js";
import type { Configuration, PluginDescriptor } from "./dsl.js";
import type { Source, PollResult, PollFailure } from "../sources/types.js";

export class CollectorError extends Error {
  constructor(readonly failure: PollFailure) {
    super(failure.code);
  }
}
export type Destination = {
  id: string;
  origin: string;
  purpose: "public_feed_collection";
  data_categories: string[];
};
/** Trusted, installed modules. No repository, account credentials or UI code is exposed. */
export interface CollectorPlugin {
  manifest: Manifest;
  descriptor: PluginDescriptor;
  configure(operator: unknown): ConfiguredCollector;
  deploymentErrors(operator: unknown, target: "node" | "cloudflare"): string[];
}
export interface ConfiguredCollector {
  descriptor: PluginDescriptor;
  presets?: PresetProvider;
  destinations: Destination[];
  validate(configuration: Configuration): Configuration;
  poll(source: Source, signal?: AbortSignal): Promise<PollResult>;
}
