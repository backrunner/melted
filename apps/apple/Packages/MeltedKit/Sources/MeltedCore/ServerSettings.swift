// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

public struct ServerSettingsSection: Codable, Identifiable, Sendable {
    public struct Read: Codable, Sendable { public let method, path: String }
    public struct Write: Codable, Sendable { public let method, path, format, label: String; public let maxBytes: Int }
    public let id, title, description: String
    public let schemaVersion: Int
    public let form: PluginForm
    public let load: Read
    public let save: Write
    public let workflow: ServerSettingsWorkflow?
    public var supported: Bool {
        PluginIdentifiers.valid(id) && schemaVersion > 0 && schemaVersion <= 9_007_199_254_740_991 &&
        !title.isEmpty && title.utf16.count <= 1000 && description.utf16.count <= 1000 &&
        form.supported && load.method == "GET" && Self.validPath(load.path) &&
        ["PUT", "POST", "PATCH"].contains(save.method) && Self.validPath(save.path) &&
        save.format == "versioned-values-v1" && (1...32768).contains(save.maxBytes) && !save.label.isEmpty && save.label.utf16.count <= 1000 && (workflow?.supported ?? true)
    }
    public static func validPath(_ path: String) -> Bool {
        path.utf16.count <= 200 && path.range(of: "^/v1/settings/[a-z][a-z0-9_-]*(?:/[a-z][a-z0-9_-]*)*\\z", options: .regularExpression) != nil
    }
    public func sameDefinition(as other: ServerSettingsSection) throws -> Bool {
        let encoder = Wire.encoder(); encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(self) == encoder.encode(other)
    }
}
public struct ServerSettingsWorkflow: Codable, Sendable {
    public struct Action: Codable, Identifiable, Sendable {
        public let id, label, method, path, confirmation: String
        public let enabledPhases: [String]
        public var supported: Bool {
            ["compile", "activate", "reprocess"].contains(id) && method == "POST" && ServerSettingsSection.validPath(path) &&
            !label.isEmpty && label.utf16.count <= 1000 && !confirmation.isEmpty && confirmation.utf16.count <= 1000 &&
            !enabledPhases.isEmpty && enabledPhases.count <= 6 && enabledPhases.allSatisfy { ["stored", "pending", "ready", "active", "failed", "consent_required"].contains($0) }
        }
    }
    public let format, fingerprint: String
    public let status: ServerSettingsSection.Read
    public let actions: [Action]
    public var supported: Bool {
        format == "processing-actions-v1" && fingerprint.range(of: "^[a-f0-9]{64}\\z", options: .regularExpression) != nil &&
        status.method == "GET" && ServerSettingsSection.validPath(status.path) && actions.count <= 3 &&
        Set(actions.map(\.id)).count == actions.count && actions.allSatisfy(\.supported)
    }
}
public struct ServerProcessingStatus: Codable, Sendable {
    public struct Preview: Codable, Sendable { public let label, value: String }
    public struct Jobs: Codable, Sendable { public let queued, running, failed, published, filtered, held: Int }
    public let configured: Bool
    public let version: Int
    public let phase: String
    public let fingerprint, error: String?
    public let preview: [Preview]?
    public let jobs: Jobs
    public let reservedCalls, dailyCallLimit: Int?
    public func supported(version: Int) -> Bool {
        self.version == version && ["unavailable", "stored", "pending", "ready", "active", "failed", "consent_required"].contains(phase) &&
        [jobs.queued, jobs.running, jobs.failed, jobs.published, jobs.filtered, jobs.held].allSatisfy { $0 >= 0 } &&
        (preview?.count ?? 0) <= 20 && (preview?.allSatisfy { $0.label.utf16.count <= 1000 && $0.value.utf16.count <= 30000 } ?? true)
    }
    public var label: String {
        if version == 0 && phase == "stored" { return "尚未设置偏好" }
        return switch phase {
        case "unavailable": "整理模型或凭据尚未配置"
        case "stored": "已保存，待生成整理规则"
        case "pending": "正在生成整理规则"
        case "ready": "整理规则待确认"
        case "active": "偏好已启用"
        case "failed": "规则生成失败，可重试"
        case "consent_required": "模型配置已变化，请重新确认处理范围"
        default: "未知处理状态"
        }
    }
}
public protocol ServerSettingsWorkflowClient: ServerSettingsClient {
    func serverProcessingStatus(_ section: ServerSettingsSection, version: Int) async throws -> ServerProcessingStatus
    func performServerSettingsAction(_ section: ServerSettingsSection, action: ServerSettingsWorkflow.Action, version: Int, requestID: String) async throws -> ServerProcessingStatus
}
extension APIClient: ServerSettingsWorkflowClient {
    public func serverProcessingStatus(_ section: ServerSettingsSection, version: Int) async throws -> ServerProcessingStatus {
        guard section.supported, let workflow = section.workflow else { throw APIError.incompatible }
        let result: ServerProcessingStatus = try await send(workflow.status.path, method: workflow.status.method, token: accessToken())
        guard result.supported(version: version) else { throw APIError.response(409, "settings_conflict") }
        return result
    }
    public func performServerSettingsAction(_ section: ServerSettingsSection, action: ServerSettingsWorkflow.Action, version: Int, requestID: String) async throws -> ServerProcessingStatus {
        guard section.supported, let workflow = section.workflow, action.supported,
              workflow.actions.contains(where: { $0.id == action.id && $0.path == action.path && $0.method == action.method }), version > 0 else { throw APIError.incompatible }
        struct Body: Encodable { let expectedVersion: Int; let fingerprint, action: String }
        let result: ServerProcessingStatus = try await send(action.path, method: action.method, body: Wire.encoder().encode(Body(expectedVersion: version, fingerprint: workflow.fingerprint, action: action.id)), token: accessToken(), headers: ["Idempotency-Key": requestID])
        guard result.supported(version: version) else { throw APIError.incompatible }
        return result
    }
}
public struct ServerSettingsCatalog: Codable, Sendable {
    public let dslVersion: Int
    public let sections: [ServerSettingsSection]
    public let credentials: [ServerCredentialSection]?
    public var supported: Bool {
        dslVersion == 1 && (credentials?.count ?? 0) <= 1 && sections.count <= 20 && Set(sections.map(\.id)).count == sections.count && sections.allSatisfy { PluginIdentifiers.valid($0.id) }
    }
}
public struct ServerSettingsState: Codable, Sendable {
    public let schemaVersion, version: Int
    public let values: PluginConfiguration
    public let application: String
    public func supported(for section: ServerSettingsSection) -> Bool {
        schemaVersion == section.schemaVersion && version >= 0 && version <= 9_007_199_254_740_991 &&
        ["stored", "active", "pending"].contains(application) && section.form.error(in: values) == nil
    }
    public var statusLabel: String {
        switch application {
        case "active": "已应用"
        case "pending": "已保存，等待处理"
        case "stored": "已保存到服务器"
        default: "未知应用状态"
        }
    }
}
public protocol ServerSettingsClient: Sendable {
    func serverSettingsCatalog() async throws -> ServerSettingsCatalog
    func serverSettings(_ section: ServerSettingsSection) async throws -> ServerSettingsState
    func saveServerSettings(_ section: ServerSettingsSection, values: PluginConfiguration, version: Int, requestID: String) async throws -> ServerSettingsState
}
extension APIClient: ServerSettingsClient {
    public func serverSettingsCatalog() async throws -> ServerSettingsCatalog {
        let catalog: ServerSettingsCatalog = try await send("/v1/settings", token: accessToken())
        guard catalog.supported else { throw APIError.incompatible }
        return catalog
    }
    public func serverSettings(_ section: ServerSettingsSection) async throws -> ServerSettingsState {
        guard section.supported else { throw APIError.incompatible }
        let state: ServerSettingsState = try await send(section.load.path, method: section.load.method, token: accessToken())
        guard state.supported(for: section) else { throw APIError.incompatible }
        return state
    }
    public func saveServerSettings(_ section: ServerSettingsSection, values: PluginConfiguration, version: Int, requestID: String) async throws -> ServerSettingsState {
        guard section.supported, section.form.error(in: values) == nil, version >= 0, version < 9_007_199_254_740_991,
              requestID.range(of: "^[A-Za-z0-9._:-]{1,128}$", options: .regularExpression) != nil else { throw APIError.incompatible }
        struct Body: Encodable { let schemaVersion, expectedVersion: Int; let values: PluginConfiguration }
        let body = try Wire.encoder().encode(Body(schemaVersion: section.schemaVersion, expectedVersion: version, values: values))
        guard body.count <= section.save.maxBytes else { throw APIError.response(413, "payload_too_large") }
        let state: ServerSettingsState = try await send(section.save.path, method: section.save.method, body: body, token: accessToken(), headers: ["Idempotency-Key": requestID])
        guard state.supported(for: section), state.version == version + 1 else { throw APIError.incompatible }
        return state
    }
}
