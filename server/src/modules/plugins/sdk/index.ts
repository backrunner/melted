// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
/** Public in-repository SDK surface. Plugins do not import HTTP handlers or storage. */
export {
  BaseCollectorPlugin,
  PluginSettingsError,
  type CollectorContext,
  type CollectorDefinition,
} from "./collector.js";
export {
  requestBytes,
  requestJSON,
  retryAfter,
  type ByteResponse,
  type JSONResponse,
  type RequestOptions,
} from "./http.js";
export { collectionResult } from "./result.js";
export { openWebSocket } from "./websocket.js";
export {
  CollectorError,
  type CollectorPlugin,
  type ConfiguredCollector,
  type Destination,
} from "../definition.js";
export {
  descriptorSchema,
  validateSettings,
  type Configuration,
  type PluginDescriptor,
} from "../dsl.js";
export type {
  RawContent,
  PollResult,
  Checkpoint,
} from "../../sources/types.js";

export type { PresetProvider, PresetQuery, PluginPreset } from "../presets.js";
