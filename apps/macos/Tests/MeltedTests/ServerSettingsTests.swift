// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import Testing
import MeltedCore
@testable import Melted

private func remoteCatalog(processing: Bool = false) throws -> ServerSettingsCatalog {
    var directory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    while directory.path != "/" {
        let path = directory.appendingPathComponent(processing ? "contracts/fixtures/server-settings-processing.json" : "contracts/fixtures/server-settings.json")
        if FileManager.default.fileExists(atPath: path.path) { return try Wire.decoder().decode(ServerSettingsCatalog.self, from: Data(contentsOf: path)) }
        directory.deleteLastPathComponent()
    }
    throw CocoaError(.fileNoSuchFile)
}
private actor RemoteSettingsClient: ServerSettingsClient {
    let catalog: ServerSettingsCatalog
    var current: ServerSettingsState
    var requests: [String] = []
    var fail = false
    var unknown = false
    init() throws {
        catalog = try remoteCatalog()
        current = try Self.state(version: 0, values: catalog.sections[0].form.defaults)
    }
    static func state(version: Int, values: PluginConfiguration, application: String = "stored") throws -> ServerSettingsState {
        let data = try Wire.encoder().encode(values)
        return try Wire.decoder().decode(ServerSettingsState.self, from: Data("{\"schema_version\":1,\"version\":\(version),\"values\":\(String(decoding: data, as: UTF8.self)),\"application\":\"\(application)\"}".utf8))
    }
    func serverSettingsCatalog() -> ServerSettingsCatalog { catalog }
    func serverSettings(_ section: ServerSettingsSection) -> ServerSettingsState { current }
    func setFailure(_ value: Bool) { fail = value }
    func setUnknown() { unknown = true }
    func externallyUpdate() throws { current = try Self.state(version: 1, values: ["output": .string("另一台设备的要求")]) }
    func requestIDs() -> [String] { requests }
    func saveServerSettings(_ section: ServerSettingsSection, values: PluginConfiguration, version: Int, requestID: String) async throws -> ServerSettingsState {
        requests.append(requestID)
        try await Task.sleep(for: .milliseconds(30))
        if fail { throw APIError.response(503, "unavailable") }
        guard current.version == version else { throw APIError.response(409, "settings_conflict") }
        current = try Self.state(version: version + 1, values: values, application: unknown ? "future" : "stored")
        return current
    }
}
@Test @MainActor func serverSettingsConflictKeepsInputAndLetsUserCompareLatestBeforeSaving() async throws {
    let client = try RemoteSettingsClient(), section = try remoteCatalog().sections[0]
    let model = ServerSettingsModel(client: client, section: section)
    await model.load()
    model.values["output"] = .string("我的编辑")
    try await client.externallyUpdate()
    await model.save()
    #expect(model.conflict)
    #expect(model.values["output"] == .string("我的编辑"))
    await model.refreshBase()
    #expect(!model.conflict)
    #expect(model.comparison?["output"] == .string("另一台设备的要求"))
    #expect(model.values["output"] == .string("我的编辑"))
    await model.save()
    #expect(!model.dirty)
    #expect(model.state?.version == 2)
    #expect(model.state?.statusLabel == "已保存到服务器")
}
@Test @MainActor func serverSettingsDuplicateSaveIsSuppressedAndRetryReusesTheSameRequest() async throws {
    let client = try RemoteSettingsClient(), section = try remoteCatalog().sections[0]
    let model = ServerSettingsModel(client: client, section: section)
    await model.load(); model.values["output"] = .string("先给摘要")
    await client.setFailure(true)
    let first = Task { await model.save() }
    try await Task.sleep(for: .milliseconds(5)); await model.save(); await first.value
    #expect(await client.requestIDs().count == 1)
    #expect(model.dirty)
    await client.setFailure(false); await model.save()
    let ids = await client.requestIDs()
    #expect(ids.count == 2 && ids[0] == ids[1])
    #expect(!model.dirty)
}
@Test @MainActor func unknownServerSettingsResponseDoesNotReportSaved() async throws {
    let client = try RemoteSettingsClient(), section = try remoteCatalog().sections[0]
    let model = ServerSettingsModel(client: client, section: section)
    await model.load(); model.values["classification"] = .string("文化与生活")
    await client.setUnknown(); await model.save()
    #expect(model.dirty)
    #expect(model.state?.version == 0)
    #expect(model.error != nil)
}

private actor WorkflowSettingsClient: ServerSettingsWorkflowClient {
    let catalog: ServerSettingsCatalog
    var phase = "stored"
    var fail = false
    var ids: [String] = []
    init() throws { catalog = try remoteCatalog(processing: true) }
    func serverSettingsCatalog() -> ServerSettingsCatalog { catalog }
    func serverSettings(_ section: ServerSettingsSection) throws -> ServerSettingsState { try RemoteSettingsClient.state(version: 1, values: section.form.defaults) }
    func saveServerSettings(_ section: ServerSettingsSection, values: PluginConfiguration, version: Int, requestID: String) throws -> ServerSettingsState { try RemoteSettingsClient.state(version: version + 1, values: values) }
    func setFailure(_ value: Bool) { fail = value }
    func setPhase(_ value: String) { phase = value }
    func requestIDs() -> [String] { ids }
    func serverProcessingStatus(_ section: ServerSettingsSection, version: Int) throws -> ServerProcessingStatus {
        if fail { throw URLError(.timedOut) }
        return try Wire.decoder().decode(ServerProcessingStatus.self, from: Data("{\"configured\":true,\"version\":\(version),\"phase\":\"\(phase)\",\"jobs\":{\"queued\":0,\"running\":0,\"failed\":0,\"published\":0,\"filtered\":0,\"held\":0}}".utf8))
    }
    func performServerSettingsAction(_ section: ServerSettingsSection, action: ServerSettingsWorkflow.Action, version: Int, requestID: String) throws -> ServerProcessingStatus {
        ids.append(requestID)
        if fail { throw URLError(.timedOut) }
        phase = action.id == "compile" ? "pending" : "active"
        return try serverProcessingStatus(section, version: version)
    }
}
@Test @MainActor func workflowRetryKeepsIdentityAndPollingPreservesEditsAndClearsRecoveredErrors() async throws {
    let client = try WorkflowSettingsClient(), section = try remoteCatalog(processing: true).sections[0]
    let model = ServerSettingsModel(client: client, section: section)
    await model.load()
    let compile = try #require(section.workflow?.actions.first(where: { $0.id == "compile" }))
    await client.setFailure(true); await model.perform(compile)
    #expect(model.processing?.phase == "stored"); #expect(model.error != nil)
    await client.setFailure(false); await model.perform(compile)
    let ids = await client.requestIDs(); #expect(ids.count == 2 && ids[0] == ids[1])
    model.values["output"] = .string("未保存的编辑")
    await client.setPhase("ready"); await model.pollWorkflow()
    #expect(model.processing?.phase == "ready"); #expect(model.values["output"] == .string("未保存的编辑"))
    let activate = try #require(section.workflow?.actions.first(where: { $0.id == "activate" }))
    await model.perform(activate); #expect(await client.requestIDs().count == 2)
    await client.setFailure(true); await model.pollWorkflow(); #expect(model.error != nil)
    await client.setFailure(false); await model.pollWorkflow(); #expect(model.error == nil)
    #expect(model.dirty)
}
