// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
export type Change = { sequence: number; entity_id: string; kind: string };
export interface SyncRepository {
  changes(owner: string, after: number): Promise<Change[]>;
}
