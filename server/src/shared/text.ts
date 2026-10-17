// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// PostgreSQL JSONB cannot represent NUL or lone UTF-16 surrogates. Apply the
// same boundary before either storage adapter receives a normalized record.
export function isPortableText(value: string): boolean {
  return !/[\u0000\uD800-\uDFFF]/u.test(value);
}
export function hasPortableText(value: unknown): boolean {
  if (typeof value === "string") return isPortableText(value);
  if (Array.isArray(value)) return value.every(hasPortableText);
  if (value && typeof value === "object")
    return Object.values(value).every(hasPortableText);
  return true;
}
