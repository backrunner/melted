// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
export interface CloudBindings {
  COLLECTION_QUEUE?: Queue<{ owner: string; run_id: string }>;
  PLUGIN_CONFIG?: string;
  RSSHUB_ACCESS_KEY?: string;
  ACCOUNTS: DurableObjectNamespace;
  CONTROL: DurableObjectNamespace;
  MELTED_SERVER_ID: string;
  MELTED_OPERATOR: string;
  PUBLIC_ORIGIN: string;
  REGISTRATION_MODE?: string;
  AUTH_CONFIG?: string;
  OIDC_ISSUER?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
}
