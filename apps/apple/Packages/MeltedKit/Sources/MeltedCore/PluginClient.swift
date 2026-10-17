// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

public protocol PluginClient: Sendable {
    func pluginCatalog() async throws -> PluginCatalog
    func sources() async throws -> [PluginSource]
    func saveSource(_ source: PluginSource?, plugin: PluginDescriptor, common: PluginConfiguration, configuration: PluginConfiguration, requestID: String) async throws -> PluginSource
    func removeSource(_ source: PluginSource) async throws
    func setSourceEnabled(_ source: PluginSource, enabled: Bool) async throws -> PluginSource
    func performAction(_ action: PluginAction, source: PluginSource, plugin: PluginDescriptor, input: PluginConfiguration, requestID: String) async throws -> PluginActionResult
    func collectionReceipt(_ id: String) async throws -> CollectionReceipt
}
extension APIClient: PluginClient {
    public func pluginCatalog() async throws -> PluginCatalog {
        let catalog: PluginCatalog = try await send("/v1/plugins", token: accessToken())
        guard catalog.supported else { throw APIError.incompatible }
        return catalog
    }
    public func sources() async throws -> [PluginSource] {
        struct Page: Decodable, Sendable { let sources: [PluginSource] }
        let page: Page = try await send("/v1/sources", token: accessToken())
        guard page.sources.count <= 100, page.sources.allSatisfy({ PluginIdentifiers.reference($0.id) }) else { throw APIError.incompatible }
        return page.sources
    }
    public func saveSource(_ source: PluginSource?, plugin: PluginDescriptor, common: PluginConfiguration, configuration: PluginConfiguration, requestID: String) async throws -> PluginSource {
        guard plugin.supported, plugin.available, source == nil || source?.plugin == plugin.id,
              case .string(let name) = common["name"], case .boolean(let enabled) = common["enabled"], case .number(let interval) = common["interval_seconds"], interval >= 300, interval <= 86400, interval.rounded() == interval,
              plugin.form.error(in: configuration) == nil else { throw APIError.incompatible }
        struct Body: Encodable { let name: String; let enabled: Bool; let intervalSeconds: Int; let plugin: String?; let configVersion: Int; let configuration: PluginConfiguration; let expectedVersion: Int? }
        if let source, !PluginIdentifiers.reference(source.id) { throw APIError.incompatible }
        return try await send(source.map { "/v1/sources/\($0.id)" } ?? "/v1/sources", method: source == nil ? "POST" : "PATCH",
                              body: Wire.encoder().encode(Body(name: name, enabled: enabled, intervalSeconds: Int(interval), plugin: source == nil ? plugin.id : nil, configVersion: plugin.configVersion, configuration: configuration, expectedVersion: source?.version)), token: accessToken(), headers: ["Idempotency-Key": requestID])
    }
    public func removeSource(_ source: PluginSource) async throws {
        guard PluginIdentifiers.reference(source.id) else { throw APIError.incompatible }
        struct Empty: Decodable, Sendable {}
        let _: Empty = try await send("/v1/sources/\(source.id)", method: "DELETE", token: accessToken(), headers: ["If-Match": "\"\(source.version)\""])
    }
    public func setSourceEnabled(_ source: PluginSource, enabled: Bool) async throws -> PluginSource {
        guard PluginIdentifiers.reference(source.id) else { throw APIError.incompatible }
        struct Body: Encodable { let enabled: Bool; let expectedVersion: Int }
        return try await send("/v1/sources/\(source.id)", method: "PATCH", body: Wire.encoder().encode(Body(enabled: enabled, expectedVersion: source.version)), token: accessToken())
    }
    public func performAction(_ action: PluginAction, source: PluginSource, plugin: PluginDescriptor, input: PluginConfiguration, requestID: String) async throws -> PluginActionResult {
        guard PluginIdentifiers.reference(source.id), plugin.id == source.plugin, plugin.supported, plugin.available, action.supported,
              plugin.actions.contains(where: { $0.id == action.id }), action.input.error(in: input) == nil else { throw APIError.incompatible }
        struct Body: Encodable { let expectedVersion: Int; let pluginVersion: String; let input: PluginConfiguration }
        return try await send("/v1/sources/\(source.id)/actions/\(action.id)", method: "POST", body: Wire.encoder().encode(Body(expectedVersion: source.version, pluginVersion: plugin.version, input: input)), token: accessToken(), headers: ["Idempotency-Key": requestID])
    }
    public func collectionReceipt(_ id: String) async throws -> CollectionReceipt {
        guard PluginIdentifiers.reference(id) else { throw APIError.incompatible }
        return try await send("/v1/receipts/\(id)", token: accessToken())
    }
}
