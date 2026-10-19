// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

private struct SourceEditorSelection: Identifiable {
    let id = UUID()
    let plugin: PluginDescriptor
    let source: PluginSource?
}
private struct ActionSelection: Identifiable {
    let id = UUID()
    let plugin: PluginDescriptor
    let source: PluginSource
    let action: PluginAction
}
struct SourcesPanel: View {
    @StateObject private var model: SourceSettingsModel
    @State private var editor: SourceEditorSelection?
    @State private var action: ActionSelection?
    @State private var pluginsExpanded = false
    @State private var collapsedPlugins: Set<String> = []
    @State private var deleting: PluginSource?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    init(client: any PluginClient) { _model = StateObject(wrappedValue: SourceSettingsModel(client: client)) }
    private var palette: MeltedPalette { MeltedPalette(scheme) }
    var body: some View {
        MeltedPanel("来源与插件") {
            Button { Task { await model.load() } } label: {
                Image(systemName: "arrow.clockwise").frame(height: MeltedPanelMetrics.controlHeight)
            }.buttonStyle(MeltedSecondaryButtonStyle()).help("刷新来源").accessibilityLabel("刷新来源").disabled(model.loading || model.busy)
            Menu {
                ForEach(model.catalog?.plugins ?? []) { plugin in
                    Button("添加 \(plugin.title) 订阅") {
                        model.error = nil
                        editor = .init(plugin: plugin, source: nil)
                    }.disabled(!plugin.available || !plugin.supported)
                }
            } label: { Label("添加来源", systemImage: "plus") }
                .menuStyle(.borderlessButton).modifier(MeltedMenuChrome()).fixedSize()
                .disabled(model.catalog == nil || model.busy)
        } content: {
            MeltedScrollView {
                VStack(alignment: .leading, spacing: MeltedPanelMetrics.sectionGap) {
                    if model.loading { ProgressView("正在加载来源").frame(maxWidth: .infinity, alignment: .leading) }
                    if let error = model.error { MeltedNotice(title: error) }
                    if let catalog = model.catalog {
                        ForEach(catalog.plugins) { plugin in
                            let sources = model.sources.filter { $0.plugin == plugin.id }
                            MeltedDisclosure(isExpanded: Binding(get: { !collapsedPlugins.contains(plugin.id) }, set: { expanded in
                                if expanded { collapsedPlugins.remove(plugin.id) } else { collapsedPlugins.insert(plugin.id) }
                            }), presentation: .card) {
                                Text(plugin.title).font(.system(size: MeltedType.section, weight: .semibold)).foregroundStyle(palette.text)
                                Text("\(sources.count) 个\(plugin.collection.title)").font(.system(size: MeltedType.metadata))
                            } trailing: {
                                Button {
                                    model.error = nil
                                    editor = .init(plugin: plugin, source: nil)
                                } label: {
                                    Image(systemName: "plus")
                                }
                                .buttonStyle(MeltedIconButtonStyle())
                                .help("添加 \(plugin.title) 订阅")
                                .accessibilityLabel("添加 \(plugin.title) 订阅")
                                .disabled(model.busy || !plugin.available || !plugin.supported)
                            } content: {
                                if plugin.supported {
                                    PluginSourceCollection(plugin: plugin, collection: plugin.collection, sources: sources, sourceForm: catalog.sourceForm) { source in
                                        sourceActions(source, plugin: plugin)
                                    } detail: { source in sourceRunSummary(source) }.disabled(model.busy)
                                } else {
                                    Text("需要更新客户端才能配置此插件").font(.system(size: MeltedType.metadata)).foregroundStyle(palette.secondary)
                                    ForEach(sources) { source in sourceSection(source, catalog: catalog) }
                                }
                            }
                        }
                        ForEach(model.sources.filter { source in !catalog.plugins.contains { $0.id == source.plugin } }) { source in sourceSection(source, catalog: catalog) }
                        MeltedDisclosure(isExpanded: $pluginsExpanded) {
                            Text("服务器插件（\(catalog.plugins.count)）")
                        } content: {
                            VStack(alignment: .leading, spacing: MeltedReading.actionGap) {
                                ForEach(catalog.plugins) { plugin in
                                    HStack(alignment: .top) {
                                        Text(plugin.title)
                                        Spacer()
                                        Text(!plugin.supported ? "需要更新客户端" : plugin.available ? "可用" : "尚未启用或配置").foregroundStyle(palette.secondary)
                                    }
                                }
                            }
                        }.font(.system(size: MeltedType.metadata)).foregroundStyle(palette.secondary)
                    }
                }.padding(MeltedPanelMetrics.inset)
            }.background(palette.canvas)
        } footer: {
            HStack(spacing: MeltedReading.actionGap) {
                Text(model.notice ?? "\(model.sources.count) 个来源")
                    .lineLimit(2).font(.system(size: MeltedType.metadata))
                Spacer(minLength: 0)
                Button { dismiss() } label: { Text("完成").frame(height: MeltedPanelMetrics.controlHeight) }
                    .buttonStyle(MeltedSecondaryButtonStyle()).keyboardShortcut(.cancelAction)
            }
        }
        .frame(width: MeltedPanelMetrics.width, height: MeltedPanelMetrics.height)
        .task {
            await model.load()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(3)) } catch { break }
                await model.pollReceipts()
            }
        }
        .sheet(item: $editor) { item in
            if let form = model.catalog?.sourceForm { SourceEditor(model: model, plugin: item.plugin, sourceForm: form, source: item.source) }
        }
        .sheet(item: $action) { item in PluginActionPanel(model: model, plugin: item.plugin, source: item.source, action: item.action) }
        .alert("删除来源？", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
            Button("取消", role: .cancel) { deleting = nil }
            Button("删除", role: .destructive) { if let source = deleting { Task { await model.remove(source) } }; deleting = nil }
        } message: { Text("该来源已采集的原始资料与历史修订也会删除") }
    }
    @ViewBuilder private func sourceSection(_ source: PluginSource, catalog: PluginCatalog) -> some View {
        let plugin = catalog.plugins.first { $0.id == source.plugin }
        VStack(alignment: .leading, spacing: MeltedReading.actionGap) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: MeltedPanelMetrics.detailGap) {
                    Text(source.name).font(.system(size: MeltedType.row, weight: .semibold)).textSelection(.enabled)
                    Text(plugin?.title ?? source.plugin).font(.system(size: MeltedType.metadata)).foregroundStyle(palette.secondary)
                }
                Spacer()
                Text(source.enabled ? source.blocked ? "需要处理" : "自动采集" : "已暂停").foregroundStyle(palette.secondary)
                sourceActions(source, plugin: plugin)
            }
            if let field = plugin?.form.fields.first(where: { $0.monospaced == true }), let value = source.configuration[field.id] {
                Text(value.text).font(.system(size: MeltedType.metadata, design: .monospaced)).foregroundStyle(palette.secondary).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
            }
            if let last = source.lastSuccessAt { LabeledContent("最近成功", value: last.formatted(date: .abbreviated, time: .shortened)) }
            if let error = source.lastError { Text("来源需要检查：\(error)").font(.system(size: MeltedType.metadata)).foregroundStyle(MeltedPalette(scheme).warning) }
            if let receipt = model.receipts[source.id] {
                LabeledContent("最近任务", value: receipt.label)
                if receipt.pending { ProgressView().controlSize(.small) }
                else {
                    VStack(spacing: MeltedReading.listSpacing) {
                        HStack(spacing: MeltedPanelMetrics.inset) { count("新增", receipt.counts.inserted); count("更新", receipt.counts.updated) }
                        HStack(spacing: MeltedPanelMetrics.inset) { count("重复", receipt.counts.duplicates); count("无效", receipt.counts.invalid) }
                    }.font(.system(size: MeltedType.metadata)).foregroundStyle(palette.secondary)
                }
                if let error = receipt.error { Text(error.code).font(.system(size: MeltedType.metadata)).foregroundStyle(MeltedPalette(scheme).warning) }
            }
        }
    }
    private func sourceRunSummary(_ source: PluginSource) -> some View {
        VStack(alignment: .leading, spacing: MeltedReading.actionGap) {
            HStack {
                Text(source.name).font(.system(size: MeltedType.row, weight: .medium))
                Spacer()
                Text(model.receipts[source.id]?.label ?? "等待任务状态").foregroundStyle(palette.secondary)
            }
            if let date = source.lastSuccessAt { LabeledContent("最近成功", value: date.formatted(date: .abbreviated, time: .shortened)).foregroundStyle(palette.secondary) }
            if let receipt = model.receipts[source.id] {
                HStack(spacing: MeltedPanelMetrics.inset) {
                    count("新增", receipt.counts.inserted); count("更新", receipt.counts.updated)
                    count("重复", receipt.counts.duplicates); count("无效", receipt.counts.invalid)
                }.foregroundStyle(palette.secondary)
                if let error = receipt.error { Text(error.code).foregroundStyle(palette.warning) }
            }
            if let error = source.lastError { Text(error).foregroundStyle(palette.warning) }
        }.font(.system(size: MeltedType.metadata))
    }
    private func sourceActions(_ source: PluginSource, plugin: PluginDescriptor?) -> some View {
        Menu {
            Button(source.enabled ? "暂停采集" : "启用采集") { Task { await model.toggle(source) } }
                .disabled(!source.enabled && (plugin?.available != true || plugin?.supported != true))
            if let plugin, plugin.available && plugin.supported && plugin.configVersion == source.configVersion {
                Button("编辑设置") { model.error = nil; editor = .init(plugin: plugin, source: source) }
                ForEach(plugin.actions) { item in
                    Button(item.label) { model.error = nil; action = .init(plugin: plugin, source: source, action: item) }
                        .disabled(item.effect == "collect" && !source.enabled)
                }
            }
            if let run = source.lastRunId { Button("查看最近任务") { Task { await model.refreshReceipt(run, sourceID: source.id) } } }
            Divider()
            Button("删除来源", role: .destructive) { deleting = source }
        } label: {
            HStack(spacing: MeltedPanelMetrics.detailGap) {
                Text("管理")
                Image(systemName: "chevron.down").font(.system(size: MeltedType.metadata, weight: .medium)).accessibilityHidden(true)
            }.foregroundStyle(palette.accent)
        }.menuStyle(.button).buttonStyle(.plain).fixedSize().accessibilityLabel("管理\(source.name)").disabled(model.busy)
    }
    private func count(_ label: String, _ value: Int) -> some View {
        HStack { Text(label); Spacer(minLength: 8); Text(value, format: .number).monospacedDigit() }.frame(maxWidth: .infinity)
    }
}
