// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { SourceRepository } from "../modules/sources/types.js";
import type { IdentityRepository } from "../modules/identity/repository.js";
import type { BrowserRepository } from "../modules/identity/browser-repository.js";
import type { ContentRepository } from "../modules/content/repository.js";
import type { SyncRepository } from "../modules/sync/repository.js";

export interface Repository
  extends
    IdentityRepository,
    BrowserRepository,
    ContentRepository,
    SyncRepository {
  readonly sources: SourceRepository;
  health(): Promise<void>;
  limit(key: string, maximum: number): Promise<void>;
  maintenance(): Promise<void>;
}
