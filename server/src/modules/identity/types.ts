// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
export type Session = {
  account_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
};
export type Principal = { owner: string; family: string };
