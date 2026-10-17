// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct SourceEditor: View {
    @ObservedObject var model: SourceSettingsModel
    let plugin: PluginDescriptor
    let sourceForm: PluginForm
    let source: PluginSource?
    @State private var common: PluginConfiguration
    @State private var configuration: PluginConfiguration
    @State private var requestID = UUID().uuidString
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    init(model: SourceSettingsModel, plugin: PluginDescriptor, sourceForm: PluginForm, source: PluginSource?) {
        self.model = model; self.plugin = plugin; self.sourceForm = sourceForm; self.source = source
        _common = State(initialValue: source?.commonSettings ?? sourceForm.defaults)
        _configuration = State(initialValue: source?.configuration ?? plugin.form.defaults)
    }
    private var validation: String? { sourceForm.error(in: common) ?? plugin.form.error(in: configuration) }
    var body: some View {
        VStack(spacing: 0) {
            Form {
                Section { PluginFields(form: sourceForm, values: $common) } header: { Text(source == nil ? "添加来源" : "编辑来源") }
                Section { PluginFields(form: plugin.form, values: $configuration) } header: { Text(plugin.title) } footer: { Text(plugin.description).frame(maxWidth: .infinity, alignment: .leading) }
                if let error = model.error { Section { Text(error).foregroundStyle(MeltedPalette(scheme).danger).textSelection(.enabled) } }
            }
            .formStyle(.grouped).scrollContentBackground(.hidden)
            HStack {
                Button("取消") { dismiss() }.keyboardShortcut(.cancelAction)
                Spacer()
                if let validation { Text(validation).font(.caption).foregroundStyle(.secondary) }
                Button("保存") { Task { if await model.save(source, plugin: plugin, common: common, configuration: configuration, requestID: requestID) { dismiss() } } }
                    .keyboardShortcut(.defaultAction).disabled(validation != nil || model.busy)
            }.padding()
        }
        .background(MeltedPalette(scheme).canvas).frame(width: 580, height: 480)
        .disabled(model.busy).interactiveDismissDisabled(model.busy)
        .onChange(of: common) { _, _ in requestID = UUID().uuidString; model.error = nil }
        .onChange(of: configuration) { _, _ in requestID = UUID().uuidString; model.error = nil }
    }
}

struct PluginActionPanel: View {
    @ObservedObject var model: SourceSettingsModel
    let plugin: PluginDescriptor
    let source: PluginSource
    let action: PluginAction
    @State private var input: PluginConfiguration
    @State private var requestID = UUID().uuidString
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    init(model: SourceSettingsModel, plugin: PluginDescriptor, source: PluginSource, action: PluginAction) {
        self.model = model; self.plugin = plugin; self.source = source; self.action = action
        _input = State(initialValue: action.input.defaults)
    }
    var body: some View {
        VStack(spacing: 0) {
            Form {
                Section {
                    LabeledContent("来源", value: source.name)
                    Text(action.description).foregroundStyle(.secondary)
                    PluginFields(form: action.input, values: $input)
                    if let confirmation = action.confirmation { Text(confirmation).fontWeight(.medium) }
                } header: { Text(action.label) }
                if let error = model.error { Text(error).foregroundStyle(MeltedPalette(scheme).danger) }
            }.formStyle(.grouped).scrollContentBackground(.hidden)
            HStack {
                Button("取消") { dismiss() }.keyboardShortcut(.cancelAction)
                Spacer()
                Button(action.label) { Task { if await model.perform(action, source: source, plugin: plugin, input: input, requestID: requestID) { dismiss() } } }
                    .disabled(model.busy || action.input.error(in: input) != nil).keyboardShortcut(.defaultAction)
            }.padding()
        }
        .background(MeltedPalette(scheme).canvas).frame(width: 540, height: action.input.fields.isEmpty ? 280 : 440)
        .disabled(model.busy).interactiveDismissDisabled(model.busy)
        .onChange(of: input) { _, _ in requestID = UUID().uuidString }
    }
}
