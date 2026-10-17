// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { Problem } from "../../shared/problem.js";
import { isPortableText } from "../../shared/text.js";
import { configurationSchema, identifier } from "../plugins/dsl.js";
const fields = {
  name: z.string().trim().min(1).max(200).refine(isPortableText),
  configuration: configurationSchema,
  config_version: z.number().int().positive(),
  interval_seconds: z.number().int().min(300).max(86400),
  enabled: z.boolean(),
};
export const sourceInputSchema = z
  .object({
    ...fields,
    plugin: identifier,
    interval_seconds: fields.interval_seconds.default(900),
    enabled: fields.enabled.default(true),
  })
  .strict();
export const sourcePatchSchema = z
  .object(fields)
  .partial()
  .extend({ expected_version: z.number().int().positive() })
  .strict();
export function idempotencyKey(key: string | undefined): string {
  if (!key || !/^[A-Za-z0-9._:-]{1,128}$/.test(key))
    throw new Problem(400, "invalid_idempotency_key");
  return key;
}
export function pageLimit(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 100)
    throw new Problem(400, "invalid_limit");
  return value;
}
export function sourceReference(value: string): string {
  if (
    !value ||
    value.length > 128 ||
    !isPortableText(value) ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new Problem(400, "invalid_reference");
  return value;
}
