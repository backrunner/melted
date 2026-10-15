// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedDesignSystem

struct SettingsView: View {
    @ObservedObject var model: WorkspaceModel
    @Environment(\.colorScheme) private var scheme

    private var palette: MeltedPalette { MeltedPalette(scheme) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                AppearanceSettings()
                AccountSettings(model: model)
                AboutSettings()
            }
            .padding(28)
        }
        .background(palette.canvas)
        .frame(width: 640, height: 580)
        .navigationTitle("设置")
    }

}
