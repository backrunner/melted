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
    @State private var suggestedName: String?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    init(model: SourceSettingsModel, plugin: PluginDescriptor, sourceForm: PluginForm, source: PluginSource?) {
        self.model = model; self.plugin = plugin; self.sourceForm = sourceForm; self.source = source
        _common = State(initialValue: source?.commonSettings ?? sourceForm.defaults)
        _configuration = State(initialValue: source?.configuration ?? plugin.form.defaults)
    }
    private var validation: String? { plugin.form.error(in: configuration) ?? sourceForm.error(in: common) }
    var body: some View {
        MeltedPanel(source == nil ? "添加来源" : "编辑来源", subtitle: plugin.title) {
            if model.busy { ProgressView().controlSize(.small) }
        } content: {
            ScrollView {
                VStack(alignment: .leading, spacing: MeltedPanelMetrics.sectionGap) {
                    PluginFields(form: plugin.form, values: $configuration) { suggestion in
                        let name = common["name"]?.text ?? ""
                        if source == nil && (name.isEmpty || name == suggestedName) { common["name"] = .string(suggestion.label); suggestedName = suggestion.label }
                    }
                    Rectangle().fill(MeltedPalette(scheme).separator).frame(height: MeltedPanelMetrics.ruleWidth)
                    PluginFields(form: sourceForm, values: $common)
                    if let error = model.error { MeltedNotice(title: error) }
                }.padding(MeltedPanelMetrics.inset)
            }
        } footer: {
            HStack(spacing: MeltedReading.actionGap) {
                if let validation { Text(validation).font(.system(size: MeltedType.metadata)).foregroundStyle(MeltedPalette(scheme).secondary).lineLimit(2) }
                Spacer(minLength: 0)
                Button { dismiss() } label: { Text("取消").frame(height: MeltedPanelMetrics.controlHeight) }
                    .buttonStyle(MeltedSecondaryButtonStyle()).keyboardShortcut(.cancelAction)
                Button { Task { if await model.save(source, plugin: plugin, common: common, configuration: configuration, requestID: requestID) { dismiss() } } } label: {
                    Text(model.busy ? "正在保存" : "保存").frame(height: MeltedPanelMetrics.controlHeight)
                }.buttonStyle(MeltedPrimaryButtonStyle()).keyboardShortcut(.defaultAction).disabled(validation != nil || model.busy)
            }
        }
        .frame(width: MeltedPanelMetrics.editorWidth, height: MeltedPanelMetrics.height)
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
    init(model: SourceSettingsModel, plugin: PluginDescriptor, source: PluginSource, action: PluginAction) {
        self.model = model; self.plugin = plugin; self.source = source; self.action = action
        _input = State(initialValue: action.input.defaults)
    }
    var body: some View {
        MeltedPanel(action.label, subtitle: source.name) {
            if model.busy { ProgressView().controlSize(.small) }
        } content: {
            ScrollView {
                VStack(alignment: .leading, spacing: MeltedPanelMetrics.fieldGap) {
                    Text(action.description).fixedSize(horizontal: false, vertical: true)
                    PluginFields(form: action.input, values: $input)
                    if let confirmation = action.confirmation { Text(confirmation).fontWeight(.medium) }
                    if let error = model.error { MeltedNotice(title: error) }
                }.frame(maxWidth: .infinity, alignment: .leading).padding(MeltedPanelMetrics.inset)
            }
        } footer: {
            HStack(spacing: MeltedReading.actionGap) {
                Spacer()
                Button { dismiss() } label: { Text("取消").frame(height: MeltedPanelMetrics.controlHeight) }
                    .buttonStyle(MeltedSecondaryButtonStyle()).keyboardShortcut(.cancelAction)
                Button { Task { if await model.perform(action, source: source, plugin: plugin, input: input, requestID: requestID) { dismiss() } } } label: {
                    Text(action.label).frame(height: MeltedPanelMetrics.controlHeight)
                }.buttonStyle(MeltedPrimaryButtonStyle()).disabled(model.busy || action.input.error(in: input) != nil).keyboardShortcut(.defaultAction)
            }
        }
        .frame(width: MeltedPanelMetrics.editorWidth, height: MeltedPanelMetrics.suggestionHeight)
        .disabled(model.busy).interactiveDismissDisabled(model.busy)
        .onChange(of: input) { _, _ in requestID = UUID().uuidString }
    }
}
