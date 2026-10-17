// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { validRoute } from "./routes.js";

// This is operator configuration, never an account-supplied fetch destination.
export const rsshubConfigSchema = z
  .object({
    base_url: z
      .url()
      .refine((v) => {
        const u = new URL(v);
        return (
          ["https:", "http:"].includes(u.protocol) &&
          u.pathname === "/" &&
          !u.search &&
          !u.hash &&
          !u.username &&
          !u.password
        );
      })
      .transform((v) => new URL(v).origin),
    allowed_routes: z
      .array(z.string().regex(/^\/[a-zA-Z0-9][a-zA-Z0-9/_-]*$/))
      .min(1)
      .max(100),
    allow_private: z.boolean().default(false),
    access_key: z.string().min(1).max(512).optional(),
    route_suggestions: z
      .array(
        z
          .object({
            value: z.string().max(2048).refine(validRoute),
            label: z.string().min(1).max(200),
            group: z.string().min(1).max(100).optional(),
            description: z.string().min(1).max(500).optional(),
          })
          .strict(),
      )
      .max(50)
      .optional(),
  })
  .strict()
  .refine(
    (c) =>
      c.allow_private ||
      (new URL(c.base_url).protocol === "https:" &&
        !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(
          new URL(c.base_url).hostname,
        )),
    "Private/HTTP RSSHub requires explicit operator authorization",
  );
export type RSSHubConfig = z.infer<typeof rsshubConfigSchema>;
