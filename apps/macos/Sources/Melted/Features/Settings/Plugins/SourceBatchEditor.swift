// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

/// Multi-row creation is driven by the collection descriptor, never by a plugin ID.
struct SourceBatchEditor: View {
    @ObservedObject var model: SourceSettingsModel
    let plugin: PluginDescriptor
    let sourceForm: PluginForm
    let batch: PluginCollection.Batch
    @State private var query = ""
    @State private var selected: Set<SettingValue> = []
    @State private var common: PluginConfiguration
    @State private var drafts: [SettingValue: SourceBatchDraft] = [:]
    @State private var saved: Set<String> = []
    @State private var errors: [String: String] = [:]
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    init(model: SourceSettingsModel, plugin: PluginDescriptor, sourceForm: PluginForm, batch: PluginCollection.Batch) {
        self.model = model; self.plugin = plugin; self.sourceForm = sourceForm; self.batch = batch
        _common = State(initialValue: sourceForm.excluding(["name"]).defaults)
    }
    private var choices: [SettingSuggestion] { plugin.form.fields.first { $0.id == batch.field }?.suggestions ?? [] }
    private var existing: Set<SettingValue> { Set(model.sources.filter { $0.plugin == plugin.id }.compactMap { $0.configuration[batch.field] }) }
    private var submitted: Bool { !drafts.isEmpty }
    private var validation: String? { sourceForm.excluding(["name"]).error(in: common) }
    var body: some View {
        MeltedPanel("批量添加订阅", subtitle: plugin.title) {
            Text("最多 \(batch.maximum) 个").foregroundStyle(MeltedPalette(scheme).secondary)
        } content: {
            VStack(spacing: 0) {
                NativeSearchField(text: $query, focusRequest: 0, focusOnAppear: true, prominent: true,
                                  prompt: "搜索订阅名称、类别或路径", accessibilityTitle: "搜索可添加订阅", fontSize: MeltedType.control, onCancel: { dismiss() })
                    .frame(height: MeltedPanelMetrics.controlHeight).padding(.horizontal, MeltedPanelMetrics.inset).padding(.vertical, MeltedReading.actionGap)
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: MeltedReading.actionGap) {
                        let visible = choices.filter { $0.matches(query) }
                        if visible.isEmpty { Text("没有匹配的建议").foregroundStyle(MeltedPalette(scheme).secondary) }
                        ForEach(visible) { choice in
                            let draft = drafts[choice.value]
                            let added = draft.map { saved.contains($0.id) } ?? false
                            VStack(alignment: .leading, spacing: MeltedPanelMetrics.detailGap) {
                                HStack {
                                    Toggle(choice.label, isOn: Binding(get: { selected.contains(choice.value) }, set: { value in
                                        if value { selected.insert(choice.value) } else { selected.remove(choice.value) }
                                    })).toggleStyle(MeltedCheckboxStyle())
                                        .disabled(submitted || existing.contains(choice.value) || (!selected.contains(choice.value) && selected.count >= batch.maximum))
                                    Spacer()
                                    if added { Text("已添加").foregroundStyle(MeltedPalette(scheme).secondary) }
                                    else if existing.contains(choice.value) { Text("已订阅").foregroundStyle(MeltedPalette(scheme).secondary) }
                                }
                                Text(choice.value.text).font(.system(size: MeltedType.metadata, design: .monospaced)).foregroundStyle(MeltedPalette(scheme).secondary).textSelection(.enabled)
                                if let draft, let error = errors[draft.id] { Text(error).foregroundStyle(MeltedPalette(scheme).warning).font(.system(size: MeltedType.metadata)) }
                            }.padding(.vertical, MeltedReading.listSpacing)
                        }
                    }.padding(.horizontal, MeltedPanelMetrics.inset)
                }
                DisclosureGroup("采集设置") {
                    PluginFields(form: sourceForm.excluding(["name"]), values: $common).disabled(submitted)
                        .padding(.top, MeltedReading.actionGap)
                }.padding(MeltedPanelMetrics.inset)
            }
        } footer: {
            HStack {
                Text(validation ?? (submitted ? "已添加 \(saved.count) 个，未完成 \(errors.count) 个" : "已选 \(selected.count) 个订阅"))
                    .font(.system(size: MeltedType.metadata)).foregroundStyle(MeltedPalette(scheme).secondary)
                Spacer()
                Button { dismiss() } label: { Text(submitted ? "完成" : "取消").frame(height: MeltedPanelMetrics.controlHeight) }
                    .buttonStyle(MeltedSecondaryButtonStyle()).keyboardShortcut(.cancelAction)
                if !submitted || !errors.isEmpty {
                    Button { Task { await submit() } } label: { Text(model.busy ? "正在添加" : submitted ? "重试未完成项" : "添加所选订阅").frame(height: MeltedPanelMetrics.controlHeight) }
                        .buttonStyle(MeltedPrimaryButtonStyle()).disabled(model.busy || selected.isEmpty || validation != nil).keyboardShortcut(.defaultAction)
                }
            }
        }
        .frame(width: MeltedPanelMetrics.width, height: MeltedPanelMetrics.height)
        .disabled(model.busy).interactiveDismissDisabled(model.busy)
    }
    private func submit() async {
        if !submitted {
            for choice in choices where selected.contains(choice.value) {
                var settings = common, configuration = plugin.form.defaults
                settings["name"] = .string(choice.label); configuration[batch.field] = choice.value
                drafts[choice.value] = SourceBatchDraft(id: UUID().uuidString, common: settings, configuration: configuration)
            }
        }
        let pending = choices.compactMap { drafts[$0.value] }.filter { !saved.contains($0.id) }
        let result = await model.addBatch(pending, plugin: plugin)
        saved.formUnion(result.saved); errors = result.errors
        if errors.isEmpty { dismiss() }
    }
}
