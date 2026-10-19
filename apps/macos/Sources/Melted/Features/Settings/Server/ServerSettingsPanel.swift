// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct ServerSettingsPanel: View {
    @StateObject private var model: ServerSettingsModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var discard = false
    @State private var comparisonExpanded = true
    @State private var showingRules = false
    @State private var confirmingAction: ServerSettingsWorkflow.Action?
    init(client: any ServerSettingsClient, section: ServerSettingsSection) {
        _model = StateObject(wrappedValue: ServerSettingsModel(client: client, section: section))
    }
    private var busy: Bool { model.loading || model.saving || model.performing }
    private var compileAction: ServerSettingsWorkflow.Action? {
        model.section.workflow?.actions.first { $0.id == "compile" && $0.enabledPhases.contains(model.processing?.phase ?? "") }
    }
    private var ready: Bool { model.processing?.phase == "ready" }
    private var primaryLabel: String {
        if model.saving { return "正在保存" }
        if model.state?.version == 0 { return model.section.save.label }
        if model.dirty { return model.section.save.label }
        if ready { return "检查并启用" }
        return compileAction?.label ?? model.section.save.label
    }
    var body: some View {
        MeltedPanel(model.section.title) {
            if busy { ProgressView().controlSize(.small) }
        } content: {
            MeltedScrollView {
                VStack(alignment: .leading, spacing: MeltedPanelMetrics.fieldGap) {
                    Text(model.section.description).font(.system(size: MeltedType.control))
                        .foregroundStyle(MeltedPalette(scheme).secondary).fixedSize(horizontal: false, vertical: true)
                    if model.state != nil {
                        PluginFields(form: model.section.form, values: $model.values, minimumTextLines: 1).disabled(busy)
                    }
                    if let error = model.error {
                        MeltedNotice(title: error)
                        if model.conflict {
                            Button("获取最新版本并保留输入") { Task { await model.refreshBase() } }
                                .buttonStyle(MeltedSecondaryButtonStyle()).disabled(busy)
                        } else if model.state == nil {
                            Button("重新加载") { Task { await model.load() } }.buttonStyle(MeltedSecondaryButtonStyle()).disabled(busy)
                        }
                    }
                    if let comparison = model.comparison {
                        MeltedDisclosure(isExpanded: $comparisonExpanded) {
                            Text("服务器当前设置（保存前请比较）")
                        } content: {
                            ForEach(model.section.form.fields) { field in
                                VStack(alignment: .leading, spacing: MeltedPanelMetrics.detailGap) {
                                    Text(field.label).fontWeight(.medium)
                                    Text(comparison[field.id]?.text.isEmpty == false ? comparison[field.id]!.text : "未指定").textSelection(.enabled)
                                }
                            }
                        }.font(.system(size: MeltedType.metadata)).foregroundStyle(MeltedPalette(scheme).secondary)
                    }
                }.padding(MeltedPanelMetrics.inset)
            }
        } footer: {
            HStack(spacing: MeltedReading.actionGap) {
                VStack(alignment: .leading, spacing: MeltedPanelMetrics.detailGap) {
                    Text(model.dirty ? model.validation ?? "有未保存的修改" : model.processing?.label ?? model.state.map { $0.version == 0 ? "尚未设置" : $0.statusLabel } ?? (model.loading ? "正在加载" : ""))
                        .font(.system(size: MeltedType.metadata)).foregroundStyle(MeltedPalette(scheme).secondary).lineLimit(2)
                    if model.processing?.preview?.isEmpty == false && !ready {
                        Button("查看整理规则") { showingRules = true }.buttonStyle(.plain)
                            .font(.system(size: MeltedType.metadata)).disabled(busy || model.dirty)
                    }
                }
                Spacer(minLength: 0)
                Button { if model.dirty { discard = true } else { dismiss() } } label: {
                    Text("完成").frame(height: MeltedPanelMetrics.controlHeight)
                }.buttonStyle(MeltedSecondaryButtonStyle()).keyboardShortcut(.cancelAction).disabled(busy)
                Button {
                    if model.dirty { Task { await model.save() } }
                    else if ready { showingRules = true }
                    else if let compileAction { confirmingAction = compileAction }
                } label: { Text(primaryLabel).frame(height: MeltedPanelMetrics.controlHeight) }
                    .buttonStyle(MeltedPrimaryButtonStyle())
                    .disabled(busy || model.conflict || model.state == nil || (model.dirty ? model.validation != nil : model.state?.version == 0 || (!ready && compileAction == nil)))
            }
        }
        .frame(width: MeltedPanelMetrics.editorWidth, height: MeltedPanelMetrics.height)
        .task {
            await model.load()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(3)) } catch { break }
                await model.pollWorkflow()
            }
        }
        .sheet(isPresented: $showingRules) { ServerRulesPanel(model: model) }
        .interactiveDismissDisabled(model.dirty || model.saving || model.performing)
        .confirmationDialog(confirmingAction?.label ?? "确认操作", isPresented: Binding(get: { confirmingAction != nil }, set: { if !$0 { confirmingAction = nil } })) {
            if let action = confirmingAction { Button(action.label) { confirmingAction = nil; Task { await model.perform(action) } } }
            Button("取消", role: .cancel) { confirmingAction = nil }
        } message: { Text(confirmingAction?.confirmation ?? "") }
        .confirmationDialog("放弃未保存的修改？", isPresented: $discard) {
            Button("放弃修改", role: .destructive) { dismiss() }
            Button("继续编辑", role: .cancel) {}
        }
    }
}

private struct ServerRulesPanel: View {
    @ObservedObject var model: ServerSettingsModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    private var action: ServerSettingsWorkflow.Action? {
        model.section.workflow?.actions.first {
            $0.enabledPhases.contains(model.processing?.phase ?? "") && ($0.id == "activate" || ($0.id == "reprocess" && (model.processing?.jobs.failed ?? 0) > 0))
        }
    }
    var body: some View {
        MeltedPanel("整理规则") { if model.performing { ProgressView().controlSize(.small) } } content: {
            MeltedScrollView {
                VStack(alignment: .leading, spacing: MeltedPanelMetrics.fieldGap) {
                    Text(model.processing?.phase == "ready" ? "根据你的描述生成，检查无误后即可启用" : "当前内容按以下规则整理")
                        .foregroundStyle(MeltedPalette(scheme).secondary)
                    VStack(alignment: .leading, spacing: MeltedPanelMetrics.fieldGap) {
                        ForEach(Array((model.processing?.preview ?? []).enumerated()), id: \.offset) { _, field in
                            HStack(alignment: .top, spacing: MeltedPanelMetrics.fieldGap) {
                                Text(field.label).foregroundStyle(MeltedPalette(scheme).secondary)
                                    .frame(width: MeltedPanelMetrics.detailLabelWidth, alignment: .leading)
                                    .fixedSize(horizontal: false, vertical: true)
                                Text(field.value).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    if let processing = model.processing, processing.phase == "active" {
                        Divider()
                        Text("已整理 \(processing.jobs.published) 条 · 已筛选 \(processing.jobs.filtered) 条 · 待复核 \(processing.jobs.held) 条")
                            .foregroundStyle(MeltedPalette(scheme).secondary)
                        if processing.jobs.failed > 0 { Text("\(processing.jobs.failed) 个任务未完成").foregroundStyle(MeltedPalette(scheme).warning) }
                    }
                    if let action { Text(action.confirmation).font(.system(size: MeltedType.metadata)).foregroundStyle(MeltedPalette(scheme).secondary).fixedSize(horizontal: false, vertical: true) }
                    if let error = model.error { MeltedNotice(title: error) }
                }.font(.system(size: MeltedType.control)).padding(MeltedPanelMetrics.inset)
            }
        } footer: {
            HStack {
                Spacer()
                Button { dismiss() } label: { Text(action?.id == "activate" ? "返回修改" : "完成").frame(height: MeltedPanelMetrics.controlHeight) }
                    .buttonStyle(MeltedSecondaryButtonStyle()).disabled(model.performing)
                if let action {
                    Button { Task { await model.perform(action); if model.processing?.phase == "active" && model.error == nil { dismiss() } } } label: {
                        Text(action.id == "activate" ? "确认启用" : action.label).frame(height: MeltedPanelMetrics.controlHeight)
                    }.buttonStyle(MeltedPrimaryButtonStyle()).disabled(model.performing || model.dirty || model.conflict)
                }
            }
        }
        .frame(width: MeltedPanelMetrics.editorWidth, height: MeltedPanelMetrics.height)
        .interactiveDismissDisabled(model.performing)
        .task { await model.pollWorkflow() }
    }
}
