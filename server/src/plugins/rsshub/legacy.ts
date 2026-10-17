// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { validRoute } from "./routes.js";
import { isPortableText } from "../../shared/text.js";
import { parse } from "../../shared/validation.js";
import type { Source } from "../../modules/sources/types.js";
const fields = {
  name: z.string().trim().min(1).max(200).refine(isPortableText),
  route: z.string().max(2048).refine(validRoute),
  interval_seconds: z.number().int().min(300).max(86400),
  enabled: z.boolean(),
};
const legacy = z
  .object({
    ...fields,
    interval_seconds: fields.interval_seconds.default(900),
    enabled: fields.enabled.default(true),
  })
  .strict();
export function legacyCreate(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    !("route" in value) ||
    "plugin" in value
  )
    return null;
  const old = parse(legacy, value);
  return {
    input: {
      name: old.name,
      enabled: old.enabled,
      interval_seconds: old.interval_seconds,
      plugin: "rsshub",
      config_version: 1,
      configuration: { route: old.route },
    },
    fingerprintInput: old,
  };
}
export function legacyPatch(value: unknown, source: Source) {
  if (!value || typeof value !== "object" || !("route" in value)) return value;
  const old = parse(
    z
      .object(fields)
      .strict()
      .partial()
      .extend({ expected_version: z.number().int().positive() }),
    value,
  );
  if (source.plugin !== "rsshub") return value;
  const { route, ...common } = old;
  return { ...common, configuration: { route }, config_version: 1 };
}
export function legacyProjection(source: Source) {
  return source.plugin === "rsshub"
    ? { route: source.configuration.route }
    : {};
}
