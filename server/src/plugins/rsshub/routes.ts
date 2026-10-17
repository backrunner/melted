// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { Problem } from "../../shared/problem.js";
import { isPortableText } from "../../shared/text.js";
import type { RSSHubConfig } from "./config.js";

export function validRoute(value: string): boolean {
  if (
    !/^\/[a-zA-Z0-9]/.test(value) ||
    !isPortableText(value) ||
    /[\s?#\\]/.test(value) ||
    value.includes("//") ||
    /%25/i.test(value)
  )
    return false;
  try {
    const decoded = decodeURIComponent(value);
    return (
      isPortableText(decoded) &&
      !/[\u0000-\u001f\u007f]/.test(decoded) &&
      !/[?#\\]/.test(decoded) &&
      !decoded.includes("//") &&
      !decoded.split("/").some((s) => s === "." || s === "..")
    );
  } catch {
    return false;
  }
}
export function authorizeRoute(
  config: RSSHubConfig | undefined,
  route: string,
) {
  if (!config) throw new Problem(503, "collector_unconfigured");
  if (
    !validRoute(route) ||
    !config.allowed_routes.some(
      (prefix) => route === prefix || route.startsWith(prefix + "/"),
    )
  )
    throw new Problem(403, "route_not_allowed");
}
