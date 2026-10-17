// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import Testing
import MeltedCore
@testable import Melted

private func settingsFixture<T: Decodable>(_ file: String, as: T.Type = T.self) throws -> T {
    var directory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    while directory.path != "/" {
        let path = directory.appendingPathComponent("contracts/fixtures/\(file).json")
        if FileManager.default.fileExists(atPath: path.path) { return try Wire.decoder().decode(T.self, from: Data(contentsOf: path)) }
        directory.deleteLastPathComponent()
    }
    throw CocoaError(.fileNoSuchFile)
}
private actor SettingsClient: PluginClient {
    let catalog: PluginCatalog
    var stored: [PluginSource]
    var failSave = false
    var actionCalls = 0
    var unknownActionStatus = false
    var holdNextRead = false
    var heldRead: CheckedContinuation<[PluginSource], Never>?
    var heldSources: [PluginSource] = []
    init() throws { catalog = try settingsFixture("plugin-settings"); stored = [try settingsFixture("plugin-source")] }
    func pluginCatalog() -> PluginCatalog { catalog }
    func sources() async -> [PluginSource] {
        if holdNextRead {
            holdNextRead = false; heldSources = stored
            return await withCheckedContinuation { heldRead = $0 }
        }
        return stored
    }
    func holdRead() { holdNextRead = true }
    func readIsHeld() -> Bool { heldRead != nil }
    func releaseRead() { heldRead?.resume(returning: heldSources); heldRead = nil }
    func conflict(_ value: Bool) { failSave = value }
    func unknown(_ value: Bool) { unknownActionStatus = value }
    func saveSource(_ source: PluginSource?, plugin: PluginDescriptor, common: PluginConfiguration, configuration: PluginConfiguration, requestID: String) throws -> PluginSource {
        if failSave { throw APIError.response(409, "version_conflict") }
        return stored[0]
    }
    func removeSource(_ source: PluginSource) { stored.removeAll { $0.id == source.id } }
    func setSourceEnabled(_ source: PluginSource, enabled: Bool) -> PluginSource { source }
    func performAction(_ action: PluginAction, source: PluginSource, plugin: PluginDescriptor, input: PluginConfiguration, requestID: String) async throws -> PluginActionResult {
        actionCalls += 1
        try await Task.sleep(for: .milliseconds(30))
        let status = unknownActionStatus ? "future" : "accepted"
        return try Wire.decoder().decode(PluginActionResult.self, from: Data("{\"status\":\"\(status)\",\"receipt_id\":\"run_example\"}".utf8))
    }
    func collectionReceipt(_ id: String) throws -> CollectionReceipt {
        try Wire.decoder().decode(CollectionReceipt.self, from: Data(#"{"id":"run_example","source_id":"src_example","state":"partial","counts":{"received":3,"inserted":2,"updated":0,"duplicates":0,"invalid":1},"error":null,"next_retry_at":null}"#.utf8))
    }
}
@Test @MainActor func lateReceiptRefreshCannotRestoreARemovedSource() async throws {
    let client = try SettingsClient(), model = SourceSettingsModel(client: client)
    await model.load()
    let source = try #require(model.sources.first)
    await client.holdRead()
    let refresh = Task { await model.refreshReceipt("run_example", sourceID: source.id) }
    for _ in 0..<100 {
        if await client.readIsHeld() { break }
        try await Task.sleep(for: .milliseconds(1))
    }
    #expect(await client.readIsHeld())
    await model.remove(source)
    await client.releaseRead()
    await refresh.value
    #expect(model.sources.isEmpty)
    #expect(model.receipts[source.id] == nil)
    #expect(model.notice == "来源及其原始数据已删除")
}
@Test @MainActor func sourceSettingsConflictRetainsLoadedSourceAndShowsRecovery() async throws {
    let client = try SettingsClient(), model = SourceSettingsModel(client: client)
    await model.load()
    let source = try #require(model.sources.first), plugin = try #require(model.catalog?.plugins.first)
    await client.conflict(true)
    let saved = await model.save(source, plugin: plugin, common: source.commonSettings, configuration: source.configuration, requestID: "test")
    #expect(!saved)
    #expect(model.sources.first?.id == source.id)
    #expect(model.error?.contains("刷新来源") == true)
    #expect(!model.busy)
}
@Test @MainActor func duplicateActionClicksDoNotSubmitTwiceAndPartialRemainsVisible() async throws {
    let client = try SettingsClient(), model = SourceSettingsModel(client: client)
    await model.load()
    let source = try #require(model.sources.first), plugin = try #require(model.catalog?.plugins.first), action = try #require(plugin.actions.first)
    let first = Task { await model.perform(action, source: source, plugin: plugin, input: [:], requestID: "same") }
    await Task.yield()
    let second = await model.perform(action, source: source, plugin: plugin, input: [:], requestID: "same")
    let completed = await first.value
    #expect(completed != second)
    #expect(await client.actionCalls == 1)
    #expect(model.receipts[source.id]?.state == "partial")
    #expect(model.receipts[source.id]?.counts.invalid == 1)
}
@Test @MainActor func unknownActionResultDoesNotReportSuccess() async throws {
    let client = try SettingsClient(), model = SourceSettingsModel(client: client)
    await model.load(); await client.unknown(true)
    let source = try #require(model.sources.first), plugin = try #require(model.catalog?.plugins.first), action = try #require(plugin.actions.first)
    #expect(await !model.perform(action, source: source, plugin: plugin, input: [:], requestID: "unknown"))
    #expect(model.notice == nil)
    #expect(model.error != nil)
}

private actor BatchClient: PluginClient {
    let catalog: PluginCatalog
    var stored: [String: PluginSource] = [:]
    var requests: [String: Int] = [:]
    init() throws { catalog = try settingsFixture("plugin-settings") }
    func pluginCatalog() -> PluginCatalog { catalog }
    func sources() -> [PluginSource] { Array(stored.values) }
    func saveSource(_ source: PluginSource?, plugin: PluginDescriptor, common: PluginConfiguration, configuration: PluginConfiguration, requestID: String) throws -> PluginSource {
        requests[requestID, default: 0] += 1
        if let existing = stored[requestID] { return existing }
        let base: PluginSource = try settingsFixture("plugin-source")
        var json = try #require(JSONSerialization.jsonObject(with: Wire.encoder().encode(base)) as? [String: Any])
        json["id"] = "src_" + requestID; json["name"] = common["name"]?.text
        json["configuration"] = try JSONSerialization.jsonObject(with: Wire.encoder().encode(configuration))
        let saved = try Wire.decoder().decode(PluginSource.self, from: JSONSerialization.data(withJSONObject: json))
        stored[requestID] = saved
        // Simulate a committed row whose HTTP response was lost.
        if requestID == "lost" { throw URLError(.timedOut) }
        return saved
    }
    func removeSource(_ source: PluginSource) {}
    func setSourceEnabled(_ source: PluginSource, enabled: Bool) -> PluginSource { source }
    func performAction(_ action: PluginAction, source: PluginSource, plugin: PluginDescriptor, input: PluginConfiguration, requestID: String) throws -> PluginActionResult { throw APIError.incompatible }
    func collectionReceipt(_ id: String) throws -> CollectionReceipt { throw APIError.incompatible }
}
@Test @MainActor func partialBatchRetryPreservesRowKeysAndDoesNotRepeatSuccessfulSubscriptions() async throws {
    let client = try BatchClient(), model = SourceSettingsModel(client: client)
    await model.load()
    let plugin = try #require(model.catalog?.plugins.first)
    let drafts = ["first", "lost", "last"].map { id in
        SourceBatchDraft(id: id, common: ["name": .string(id), "enabled": .boolean(true), "interval_seconds": .number(900)], configuration: ["route": .string("/bbc/" + id)])
    }
    let first = await model.addBatch(drafts, plugin: plugin)
    #expect(first.saved == ["first", "last"])
    #expect(Set(first.errors.keys) == ["lost"])
    #expect(model.sources.count == 2)
    let retry = await model.addBatch(drafts.filter { !first.saved.contains($0.id) }, plugin: plugin)
    #expect(retry.saved == ["lost"] && retry.errors.isEmpty)
    #expect(model.sources.count == 3)
    #expect(await client.stored.count == 3)
    #expect(await client.requests == ["first": 1, "lost": 2, "last": 1])
}
