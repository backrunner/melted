// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

@MainActor final class ServerCredentialsModel: ObservableObject {
    let section: ServerCredentialSection
    private let client: any ServerCredentialsClient
    @Published var values: [String: String] = [:]
    @Published var clearing = Set<String>()
    @Published private(set) var status: ServerCredentialStatus?
    @Published private(set) var busy = false
    @Published private(set) var error: String?
    @Published private(set) var conflict = false
    private var requestChanges: [String: ServerCredentialChange]?
    private var requestVersion: Int?
    private var requestID = UUID().uuidString
    init(client: any ServerCredentialsClient, section: ServerCredentialSection) { self.client = client; self.section = section }
    var changes: [String: ServerCredentialChange] {
        Dictionary(uniqueKeysWithValues: section.fields.compactMap { field in
            if clearing.contains(field.id) { return (field.id, .clear) }
            guard let value = values[field.id], !value.isEmpty else { return nil }
            return (field.id, .replace(value))
        })
    }
    var dirty: Bool { !changes.isEmpty }
    var valid: Bool { changes.values.allSatisfy(\.valid) }
    func load() async {
        guard !busy else { return }; busy = true; error = nil
        defer { busy = false }
        do { let result = try await client.serverCredentials(section); guard result.supported else { throw APIError.incompatible }; status = result; conflict = false; requestChanges = nil; requestVersion = nil }
        catch is CancellationError {} catch { self.error = Self.message(error) }
    }
    func save() async {
        guard !busy, !conflict, dirty, valid, let status else { return }
        let submitted = changes
        if requestChanges != submitted || requestVersion != status.version { requestChanges = submitted; requestVersion = status.version; requestID = UUID().uuidString }
        busy = true; error = nil; defer { busy = false }
        do {
            let result = try await client.saveServerCredentials(section, version: status.version, changes: submitted, requestID: requestID)
            guard result.supported, result.version == status.version + 1 else { throw APIError.incompatible }
            self.status = result; erase(); conflict = false
        } catch is CancellationError {} catch {
            if case APIError.response(409, _) = error { conflict = true }
            self.error = Self.message(error)
        }
    }
    func erase() { values = [:]; clearing = []; requestChanges = nil; requestVersion = nil }
    static func message(_ error: Error) -> String {
        if case APIError.response(403, _) = error { return "当前账户无权配置此凭据，请重新加载服务器设置" }
        if case APIError.response(409, _) = error { return "凭据已在其他位置更新，输入已保留；获取最新版本后再保存" }
        if case APIError.response(503, _) = error { return "服务器凭据存储暂不可用，请联系管理员" }
        if case APIError.response(400, _) = error { return "密钥格式不符合服务器要求" }
        if error is URLError { return "无法连接服务器，输入已保留，可重试" }
        return "凭据操作未完成，请重试或重新加载服务器设置"
    }
}

struct ServerCredentialsPanel: View {
    @StateObject private var model: ServerCredentialsModel
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focused: String?
    @State private var confirming = false
    @State private var discard = false
    init(client: any ServerCredentialsClient, section: ServerCredentialSection) { _model = StateObject(wrappedValue: ServerCredentialsModel(client: client, section: section)) }
    var body: some View {
        MeltedPanel(model.section.title) { if model.busy { ProgressView().controlSize(.small) } } content: {
            MeltedScrollView {
                VStack(alignment: .leading, spacing: MeltedPanelMetrics.fieldGap) {
                    Text(model.section.description).font(.system(size: MeltedType.control)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    if let status = model.status {
                        ForEach(model.section.fields) { field in
                            VStack(alignment: .leading, spacing: MeltedPanelMetrics.detailGap) {
                                MeltedField(field.label, isFocused: focused == field.id, height: MeltedPanelMetrics.controlHeight) {
                                    SecureField(field.placeholder, text: Binding(get: { model.values[field.id] ?? "" }, set: { model.values[field.id] = $0 }))
                                        .focused($focused, equals: field.id).disabled(model.clearing.contains(field.id))
                                }
                                HStack {
                                    Text(model.clearing.contains(field.id) ? "保存时移除此密钥" : status.configured[field.id] == true ? "已配置，密钥不回显" : "尚未配置").foregroundStyle(.secondary)
                                    Spacer()
                                    if status.configured[field.id] == true {
                                        Button(model.clearing.contains(field.id) ? "保留密钥" : "移除密钥") {
                                            if model.clearing.contains(field.id) { model.clearing.remove(field.id) } else { model.clearing.insert(field.id); model.values[field.id] = "" }
                                        }.buttonStyle(.plain)
                                    }
                                }.font(.system(size: MeltedType.metadata))
                            }
                        }.disabled(model.busy)
                    }
                    if let error = model.error { MeltedNotice(title: error) }
                    if model.status == nil || model.conflict {
                        Button(model.conflict ? "获取最新版本并保留输入" : "重新加载") { Task { await model.load() } }.buttonStyle(MeltedSecondaryButtonStyle()).disabled(model.busy)
                    }
                    if model.dirty && !model.valid { Text("密钥仅允许无空白的 ASCII 字符，最多 4096 字符").foregroundStyle(.secondary).font(.system(size: MeltedType.metadata)) }
                }.padding(MeltedPanelMetrics.inset)
            }
        } footer: {
            HStack {
                Text(model.error ?? (model.dirty ? "有未保存的凭据修改" : "保存仅确认已写入；模型有效性在整理任务中检查"))
                    .font(.system(size: MeltedType.metadata)).foregroundStyle(.secondary)
                Spacer()
                Button { if model.dirty { discard = true } else { dismiss() } } label: { Text("完成").frame(height: MeltedPanelMetrics.controlHeight) }.buttonStyle(MeltedSecondaryButtonStyle()).disabled(model.busy)
                Button { confirming = true } label: { Text(model.section.save.label).frame(height: MeltedPanelMetrics.controlHeight) }.buttonStyle(MeltedPrimaryButtonStyle()).disabled(model.busy || !model.dirty || !model.valid || model.conflict || model.status == nil)
            }
        }
        .frame(width: MeltedPanelMetrics.editorWidth, height: MeltedPanelMetrics.height)
        .task { await model.load() }.onDisappear { model.erase() }
        .interactiveDismissDisabled(model.dirty || model.busy)
        .confirmationDialog(model.section.save.label, isPresented: $confirming) {
            Button(model.section.save.label) { Task { await model.save() } }
            Button("取消", role: .cancel) {}
        } message: { Text(model.section.save.confirmation) }
        .confirmationDialog("放弃未保存的凭据修改？", isPresented: $discard) {
            Button("放弃修改", role: .destructive) { model.erase(); dismiss() }
            Button("继续编辑", role: .cancel) {}
        }
    }
}
