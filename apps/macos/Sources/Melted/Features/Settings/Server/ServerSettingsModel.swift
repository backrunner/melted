// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import SwiftUI
import MeltedCore

@MainActor
final class ServerSettingsModel: ObservableObject {
    let section: ServerSettingsSection
    private let client: any ServerSettingsClient
    @Published var values: PluginConfiguration = [:]
    @Published private(set) var state: ServerSettingsState?
    @Published private(set) var loading = false
    @Published private(set) var saving = false
    @Published private(set) var error: String?
    @Published private(set) var conflict = false
    @Published private(set) var comparison: PluginConfiguration?
    @Published private(set) var processing: ServerProcessingStatus?
    @Published private(set) var performing = false
    private var workflowError = false
    private var actionRequestID = UUID().uuidString
    private var actionIdentity: String?
    private var generation = UUID()
    private var requestID = UUID().uuidString
    private var requestValues: PluginConfiguration?
    private var requestVersion: Int?
    init(client: any ServerSettingsClient, section: ServerSettingsSection) {
        self.client = client; self.section = section
    }
    var dirty: Bool { state.map { values != $0.values } ?? false }
    var validation: String? { section.form.error(in: values) }
    func load() async {
        guard !loading, !saving, !performing else { return }
        let current = UUID(); generation = current
        loading = true; error = nil; workflowError = false
        defer { if generation == current { loading = false } }
        do {
            let next = try await client.serverSettings(section)
            try Task.checkCancellation()
            guard generation == current else { return }
            guard next.supported(for: section) else { throw APIError.incompatible }
            state = next; values = next.values; conflict = false
            comparison = nil
            requestValues = nil; requestVersion = nil
            processing = nil
            if let workflowClient = client as? any ServerSettingsWorkflowClient, section.workflow != nil {
                workflowError = true
                processing = try await workflowClient.serverProcessingStatus(section, version: next.version)
                workflowError = false
            }
        } catch is CancellationError {} catch { if generation == current { self.error = Self.message(error) } }
    }
    /// Fetch a new base revision without dropping the user's unsaved text.
    func refreshBase() async {
        guard !loading, !saving, conflict else { return }
        loading = true; error = nil; workflowError = false
        defer { loading = false }
        do {
            let latest = try await client.serverSettingsCatalog()
            guard latest.supported,
                  let current = latest.sections.first(where: { $0.id == section.id }),
                  try current.sameDefinition(as: section) else { throw APIError.incompatible }
            let next = try await client.serverSettings(section)
            try Task.checkCancellation()
            guard next.supported(for: section) else { throw APIError.incompatible }
            state = next; comparison = next.values; conflict = false; requestValues = nil; requestVersion = nil
        } catch is CancellationError {} catch { self.error = Self.message(error) }
    }
    func save() async {
        guard !saving, !loading, !performing, !conflict, let state, dirty, validation == nil else { return }
        let submitted = values, current = generation
        if requestValues != submitted || requestVersion != state.version {
            requestID = UUID().uuidString; requestValues = submitted; requestVersion = state.version
        }
        saving = true; error = nil; workflowError = false
        defer { saving = false }
        do {
            let next = try await client.saveServerSettings(section, values: submitted, version: state.version, requestID: requestID)
            try Task.checkCancellation()
            guard generation == current else { return }
            guard next.supported(for: section), next.version == state.version + 1 else { throw APIError.incompatible }
            self.state = next; values = next.values
            comparison = nil
            processing = nil; actionIdentity = nil
            requestValues = nil; requestVersion = nil
        } catch is CancellationError {} catch {
            if case APIError.response(409, _) = error { conflict = true }
            self.error = Self.message(error)
        }
    }
    func pollWorkflow() async {
        guard !loading, !saving, !performing, let state, section.workflow != nil, let workflowClient = client as? any ServerSettingsWorkflowClient else { return }
        let current = generation
        do {
            let next = try await workflowClient.serverProcessingStatus(section, version: state.version)
            try Task.checkCancellation()
            guard generation == current, self.state?.version == state.version, !saving, !performing else { return }
            processing = next
            if workflowError { error = nil; workflowError = false }
        } catch is CancellationError {} catch {
            if case APIError.response(409, _) = error { conflict = true }
            self.error = Self.message(error); workflowError = true
        }
    }
    func perform(_ action: ServerSettingsWorkflow.Action) async {
        guard !loading, !saving, !performing, !dirty, !conflict, let state, state.version > 0,
              let processing, action.enabledPhases.contains(processing.phase), let workflowClient = client as? any ServerSettingsWorkflowClient else { return }
        let identity = "\(state.version):\(section.workflow?.fingerprint ?? ""):\(action.id)"
        if actionIdentity != identity { actionIdentity = identity; actionRequestID = UUID().uuidString }
        performing = true; error = nil; workflowError = false
        defer { performing = false }
        do {
            self.processing = try await workflowClient.performServerSettingsAction(section, action: action, version: state.version, requestID: actionRequestID)
            try Task.checkCancellation()
            actionIdentity = nil
        } catch is CancellationError {} catch {
            if case APIError.response(409, _) = error { conflict = true }
            self.error = Self.message(error)
        }
    }
    static func message(_ error: Error) -> String {
        if let network = error as? URLError {
            return network.code == .timedOut ? "连接服务器超时，请稍后重试" : "无法连接服务器，请检查网络后重试"
        }
        if case APIError.response(409, "processing_configuration_changed") = error { return "模型凭据或处理配置已变化，请重新打开偏好，编译并确认草案" }
        if case APIError.response(409, "settings_schema_changed") = error { return "服务器的设置格式已变化，请关闭后重新打开；当前输入仍保留在此页" }
        if case APIError.response(409, _) = error { return "设置已在其他位置更新，当前输入已保留；获取最新版本后可重新检查并保存" }
        if case APIError.response(413, _) = error { return "偏好内容过长，请精简后重试" }
        if case APIError.incompatible = error { return "服务器设置格式不受支持或已变化，请更新客户端或重新打开设置；当前输入已保留" }
        return error.localizedDescription
    }
}
