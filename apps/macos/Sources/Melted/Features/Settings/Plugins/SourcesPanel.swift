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
    @State private var deleting: PluginSource?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    init(client: any PluginClient) { _model = StateObject(wrappedValue: SourceSettingsModel(client: client)) }
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("来源与插件").font(.title2.weight(.semibold))
                Spacer()
                Button { Task { await model.load() } } label: { Image(systemName: "arrow.clockwise") }.help("刷新来源").accessibilityLabel("刷新来源").disabled(model.loading || model.busy)
                Menu {
                    ForEach(model.catalog?.plugins ?? []) { plugin in
                        Button(plugin.title) { model.error = nil; editor = .init(plugin: plugin, source: nil) }
                            .disabled(!plugin.available || !plugin.supported)
                    }
                } label: { Label("添加来源", systemImage: "plus") }
                .fixedSize()
                .disabled(model.catalog == nil || model.busy)
            }.padding()
            if let notice = model.notice { Text(notice).font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 20) }
            Form {
                if model.loading { Section { ProgressView("正在加载来源") } }
                if let error = model.error { Section { Text(error).foregroundStyle(MeltedPalette(scheme).danger).textSelection(.enabled) } }
                if let catalog = model.catalog {
                    if model.sources.isEmpty {
                        Section { Text("尚未添加来源").font(.headline); Text("选择一个可用插件，设置你希望持续采集的内容").foregroundStyle(.secondary) }
                    }
                    ForEach(model.sources) { source in sourceSection(source, catalog: catalog) }
                    Section {
                        ForEach(catalog.plugins) { plugin in
                            LabeledContent(plugin.title, value: !plugin.supported ? "需要更新客户端" : plugin.available ? "可用" : "运营者尚未启用或配置")
                        }
                    } header: { Text("服务器提供的插件") } footer: { Text("采集结果保存为原始资料，暂不自动生成资讯").frame(maxWidth: .infinity, alignment: .leading) }
                }
            }.formStyle(.grouped).scrollContentBackground(.hidden)
            HStack { Spacer(); Button("完成") { dismiss() }.keyboardShortcut(.cancelAction) }.padding()
        }
        .background(MeltedPalette(scheme).canvas).tint(MeltedPalette(scheme).accent)
        .frame(width: 640, height: 600)
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
        Section {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(source.name).font(.headline)
                    Text(plugin?.title ?? source.plugin).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Text(source.enabled ? source.blocked ? "需要处理" : "自动采集" : "已暂停").foregroundStyle(.secondary)
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
                } label: { Text("管理") }.menuStyle(.borderlessButton).fixedSize().accessibilityLabel("管理\(source.name)").disabled(model.busy)
            }
            if let last = source.lastSuccessAt { LabeledContent("最近成功", value: last.formatted(date: .abbreviated, time: .shortened)) }
            if let error = source.lastError { Text("来源需要检查：\(error)").font(.caption).foregroundStyle(MeltedPalette(scheme).warning) }
            if let receipt = model.receipts[source.id] {
                LabeledContent("最近任务", value: receipt.label)
                if receipt.pending { ProgressView().controlSize(.small) }
                else {
                    VStack(spacing: 8) {
                        HStack(spacing: 24) { count("新增", receipt.counts.inserted); count("更新", receipt.counts.updated) }
                        HStack(spacing: 24) { count("重复", receipt.counts.duplicates); count("无效", receipt.counts.invalid) }
                    }.font(.caption).foregroundStyle(.secondary)
                }
                if let error = receipt.error { Text(error.code).font(.caption).foregroundStyle(MeltedPalette(scheme).warning) }
            }
        }
    }
    private func count(_ label: String, _ value: Int) -> some View {
        HStack { Text(label); Spacer(minLength: 8); Text(value, format: .number).monospacedDigit() }.frame(maxWidth: .infinity)
    }
}
