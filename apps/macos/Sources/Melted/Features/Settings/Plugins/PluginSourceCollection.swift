// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct PluginSourceCollection<Actions: View, Detail: View>: View {
    let plugin: PluginDescriptor
    let collection: PluginCollection
    let sources: [PluginSource]
    let sourceForm: PluginForm
    @ViewBuilder let actions: (PluginSource) -> Actions
    @ViewBuilder let detail: (PluginSource) -> Detail
    @State private var layout: String
    @State private var selected: String?
    @Environment(\.colorScheme) private var scheme
    init(plugin: PluginDescriptor, collection: PluginCollection, sources: [PluginSource], sourceForm: PluginForm,
         @ViewBuilder actions: @escaping (PluginSource) -> Actions, @ViewBuilder detail: @escaping (PluginSource) -> Detail) {
        self.plugin = plugin; self.collection = collection; self.sources = sources; self.sourceForm = sourceForm
        self.actions = actions; self.detail = detail; _layout = State(initialValue: collection.layout)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: MeltedReading.actionGap) {
            HStack {
                Text(plugin.title).font(.system(size: MeltedType.section, weight: .semibold))
                Text("\(sources.count) 个\(collection.title)").foregroundStyle(MeltedPalette(scheme).secondary)
                Spacer()
                Picker("显示方式", selection: $layout) {
                    Text("表格").tag("table")
                    Text("列表").tag("list")
                }.pickerStyle(.segmented).labelsHidden().fixedSize().accessibilityLabel(plugin.title + "显示方式")
            }
            if sources.isEmpty {
                Text(collection.addFromSuggestions == nil ? "尚未添加订阅，可添加多个独立来源" : "尚未添加订阅，可一次选择多个来源").foregroundStyle(MeltedPalette(scheme).secondary).padding(.vertical, MeltedReading.paragraphSpacing)
            } else if layout == "table" {
                SettingsTable(columns: collection.columns.map { column in
                    SettingsTableColumn(id: column.id, title: column.label,
                                        width: column.scope == "configuration" ? MeltedPanelMetrics.columnWide : column.field == "name" ? MeltedPanelMetrics.columnTitle : MeltedPanelMetrics.columnNarrow)
                }, rows: sources.map { source in
                    SettingsTableRow(id: source.id, revision: String(source.version) + (source.lastRunId ?? ""), cells: collection.columns.map { column in
                        SettingsTableCell(text: text(column, source: source), monospaced: column.scope == "configuration" && plugin.form.fields.first(where: { $0.id == column.field })?.monospaced == true)
                    })
                }, selection: $selected) { id in
                    if let source = sources.first(where: { $0.id == id }) { actions(source) }
                }
                .frame(height: min(MeltedPanelMetrics.tableMaximum, max(MeltedPanelMetrics.tableMinimum, CGFloat(sources.count + 1) * MeltedPanelMetrics.tableRow)))
                .accessibilityLabel(plugin.title + collection.title)
                Text("选择一行查看采集状态；每个订阅可独立管理").font(.system(size: MeltedType.metadata)).foregroundStyle(MeltedPalette(scheme).secondary)
            } else {
                ForEach(sources) { source in
                    VStack(alignment: .leading, spacing: MeltedReading.listSpacing) {
                        ForEach(collection.columns) { column in
                            HStack(alignment: .firstTextBaseline) {
                                Text(column.label).foregroundStyle(MeltedPalette(scheme).secondary).frame(width: MeltedPanelMetrics.columnNarrow, alignment: .leading)
                                cell(column, source: source)
                                Spacer(minLength: 0)
                            }
                        }
                        HStack {
                            Button("采集状态") { selected = selected == source.id ? nil : source.id }.buttonStyle(.plain).foregroundStyle(MeltedPalette(scheme).accent)
                            Spacer(); actions(source)
                        }
                        if source.id == selected { detail(source).padding(.top, MeltedReading.actionGap) }
                    }.padding(.vertical, MeltedReading.actionGap)
                    Rectangle().fill(MeltedPalette(scheme).separator).frame(height: MeltedPanelMetrics.ruleWidth)
                }
            }
            if layout == "table", let source = sources.first(where: { $0.id == selected }) {
                detail(source).padding(.top, MeltedReading.actionGap)
            }
        }
    }
    private func cell(_ column: PluginCollection.Column, source: PluginSource) -> some View {
        let text = text(column, source: source)
        let mono = column.scope == "configuration" && plugin.form.fields.first(where: { $0.id == column.field })?.monospaced == true
        return Text(text).font(.system(size: MeltedType.metadata, design: mono ? .monospaced : .default))
            .foregroundStyle(MeltedPalette(scheme).text).lineLimit(layout == "table" ? 1 : nil).help(text)
            .frame(minHeight: layout == "table" ? MeltedPanelMetrics.controlHeight : nil)
    }
    private func text(_ column: PluginCollection.Column, source: PluginSource) -> String {
        if column.scope == "configuration" { return source.configuration[column.field]?.text ?? "—" }
        switch column.field {
        case "name": return source.name
        case "enabled": return source.enabled ? source.blocked ? "需要处理" : "自动采集" : "已暂停"
        case "interval_seconds":
            return sourceForm.fields.first(where: { $0.id == column.field })?.suggestions?.first(where: { $0.value == .number(Double(source.intervalSeconds)) })?.label ?? "\(source.intervalSeconds) 秒"
        case "last_success_at": return source.lastSuccessAt?.formatted(date: .abbreviated, time: .shortened) ?? "尚未采集"
        case "last_error": return source.lastError ?? "—"
        default: return "—"
        }
    }
}
