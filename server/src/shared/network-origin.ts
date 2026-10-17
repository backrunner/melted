// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { z } from "zod";
import { isHTTPURL } from "./url.js";
export const originSchema = z
  .string()
  .max(200)
  .refine((v) => {
    if (!isHTTPURL(v)) return false;
    const u = new URL(v);
    return u.pathname === "/" && !u.search;
  })
  .transform((v) => new URL(v).origin);
export function publicOrigin(v: string) {
  const u = new URL(v);
  return (
    u.protocol === "https:" &&
    !u.port &&
    !/^[\d.]+$/.test(u.hostname) &&
    !u.hostname.includes(":") &&
    u.hostname.includes(".") &&
    !/(?:\.|^)(?:localhost|local|internal|home|lan|test|invalid)\.?$/i.test(
      u.hostname,
    ) &&
    !u.hostname.endsWith(".")
  );
}
