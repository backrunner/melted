// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
/** Syntax only. Network authorization belongs to the operator/plugin policy. */
export function isHTTPURL(value: string): boolean {
  if (
    !/^https?:\/\//i.test(value) ||
    /[\s\\\u0000-\u001f\u007f]/u.test(value) ||
    /%(?![a-f\d]{2})/i.test(value)
  )
    return false;
  try {
    const url = new URL(value);
    return Boolean(
      url.hostname &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !value.includes("#"),
    );
  } catch {
    return false;
  }
}
