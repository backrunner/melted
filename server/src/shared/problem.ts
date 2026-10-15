// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
export class Problem extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 422 | 429 | 503,
    public code: string,
  ) {
    super(code);
  }
}
export const invalid = () => new Problem(400, "invalid_request");
export const unauthorized = () => new Problem(401, "unauthorized");
