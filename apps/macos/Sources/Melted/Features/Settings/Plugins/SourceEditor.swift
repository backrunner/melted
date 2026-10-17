// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

/// One entry point for suggested subscriptions, manual creation and editing.
/// Suggestions and fields remain driven by the plugin descriptor.
struct SourceEditor: View {
    private enum Entry: Hashable { case suggestions, manual }
    @ObservedObject var model: SourceSettingsModel
    let plugin: PluginDescriptor
    let sourceForm: PluginForm
    let source: PluginSource?
    @State private var entry: Entry
    @State private var common: PluginConfiguration
    @State private var configuration: PluginConfiguration
    @State private var requestID = UUID().uuidString
    @State private var suggestedName: String?
    @State private var settingsExpanded = false
    @State private var selected: Set<SettingValue> = []
    @State private var drafts: [SettingValue: SourceBatchDraft] = [:]
    @State private var saved: Set<String> = []
    @State private var errors: [String: String] = [:]
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme

    init(model: SourceSettingsModel, plugin: PluginDescriptor, sourceForm: PluginForm, source: PluginSource?) {
        self.model = model; self.plugin = plugin; self.sourceForm = sourceForm; self.source = source
        _common = State(initialValue: source?.commonSettings ?? sourceForm.defaults)
        _configuration = State(initialValue: source?.configuration ?? plugin.form.defaults)
        let batch = plugin.collection.addFromSuggestions
        let hasSuggestions = batch.map { batch in plugin.form.fields.contains { $0.id == batch.field && $0.suggestions?.isEmpty == false } } ?? false
        _entry = State(initialValue: source == nil && hasSuggestions ? .suggestions : .manual)
    }
    private var palette: MeltedPalette { MeltedPalette(scheme) }
    private var batch: PluginCollection.Batch? { plugin.collection.addFromSuggestions }
    private var choices: [SettingSuggestion] { plugin.form.fields.first { $0.id == batch?.field }?.suggestions ?? [] }
    private var existingValues: Set<SettingValue> {
        guard let batch else { return [] }
        return Set(model.sources.filter { $0.plugin == plugin.id }.compactMap { $0.configuration[batch.field] })
    }
    private var choosing: Bool { source == nil && entry == .suggestions && batch != nil }
    private var submitted: Bool { !drafts.isEmpty }
    private var collectionForm: PluginForm { sourceForm.excluding(["name"]) }
    private var primaryForm: PluginForm {
        guard let batch else { return plugin.form }
        return plugin.form.excluding(Set(plugin.form.fields.filter { $0.id != batch.field }.map(\.id)))
    }
    private var additionalForm: PluginForm {
        plugin.form.excluding(Set(primaryForm.fields.map(\.id)))
    }
    private var validation: String? {
        if choosing, let batch {
            let fields = plugin.form.excluding([batch.field])
            return collectionForm.error(in: common.filter { $0.key != "name" })
                ?? fields.error(in: configuration.filter { $0.key != batch.field })
        }
        return plugin.form.error(in: configuration) ?? sourceForm.error(in: common)
    }
    private var submitLabel: String {
        if model.busy { return source == nil ? "正在添加" : "正在保存" }
        if choosing { return submitted ? "重试未完成项" : "添加所选订阅" }
        return source == nil ? "添加订阅" : "保存"
    }
    var body: some View {
        MeltedPanel(source == nil ? "添加订阅" : "编辑订阅", subtitle: plugin.title) {
            if model.busy { ProgressView().controlSize(.small) }
        } content: {
            VStack(spacing: 0) {
                if source == nil && !choices.isEmpty && batch != nil {
                    MeltedSegmentedPicker("添加方式", selection: $entry, options: [
                        .init(.suggestions, title: "选择来源"), .init(.manual, title: "手动填写")
                    ])
                    .disabled(submitted)
                    .padding(.horizontal, MeltedPanelMetrics.inset).padding(.top, MeltedReading.actionGap)
                }
                ScrollView {
                    editorContent
                }
            }
        } footer: {
            HStack(spacing: MeltedReading.actionGap) {
                Text(validation ?? (choosing ? submitted ? "已添加 \(saved.count) 个，未完成 \(errors.count) 个" : "已选 \(selected.count) 个订阅" : ""))
                    .font(.system(size: MeltedType.metadata)).foregroundStyle(palette.secondary).lineLimit(2)
                Spacer(minLength: 0)
                Button { dismiss() } label: { Text(submitted ? "完成" : "取消").frame(height: MeltedPanelMetrics.controlHeight) }
                    .buttonStyle(MeltedSecondaryButtonStyle()).keyboardShortcut(.cancelAction)
                if !submitted || !errors.isEmpty {
                    Button { Task { await submit() } } label: {
                        Text(submitLabel).frame(height: MeltedPanelMetrics.controlHeight)
                    }.buttonStyle(MeltedPrimaryButtonStyle()).keyboardShortcut(.defaultAction)
                        .disabled(validation != nil || model.busy || (choosing && selected.isEmpty))
                }
            }
        }
        .frame(width: MeltedPanelMetrics.editorWidth, height: MeltedPanelMetrics.height)
        .disabled(model.busy).interactiveDismissDisabled(model.busy)
        .onChange(of: common) { _, _ in requestID = UUID().uuidString; model.error = nil }
        .onChange(of: configuration) { _, _ in requestID = UUID().uuidString; model.error = nil }
        .onChange(of: entry) { _, _ in model.error = nil }
    }
    private var editorContent: some View {
        VStack(alignment: .leading, spacing: MeltedPanelMetrics.sectionGap) {
            if choosing, let batch {
                SourceSuggestionSelection(choices: choices, maximum: batch.maximum,
                    existing: existingValues,
                    selected: $selected, drafts: drafts, saved: saved, errors: errors)
            } else {
                PluginFields(form: sourceForm.excluding(Set(collectionForm.fields.map(\.id))), values: $common)
                PluginFields(form: primaryForm, values: $configuration) { suggestion in
                    let name = common["name"]?.text ?? ""
                    if source == nil && (name.isEmpty || name == suggestedName) {
                        common["name"] = .string(suggestion.label); suggestedName = suggestion.label
                    }
                }
            }
            Rectangle().fill(palette.separator).frame(height: MeltedPanelMetrics.ruleWidth)
            MeltedDisclosure(isExpanded: $settingsExpanded) {
                Text("采集设置").font(.system(size: MeltedType.control, weight: .medium))
                Text(settingsSummary).font(.system(size: MeltedType.metadata))
            } content: {
                PluginFields(form: additionalForm, values: $configuration).disabled(submitted)
                PluginFields(form: collectionForm, values: $common).disabled(submitted)
            }
            if let error = model.error { MeltedNotice(title: error) }
        }.padding(MeltedPanelMetrics.inset)
    }
    private var settingsSummary: String {
        if common["enabled"]?.bool == false { return "已暂停" }
        let value = common["interval_seconds"]
        return collectionForm.fields.first { $0.id == "interval_seconds" }?.suggestions?.first { $0.value == value }?.label ?? ""
    }
    private func submit() async {
        guard validation == nil else { return }
        guard choosing, let batch else {
            if await model.save(source, plugin: plugin, common: common, configuration: configuration, requestID: requestID) { dismiss() }
            return
        }
        if !submitted {
            for choice in choices where selected.contains(choice.value) {
                var settings = common, config = configuration
                settings["name"] = .string(choice.label); config[batch.field] = choice.value
                drafts[choice.value] = SourceBatchDraft(id: UUID().uuidString, common: settings, configuration: config)
            }
        }
        let pending = choices.compactMap { drafts[$0.value] }.filter { !saved.contains($0.id) }
        let result = await model.addBatch(pending, plugin: plugin)
        saved.formUnion(result.saved); errors = result.errors
        if errors.isEmpty { dismiss() }
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
