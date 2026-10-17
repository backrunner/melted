// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedDesignSystem

/// Native grouped settings, matching System Settings rows, on the app's canvas color.
struct SettingsView: View {
    @ObservedObject var model: WorkspaceModel
    @Environment(\.colorScheme) private var scheme
    @State private var showingSources = false

    var body: some View {
        Form {
            AppearanceSettings()
            if model.connected {
                Section {
                    Button { showingSources = true } label: {
                        HStack { Text("来源与插件"); Spacer(); Image(systemName: "chevron.right").foregroundStyle(.secondary) }
                    }.buttonStyle(.plain)
                } header: { Text("内容") }
            }
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
        .sheet(isPresented: $showingSources) { if let client = model.pluginClient { SourcesPanel(client: client) } }
        .onChange(of: model.connected) { _, connected in if !connected { showingSources = false } }
    }
}
