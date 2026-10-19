// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedDesignSystem
import MeltedCore

/// Native grouped settings, matching System Settings rows, on the app's canvas color.
struct SettingsView: View {
    @ObservedObject var model: WorkspaceModel
    @Environment(\.colorScheme) private var scheme
    @State private var showingSources = false
    @State private var settingsCatalog: ServerSettingsCatalog?
    @State private var settingsError: String?
    @State private var selectedCredentials: ServerCredentialSection?
    @State private var selectedSettings: ServerSettingsSection?
    @State private var settingsLoading = false
    @State private var settingsLoadID = UUID()
    private var settingsIdentity: String { "\(model.connected)|\(model.serverAddress)|\(model.discovery?.serverId ?? "")" }

    var body: some View {
        Form {
            AppearanceSettings()
            if model.connected {
                Section {
                    Button { showingSources = true } label: {
                        HStack { Text("来源与插件"); Spacer(); Image(systemName: "chevron.right").foregroundStyle(.secondary) }
                    }.buttonStyle(.plain)
                } header: { Text("内容") }
                if let version = model.discovery?.capabilities?.serverSettings {
                    Section {
                        if version != 1 { Text("服务器设置需要更新客户端").foregroundStyle(.secondary) }
                        else {
                            if settingsLoading { ProgressView("正在加载服务器设置") }
                            ForEach(settingsCatalog?.sections ?? []) { section in
                                Button { selectedSettings = section } label: {
                                    HStack { Text(section.title); Spacer(); Text(section.supported ? "" : "需要更新客户端").foregroundStyle(.secondary); Image(systemName: "chevron.right").foregroundStyle(.secondary) }
                                }.buttonStyle(.plain).disabled(!section.supported)
                            }
                            ForEach(settingsCatalog?.credentials ?? []) { section in
                                Button { selectedCredentials = section } label: {
                                    HStack { Text(section.title); Spacer(); Text(section.supported ? "" : "需要更新客户端").foregroundStyle(.secondary); Image(systemName: "chevron.right").foregroundStyle(.secondary) }
                                }.buttonStyle(.plain).disabled(!section.supported)
                            }
                            if let settingsError {
                                Text(settingsError).foregroundStyle(.secondary)
                                Button("重新加载服务器设置") { Task { await loadSettings() } }
                            }
                        }
                    } header: { Text("服务器设置") }
                }
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
        .sheet(item: $selectedSettings, onDismiss: { Task { await loadSettings() } }) { section in
            if let client = model.serverSettingsClient { ServerSettingsPanel(client: client, section: section) }
        }
        .sheet(item: $selectedCredentials, onDismiss: { Task { await loadSettings() } }) { section in
            if let client = model.serverSettingsClient as? any ServerCredentialsClient { ServerCredentialsPanel(client: client, section: section) }
        }
        .task(id: settingsIdentity) { settingsCatalog = nil; selectedSettings = nil; selectedCredentials = nil; await loadSettings() }
        .onChange(of: model.connected) { _, connected in if !connected { showingSources = false; selectedSettings = nil; selectedCredentials = nil; settingsCatalog = nil; settingsError = nil; settingsLoadID = UUID(); settingsLoading = false } }
    }
    @MainActor private func loadSettings() async {
        let loadID = UUID(); settingsLoadID = loadID
        settingsError = nil
        guard model.discovery?.capabilities?.serverSettings == 1, let client = model.serverSettingsClient else { return }
        let identity = settingsIdentity
        settingsLoading = true
        defer { if settingsLoadID == loadID { settingsLoading = false } }
        do {
            let catalog = try await client.serverSettingsCatalog()
            try Task.checkCancellation()
            guard identity == settingsIdentity, settingsLoadID == loadID else { return }
            settingsCatalog = catalog
        } catch is CancellationError {} catch { if identity == settingsIdentity, settingsLoadID == loadID { settingsError = ServerSettingsModel.message(error) } }
    }
}
