// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
// Operator owns the destination and credentials. Account settings only choose a topic.
export const operatorSchema = z
  .object({
    base_url: z
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          url.pathname === "/" &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        );
      })
      .transform((value) => new URL(value).origin),
    allowed_topics: z
      .array(z.string().regex(/^[a-z][a-z0-9-]{0,49}$/))
      .min(1)
      .max(50),
    token: z.string().min(1).max(1024).optional(),
  })
  .strict();
export const settingsSchema = z
  .object({ topic: z.string().regex(/^[a-z][a-z0-9-]{0,49}$/) })
  .strict();
export type Operator = z.infer<typeof operatorSchema>;
export type Settings = z.infer<typeof settingsSchema>;
