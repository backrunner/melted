// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import Testing
import MeltedCore
@testable import Melted

private actor WorkspaceStub: WorkspaceClient {
    var restores = 0
    var logins = 0
    var changedIDs: [String] = []
    let item: Briefing
    init() throws {
        var root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        while !FileManager.default.fileExists(atPath: root.appendingPathComponent("contracts/fixtures/briefing.json").path), root.path != "/" {
            root.deleteLastPathComponent()
        }
        item = try Wire.decoder().decode(Briefing.self, from: Data(contentsOf: root.appendingPathComponent("contracts/fixtures/briefing.json")))
    }
    func discover() async throws -> (Discovery, ProcessingManifest) {
        try await Task.sleep(for: .milliseconds(10))
        let discovery = try Wire.decoder().decode(Discovery.self, from: Data(#"{"protocol":{"min":1,"max":1},"server_id":"test","api_base":"/v1","registration":"open","operator":{"name":"Test"},"processing_manifest_version":"1"}"#.utf8))
        let manifest = try Wire.decoder().decode(ProcessingManifest.self, from: Data(#"{"version":"1","description":"Test"}"#.utf8))
        return (discovery, manifest)
    }
    func restore(account: String) -> Bool { restores += 1; return true }
    func login(localOnly: Bool) async throws -> String {
        logins += 1
        try await Task.sleep(for: .milliseconds(50))
        return "test-account"
    }
    func browserStart(state: String, verifier: String) throws -> URL { throw APIError.incompatible }
    func browserExchange(callback: URL, state: String, verifier: String) throws -> String { throw APIError.incompatible }
    func seedDevelopmentSamples() {}
    func taxonomy() -> [Term] { [] }
    func list(_ filter: FilterSelection, cursor: String?) throws -> BriefingPage {
        var page = try Wire.decoder().decode(BriefingPage.self, from: Data(#"{"items":[],"query_hash":"test","total":1}"#.utf8))
        page.items = [item]
        return page
    }
    func detail(_ id: String) -> Briefing { var result = item; result.id = id; return result }
    func setState(_ id: String, state: ReadingState, mutationID: String) -> ReadingState {
        changedIDs.append(id)
        var result = state; result.version += 1
        return result
    }
    func logout() {}
}

@Test @MainActor func reopeningOrConcurrentStartupRestoresCredentialsOnlyOnce() async throws {
    let suite = "melted-test-\(UUID())"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    defaults.set("test-account", forKey: "accountID")
    defaults.set("test", forKey: "serverID")
    defaults.set("1", forKey: "manifestVersion")
    let stub = try WorkspaceStub()
    let model = WorkspaceModel(defaults: defaults, makeClient: { _ in stub })
    async let first: Void = model.bootstrap()
    async let second: Void = model.bootstrap()
    _ = await (first, second)
    await model.bootstrap()
    #expect(await stub.restores == 1)
    #expect(model.connected)
}

@Test @MainActor func concurrentLoginDoesNotRepeatIdentityAccess() async throws {
    let suite = "melted-test-\(UUID())"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let stub = try WorkspaceStub()
    let model = WorkspaceModel(defaults: defaults, makeClient: { _ in stub })
    await model.discover()
    model.acceptedServer = true
    async let first: Void = model.login()
    async let second: Void = model.login()
    _ = await (first, second)
    #expect(await stub.logins == 1)
}

@Test @MainActor func contextActionUpdatesClickedRowAndPreservesOpenArticle() async throws {
    let suite = "melted-test-\(UUID())"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let stub = try WorkspaceStub()
    let model = WorkspaceModel(defaults: defaults, makeClient: { _ in stub })
    await model.discover()
    var open = stub.item; open.id = "open"; open.state.saved = false
    var clicked = open; clicked.id = "clicked"
    model.items = [open, clicked]
    model.detail = open
    model.selectedID = open.id
    await model.updateState(for: clicked, saved: true)
    #expect(await stub.changedIDs == ["clicked"])
    #expect(model.detail?.id == "open")
    #expect(model.detail?.state.saved == false)
    #expect(model.items.last?.state.saved == true)
}

@Test @MainActor func cancelledSelectionCannotMarkAnotherArticleRead() async throws {
    let suite = "melted-test-\(UUID())"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let stub = try WorkspaceStub()
    let model = WorkspaceModel(defaults: defaults, makeClient: { _ in stub })
    await model.discover()
    model.selectedID = "first"
    let selection = Task { await model.select() }
    try await Task.sleep(for: .milliseconds(40))
    model.selectedID = "second"
    selection.cancel()
    await selection.value
    #expect(await stub.changedIDs.isEmpty)
}
