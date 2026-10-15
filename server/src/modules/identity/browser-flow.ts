// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
export type BrowserFlow = {
  id: string;
  client_state: string;
  client_challenge: string;
  redirect_uri: string;
  provider_state: string;
  nonce: string;
  provider_verifier: string;
  issuer: string;
};
