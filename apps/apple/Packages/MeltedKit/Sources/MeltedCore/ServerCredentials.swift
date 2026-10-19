// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

public struct ServerCredentialSection: Codable, Identifiable, Sendable {
    public struct Field: Codable, Identifiable, Sendable { public let id, type, label, placeholder: String; public let maxLength: Int }
    public struct Save: Codable, Sendable { public let method, path, format, label, confirmation: String }
    public let id, scope, title, description: String
    public let fields: [Field]
    public let load: ServerSettingsSection.Read
    public let save: Save
    public var supported: Bool {
        id == "model_credentials" && ["account", "server"].contains(scope) &&
        fields.count == 2 && Set(fields.map(\.id)) == Set(["generator_key", "decision_key"]) &&
        fields.allSatisfy { $0.type == "secret" && $0.maxLength == 4096 && !$0.label.isEmpty && $0.label.utf16.count <= 1000 && $0.placeholder.utf16.count <= 1000 } &&
        load.method == "GET" && load.path == "/v1/settings/credentials/\(scope)" &&
        save.method == "POST" && save.path == load.path && save.format == "write-only-secrets-v1" &&
        !title.isEmpty && title.utf16.count <= 1000 && description.utf16.count <= 3000 &&
        !save.label.isEmpty && save.label.utf16.count <= 1000 && !save.confirmation.isEmpty && save.confirmation.utf16.count <= 3000
    }
}
public struct ServerCredentialStatus: Codable, Sendable {
    public let version: Int
    public let configured: [String: Bool]
    public let updatedAt, updatedBy: String?
    public var supported: Bool { (0...9_007_199_254_740_991).contains(version) && Set(configured.keys) == Set(["generator_key", "decision_key"]) }
}
public enum ServerCredentialChange: Encodable, Sendable, Equatable {
    case replace(String), clear
    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self { case .replace(let value): try container.encode(value); case .clear: try container.encodeNil() }
    }
    public var valid: Bool {
        switch self { case .clear: true; case .replace(let value): !value.isEmpty && value.utf16.count <= 4096 && value.utf8.allSatisfy { (33...126).contains($0) } }
    }
}
public protocol ServerCredentialsClient: Sendable {
    func serverCredentials(_ section: ServerCredentialSection) async throws -> ServerCredentialStatus
    func saveServerCredentials(_ section: ServerCredentialSection, version: Int, changes: [String: ServerCredentialChange], requestID: String) async throws -> ServerCredentialStatus
}
extension APIClient: ServerCredentialsClient {
    public func serverCredentials(_ section: ServerCredentialSection) async throws -> ServerCredentialStatus {
        guard section.supported else { throw APIError.incompatible }
        let result: ServerCredentialStatus = try await send(section.load.path, method: section.load.method, token: accessToken())
        guard result.supported else { throw APIError.incompatible }
        return result
    }
    public func saveServerCredentials(_ section: ServerCredentialSection, version: Int, changes: [String: ServerCredentialChange], requestID: String) async throws -> ServerCredentialStatus {
        guard section.supported, version >= 0, version < 9_007_199_254_740_991, !changes.isEmpty,
              Set(changes.keys).isSubset(of: Set(section.fields.map(\.id))), changes.values.allSatisfy(\.valid),
              requestID.range(of: "^[A-Za-z0-9._:-]{1,128}$", options: .regularExpression) != nil else { throw APIError.incompatible }
        struct Body: Encodable { let expectedVersion: Int; let changes: [String: ServerCredentialChange] }
        let result: ServerCredentialStatus = try await send(section.save.path, method: section.save.method, body: Wire.encoder().encode(Body(expectedVersion: version, changes: changes)), token: accessToken(), headers: ["Idempotency-Key": requestID])
        guard result.supported, result.version == version + 1 else { throw APIError.incompatible }
        return result
    }
}
