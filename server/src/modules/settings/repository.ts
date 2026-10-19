// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import type { SettingsState, SettingsMutation } from "./dsl.js";

export interface SettingsRepository {
  settings(owner: string, section: string): Promise<SettingsState>;
  saveSettings(
    owner: string,
    section: string,
    input: SettingsMutation,
    requestID: string,
  ): Promise<SettingsState>;
}
