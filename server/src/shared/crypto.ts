// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
export const id = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
export const b64 = (data: ArrayBuffer | Uint8Array) =>
  Buffer.from(
    data instanceof Uint8Array ? data : new Uint8Array(data),
  ).toString("base64url");
export const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
export const hash = async (value: string) =>
  Buffer.from(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  ).toString("hex");
export const pkce = async (value: string) =>
  b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
