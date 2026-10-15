// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { Config } from "../../config/schema.js";
import type { Principal, Session } from "./types.js";

export interface IdentityRepository {
  challenge(
    config: Config,
    body: unknown,
  ): Promise<{ challenge_id: string; message: string; expires_in: number }>;
  keySession(config: Config, body: unknown): Promise<Session>;
  managedSession(owner: string): Promise<Session>;
  authenticate(authorization?: string): Promise<Principal>;
  refresh(body: unknown): Promise<Session>;
  logout(principal: Principal): Promise<void>;
}
