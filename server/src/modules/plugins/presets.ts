// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { configurationSchema, formSchema } from "./dsl.js";

export const presetQuerySchema = z
  .object({
    query: z.string().max(200).default(""),
    cursor: z.string().max(300).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(40),
  })
  .strict();
export const presetSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{64}$/),
    label: z.string().min(1).max(300),
    group: z.string().min(1).max(200),
    summary: z.string().max(2048),
    description: z.string().max(16000).optional(),
    requirements: z.array(z.string().max(200)).max(40),
    allowed: z.boolean(),
    input: formSchema,
  })
  .strict();
export const presetPageSchema = z
  .object({
    presets: z.array(presetSchema).max(50),
    total: z.number().int().min(0).max(20000),
    next_cursor: z.string().max(300).nullable(),
  })
  .strict();
export const presetResolutionSchema = z
  .object({
    label: z.string().min(1).max(200),
    configuration: configurationSchema,
  })
  .strict();
export const presetInputSchema = z
  .object({ input: configurationSchema })
  .strict();
export type PluginPreset = z.infer<typeof presetSchema>;
export type PresetQuery = z.infer<typeof presetQuerySchema>;
export interface PresetProvider {
  list(query: PresetQuery): Promise<z.infer<typeof presetPageSchema>>;
  resolve(
    id: string,
    input: z.infer<typeof configurationSchema>,
  ): Promise<z.infer<typeof presetResolutionSchema>>;
}
