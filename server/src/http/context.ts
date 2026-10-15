// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { type Config } from "../config/schema.js";
import type { Principal } from "../modules/identity/types.js";
import type { Repository } from "../storage/repository.js";

export type AppEnv = {
  Bindings: {
    repository: Repository;
    config: Config;
    remoteIP: string;
    developmentSamples: boolean;
  };
  Variables: { principal: Principal; requestID: string };
};
