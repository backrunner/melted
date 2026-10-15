// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { BrowserFlow } from "./browser-flow.js";
import type { Session } from "./types.js";

export interface BrowserRepository {
  saveFlow(flow: BrowserFlow): Promise<void>;
  readFlow(id: string): Promise<BrowserFlow>;
  claimFlow(state: string): Promise<BrowserFlow>;
  completeFlow(
    flow: BrowserFlow,
    subject: string,
    code: string,
    registration: boolean,
  ): Promise<void>;
  exchangeCode(
    code: string,
    challenge: string,
    redirect: string,
  ): Promise<Session>;
}
