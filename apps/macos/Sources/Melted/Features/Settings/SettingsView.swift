// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedDesignSystem

/// Native grouped settings, matching System Settings rows, on the app's canvas color.
struct SettingsView: View {
    @ObservedObject var model: WorkspaceModel
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Form {
            AppearanceSettings()
            AccountSettings(model: model)
            AboutSettings()
        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
        .background(MeltedPalette(scheme).canvas)
        .tint(MeltedPalette(scheme).accent)
        .frame(width: 520)
        .frame(minHeight: 460, idealHeight: 540)
        .navigationTitle("设置")
    }
}
