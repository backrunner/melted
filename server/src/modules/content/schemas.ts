// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";

export const stateSchema = z
  .object({
    read: z.boolean(),
    saved: z.boolean(),
    hidden: z.boolean(),
    version: z.number().int().positive(),
  })
  .strict();
export const termSchema = z
  .object({
    id: z.string().min(1).max(128),
    kind: z.enum(["category", "tag", "subject"]),
    name: z.string().min(1).max(200),
  })
  .strict();
export const briefingSchema = z
  .object({
    id: z.string().min(1).max(128),
    schema_version: z.literal(1),
    revision: z.number().int().positive(),
    kind: z.string(),
    content_kind: z.string(),
    title: z.string().min(1).max(1000),
    summary: z.string().max(5000),
    markdown: z.string().max(200000),
    updated_at: z.iso.datetime({ offset: true }),
    published_at: z.iso.datetime({ offset: true }).nullable(),
    category_id: z.string().nullable(),
    tag_ids: z.array(z.string()).max(50),
    subject_ids: z.array(z.string()).max(50),
    evidence_status: z.string(),
    evidence: z
      .array(
        z.object({
          title: z.string(),
          url: z.string().optional(),
          excerpt: z.string(),
        }),
      )
      .max(100),
    state: stateSchema,
    is_demo: z.boolean(),
  })
  .strict();
export const fixtureSchema = z
  .object({ terms: z.array(termSchema), documents: z.array(briefingSchema) })
  .strict();
export type Briefing = z.infer<typeof briefingSchema>;
export type Fixture = z.infer<typeof fixtureSchema>;
export const mutationSchema = stateSchema
  .omit({ version: true })
  .extend({
    expected_version: z.number().int().positive(),
    mutation_id: z.string().min(8).max(128),
  })
  .strict();
export type Mutation = z.infer<typeof mutationSchema>;
