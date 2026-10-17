// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem
import MeltedRendering

/// The server supplies all route metadata and resolves parameters; this view is plugin agnostic.
struct SourcePresetBrowser: View {
    @ObservedObject var model: SourceSettingsModel
    let plugin: PluginDescriptor
    let maximum: Int
    @Binding var choices: [SettingSuggestion]
    @Binding var selected: Set<SettingValue>
    let existing: Set<SettingValue>
    let drafts: [SettingValue: SourceBatchDraft]
    let saved: Set<String>
    let errors: [String: String]
    @StateObject private var catalog = PluginPresetCatalogModel()
    @State private var query = ""
    @State private var editing: PluginPreset?
    @FocusState private var focused: Bool
    @Environment(\.colorScheme) private var scheme
    private var palette: MeltedPalette { MeltedPalette(scheme) }
    var body: some View {
        VStack(alignment: .leading, spacing: MeltedReading.actionGap) {
            if !choices.isEmpty {
                Text("已选订阅").font(.system(size: MeltedType.metadata, weight: .medium)).foregroundStyle(palette.secondary)
                ForEach(choices) { choice in
                    let draft = drafts[choice.value]
                    HStack(alignment: .top, spacing: MeltedReading.actionGap) {
                        Toggle(isOn: Binding(get: { selected.contains(choice.value) }, set: { value in
                            if value { selected.insert(choice.value) } else { selected.remove(choice.value) }
                        })) {
                            VStack(alignment: .leading, spacing: MeltedPanelMetrics.detailGap) {
                                Text(choice.label).fontWeight(.medium)
                                Text(choice.value.text).font(.system(size: MeltedType.metadata)).foregroundStyle(palette.secondary).lineLimit(1).help(choice.value.text)
                                if let draft, let error = errors[draft.id] { Text(error).foregroundStyle(palette.warning) }
                            }
                        }.toggleStyle(MeltedCheckboxStyle())
                            .disabled(!drafts.isEmpty || (!selected.contains(choice.value) && selected.count >= maximum))
                        Spacer(minLength: 0)
                        if let draft, saved.contains(draft.id) { Text("已添加").foregroundStyle(palette.secondary) }
                    }.padding(.vertical, MeltedPanelMetrics.detailGap)
                }
            }
            if drafts.isEmpty {
                MeltedField("查找来源", isFocused: focused, height: MeltedConnection.controlHeight) {
                    HStack(spacing: MeltedReading.actionGap) {
                        Image(systemName: "magnifyingglass").foregroundStyle(palette.secondary)
                        TextField("搜索平台、来源或路由", text: $query).focused($focused)
                            .accessibilityLabel("搜索来源目录")
                    }
                }.padding(.top, choices.isEmpty ? 0 : MeltedReading.actionGap)
                HStack {
                    Text("\(catalog.total) 个可选路由").foregroundStyle(palette.secondary)
                    Spacer()
                    if catalog.loading { ProgressView().controlSize(.small) }
                }.font(.system(size: MeltedType.metadata))
                ForEach(Array(catalog.presets.enumerated()), id: \.element.id) { index, preset in
                    Button { editing = preset } label: {
                        HStack(spacing: MeltedReading.actionGap) {
                            VStack(alignment: .leading, spacing: MeltedPanelMetrics.detailGap) {
                                Text(preset.group + " · " + preset.label).fontWeight(.medium).lineLimit(2).help(preset.group + " · " + preset.label)
                                Text(preset.summary).font(.system(size: MeltedType.metadata)).foregroundStyle(palette.secondary).lineLimit(1).help(preset.summary)
                                if !preset.allowed { Text("服务器未开放").font(.system(size: MeltedType.metadata)).foregroundStyle(palette.secondary) }
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right").font(.system(size: MeltedType.metadata)).foregroundStyle(palette.secondary)
                        }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle()).padding(.vertical, MeltedReading.actionGap)
                    }.buttonStyle(.plain)
                    if index < catalog.presets.count - 1 { Rectangle().fill(palette.separator).frame(height: MeltedPanelMetrics.ruleWidth) }
                }
                if let error = catalog.error {
                    MeltedNotice(title: error)
                    Button { Task { await catalog.load(model: model, plugin: plugin, query: query) } } label: {
                        Text("重新加载").frame(height: MeltedPanelMetrics.controlHeight)
                    }.buttonStyle(MeltedSecondaryButtonStyle())
                } else if !catalog.loading && catalog.presets.isEmpty {
                    Text("没有匹配的来源").foregroundStyle(palette.secondary)
                }
                if catalog.nextCursor != nil {
                    HStack {
                        Spacer(minLength: 0)
                        Button { Task { await catalog.load(model: model, plugin: plugin, query: query, more: true) } } label: {
                            HStack(spacing: MeltedReading.actionGap) {
                                if catalog.loading { ProgressView().controlSize(.small) }
                                Text(catalog.loading ? "正在加载" : "加载更多")
                            }.frame(height: MeltedPanelMetrics.controlHeight)
                        }.buttonStyle(MeltedSecondaryButtonStyle()).disabled(catalog.loading)
                        Spacer(minLength: 0)
                    }.padding(.top, MeltedReading.actionGap)
                }
            }
        }.font(.system(size: MeltedType.control))
            .task(id: query) { await catalog.load(model: model, plugin: plugin, query: query) }
            .sheet(item: $editing) { preset in
                PluginPresetEditor(model: model, plugin: plugin, preset: preset,
                    unavailableValues: existing.union(selected), atLimit: selected.count >= maximum) { choice in
                    if !choices.contains(where: { $0.value == choice.value }) { choices.append(choice) }
                    selected.insert(choice.value)
                }
            }
    }
}

private struct PluginPresetEditor: View {
    @ObservedObject var model: SourceSettingsModel
    let plugin: PluginDescriptor
    let preset: PluginPreset
    let unavailableValues: Set<SettingValue>
    let atLimit: Bool
    let onSelect: (SettingSuggestion) -> Void
    @State private var input: PluginConfiguration
    @State private var error: String?
    @State private var busy = false
    @State private var requirementsExpanded = false
    @State private var descriptionExpanded = false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    init(model: SourceSettingsModel, plugin: PluginDescriptor, preset: PluginPreset, unavailableValues: Set<SettingValue>, atLimit: Bool, onSelect: @escaping (SettingSuggestion) -> Void) {
        self.model = model; self.plugin = plugin; self.preset = preset
        self.unavailableValues = unavailableValues; self.atLimit = atLimit; self.onSelect = onSelect
        _input = State(initialValue: preset.input.defaults)
    }
    var body: some View {
        MeltedPanel(preset.label, subtitle: preset.group) {
            if busy { ProgressView().controlSize(.small) }
        } content: {
            MeltedScrollView {
                VStack(alignment: .leading, spacing: MeltedPanelMetrics.fieldGap) {
                    Text(preset.summary).font(.system(size: MeltedType.metadata, design: .monospaced)).textSelection(.enabled)
                    if !preset.allowed { MeltedNotice(title: "服务器未开放此路由，请联系运营者") }
                    PluginFields(form: preset.input, values: $input)
                    if !preset.requirements.isEmpty {
                        MeltedDisclosure(isExpanded: $requirementsExpanded) {
                            Text("实例接入条件")
                        } content: {
                            ForEach(Array(preset.requirements.enumerated()), id: \.offset) { _, requirement in
                                Text(requirement).textSelection(.enabled)
                            }
                        }.font(.system(size: MeltedType.metadata)).foregroundStyle(MeltedPalette(scheme).secondary)
                    }
                    if let description = preset.description, !description.isEmpty {
                        MeltedDisclosure(isExpanded: $descriptionExpanded) { Text("路由说明") } content: {
                            ReadingMarkdown(description, scale: MeltedType.metadata / MeltedType.reading)
                        }.font(.system(size: MeltedType.metadata)).foregroundStyle(MeltedPalette(scheme).secondary)
                    }
                    if let error { MeltedNotice(title: error) }
                }.frame(maxWidth: .infinity, alignment: .leading).padding(MeltedPanelMetrics.inset)
            }
        } footer: {
            HStack(spacing: MeltedReading.actionGap) {
                Text(atLimit ? "已达到本次添加上限" : preset.input.error(in: input) ?? "").font(.system(size: MeltedType.metadata)).foregroundStyle(MeltedPalette(scheme).secondary)
                Spacer(minLength: 0)
                Button { dismiss() } label: { Text("取消").frame(height: MeltedPanelMetrics.controlHeight) }.buttonStyle(MeltedSecondaryButtonStyle()).keyboardShortcut(.cancelAction)
                Button { Task { await resolve() } } label: { Text("加入所选").frame(height: MeltedPanelMetrics.controlHeight) }.buttonStyle(MeltedPrimaryButtonStyle()).keyboardShortcut(.defaultAction)
                    .disabled(busy || atLimit || !preset.allowed || preset.input.error(in: input) != nil)
            }
        }.frame(width: MeltedPanelMetrics.editorWidth, height: MeltedPanelMetrics.height)
            .disabled(busy).interactiveDismissDisabled(busy)
            .onChange(of: input) { _, _ in error = nil }
    }
    private func resolve() async {
        guard !busy, let field = plugin.collection.presetCatalog?.field else { return }
        busy = true; error = nil
        defer { busy = false }
        do {
            let resolution = try await model.resolvePreset(preset, plugin: plugin, input: input)
            guard let value = resolution.configuration[field] else { throw APIError.incompatible }
            guard !unavailableValues.contains(value) else { error = "此来源已订阅或已在所选列表中"; return }
            onSelect(SettingSuggestion(value: value, label: resolution.label, group: preset.group))
            dismiss()
        } catch { self.error = PluginPresetCatalogModel.message(error) }
    }
}
