// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import Testing
import MeltedCore
@testable import Melted

/// Failures the stub can raise, chosen by test so no non-Sendable error crosses the actor.
enum StubFailure { case cannotConnect, sessionExpired }

private actor WorkspaceStub: WorkspaceClient {
    var restores = 0
    var logins = 0
    var changedIDs: [String] = []
    var credentialLogins = 0
    /// When set, discovery and list calls fail instead of returning data.
    var discoverFailure: StubFailure?
    var listFailure: StubFailure?
    var syncPage: SyncPage?
    var syncPages: [Int: SyncPage] = [:]
    var syncRequests: [Int] = []
    var syncFailure: StubFailure?
    var items: [Briefing] = []
    func failDiscovery(_ failure: StubFailure?) { discoverFailure = failure }
    func failListing(_ failure: StubFailure?) { listFailure = failure }
    func serve(_ page: SyncPage) { syncPage = page }
    func servePages(_ pages: [Int: SyncPage]) { syncPages = pages }
    func failSync(_ failure: StubFailure?) { syncFailure = failure }
    func serveItems(_ values: [Briefing]) { items = values }
    let auth: String
    let item: Briefing
    init(auth: String = #"{"version":1,"methods":["key"],"key_algorithm":"P-256"}"#) throws {
        self.auth = auth
        var root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        while !FileManager.default.fileExists(atPath: root.appendingPathComponent("contracts/fixtures/briefing.json").path), root.path != "/" {
            root.deleteLastPathComponent()
        }
        item = try Wire.decoder().decode(Briefing.self, from: Data(contentsOf: root.appendingPathComponent("contracts/fixtures/briefing.json")))
    }
    func pluginPresets(_ plugin: PluginDescriptor, query: String, cursor: String?) throws -> PluginPresetPage { throw APIError.incompatible }
    func resolvePreset(_ preset: PluginPreset, plugin: PluginDescriptor, input: PluginConfiguration) throws -> PluginPresetResolution { throw APIError.incompatible }
    func pluginCatalog() async throws -> PluginCatalog { throw APIError.incompatible }
    func sources() async throws -> [PluginSource] { throw APIError.incompatible }
    func saveSource(_ source: PluginSource?, plugin: PluginDescriptor, common: PluginConfiguration, configuration: PluginConfiguration, requestID: String) async throws -> PluginSource { throw APIError.incompatible }
    func removeSource(_ source: PluginSource) async throws { throw APIError.incompatible }
    func setSourceEnabled(_ source: PluginSource, enabled: Bool) async throws -> PluginSource { throw APIError.incompatible }
    func performAction(_ action: PluginAction, source: PluginSource, plugin: PluginDescriptor, input: PluginConfiguration, requestID: String) async throws -> PluginActionResult { throw APIError.incompatible }
    func collectionReceipt(_ id: String) async throws -> CollectionReceipt { throw APIError.incompatible }
    func discover() async throws -> (Discovery, ProcessingManifest) {
        try await Task.sleep(for: .milliseconds(10))
        if let discoverFailure { throw Self.error(discoverFailure) }
        let discovery = try Wire.decoder().decode(Discovery.self, from: Data(#"{"protocol":{"min":1,"max":1},"server_id":"test","api_base":"/v1","registration":"open","operator":{"name":"Test"},"processing_manifest_version":"1","auth":{"version":1,"methods":["key"],"key_algorithm":"P-256"}}"#.utf8))
        var negotiated = discovery
        negotiated.auth = try Wire.decoder().decode(Discovery.Authentication.self, from: Data(auth.utf8))
        let manifest = try Wire.decoder().decode(ProcessingManifest.self, from: Data(#"{"version":"1","description":"Test"}"#.utf8))
        return (negotiated, manifest)
    }
    func restore(account: String) -> Bool { restores += 1; return true }
    func login(localOnly: Bool) async throws -> String {
        logins += 1
        try await Task.sleep(for: .milliseconds(50))
        return "test-account"
    }
    func credentialLogin(_ credential: LoginCredential) async throws -> String {
        credentialLogins += 1
        try await Task.sleep(for: .milliseconds(50))
        return "managed-account"
    }
    func browserStart(state: String, verifier: String) throws -> URL { throw APIError.incompatible }
    func browserExchange(callback: URL, state: String, verifier: String) throws -> String { throw APIError.incompatible }
    func taxonomy() -> [Term] { [] }
    func list(_ filter: FilterSelection, cursor: String?) throws -> BriefingPage {
        if let listFailure { throw Self.error(listFailure) }
        var page = try Wire.decoder().decode(BriefingPage.self, from: Data(#"{"items":[],"query_hash":"test","total":1}"#.utf8))
        page.items = items.isEmpty ? [item] : items
        page.total = page.items.count
        return page
    }
    func syncAnchor() throws -> Int { syncPage?.nextCursor ?? 0 }
    func syncChanges(after: Int) throws -> SyncPage {
        syncRequests.append(after)
        if let syncFailure { throw Self.error(syncFailure) }
        if let page = syncPages[after] { return page }
        if let syncPage, syncPage.nextCursor > after { return syncPage }
        return SyncPage(changes: [], nextCursor: after, hasMore: false)
    }
    private static func error(_ failure: StubFailure) -> Error {
        switch failure {
        case .cannotConnect: URLError(.cannotConnectToHost)
        case .sessionExpired: APIError.response(401, "unauthorized")
        }
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

@Test @MainActor func negotiatedCredentialsRequireTrustAndDoNotAccessIdentityKeys() async throws {
    let suite = "melted-test-\(UUID())"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let stub = try WorkspaceStub(auth: #"{"version":1,"methods":["key","password","api_key"],"preferred":"password","key_algorithm":"P-256"}"#)
    let model = WorkspaceModel(defaults: defaults, makeClient: { _ in stub })
    await model.discover()
    #expect(model.authenticationMethod == .password)
    let credential = LoginCredential.password(username: "alice", password: "never-persist-me")
    await model.login(credential: credential)
    #expect(await stub.credentialLogins == 0)
    model.acceptedServer = true
    await model.login(credential: .apiKey("wrong-method"))
    #expect(await stub.credentialLogins == 0)
    async let first: Void = model.login(credential: credential)
    async let second: Void = model.login(credential: credential)
    _ = await (first, second)
    #expect(await stub.credentialLogins == 1)
    #expect(await stub.logins == 0)
    #expect(model.connected)
    #expect(model.identityStorage == "password")
    #expect(!String(describing: defaults.persistentDomain(forName: suite)).contains("never-persist-me"))
    await model.logout()
    #expect(model.authenticationMethod == nil)
    await model.discover()
    model.selectAuthenticationMethod(.apiKey)
    #expect(model.authenticationMethod == .apiKey)
    model.selectAuthenticationMethod(.browser)
    #expect(model.authenticationMethod == .apiKey)
    model.resetConnection()
    #expect(model.authenticationMethod == nil)
}

@Test @MainActor func unsupportedAuthenticationNeverFallsBackToKeychain() async throws {
    let suite = "melted-test-\(UUID())"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let stub = try WorkspaceStub(auth: #"{"version":1,"methods":["future_method"]}"#)
    let model = WorkspaceModel(defaults: defaults, makeClient: { _ in stub })
    await model.discover()
    model.acceptedServer = true
    await model.login()
    #expect(model.authenticationMethod == nil)
    #expect(await stub.logins == 0)
    #expect(await stub.credentialLogins == 0)
}


@Test @MainActor func arrivedContentIsMarkedAndStateChangesAreNot() async throws {
    let suite = "melted-test-\(UUID())"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let stub = try WorkspaceStub()
    let model = WorkspaceModel(defaults: defaults, makeClient: { _ in stub })
    await model.discover(); model.acceptedServer = true
    await model.login()
    var known = stub.item; known.id = "known"
    var fresh = stub.item; fresh.id = "fresh"
    fresh.updatedAt = .now
    await stub.serveItems([known])
    await model.pollSync()
    #expect(model.isArrived("fresh") == false)

    // An upsert whose entity shows up in the list is drawn attention to.
    await stub.serve(SyncPage(changes: [SyncChange(sequence: 9, entityId: "fresh", kind: "upsert")], nextCursor: 9, hasMore: false))
    await stub.serveItems([fresh, known])
    await model.pollSync()
    #expect(model.isArrived("fresh"))
    #expect(model.isArrived("known") == false)

    // A read/saved change must not trigger an arrival pass, even if the list is stale:
    // a row that only the arrival pass could pick up stays unmarked.
    var sneaky = stub.item; sneaky.id = "sneaky"; sneaky.updatedAt = .now
    await stub.serve(SyncPage(changes: [SyncChange(sequence: 10, entityId: "known", kind: "state")], nextCursor: 10, hasMore: false))
    await stub.serveItems([sneaky, fresh, known])
    await model.pollSync()
    #expect(model.isArrived("sneaky") == false)
}

@Test @MainActor func connectionFailuresAreDescribedForTheReader() async throws {
    let cases: [(StubFailure, WorkspaceFailure.Kind)] = [
        (.cannotConnect, .cannotReach),
        (.sessionExpired, .sessionExpired),
    ]
    for (stubFailure, expectation) in cases {
        let suite = "melted-test-\(UUID())"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let stub = try WorkspaceStub()
        await stub.failDiscovery(stubFailure)
        let model = WorkspaceModel(defaults: defaults, makeClient: { _ in stub })
        await model.discover()
        let failure = try #require(model.failure)
        #expect(failure.kind == expectation)
        #expect(!failure.message.isEmpty)
        #expect(!failure.guidance.isEmpty)
        #expect(model.connecting == false)
    }
}

@Test @MainActor func delayedDeliveryUsesServerChangesAndPreservesReading() async throws {
    let suite = "melted-test-\(UUID())"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let stub = try WorkspaceStub()
    let model = WorkspaceModel(defaults: defaults, makeClient: { _ in stub })
    await model.discover(); model.acceptedServer = true; await model.login()
    let opened = stub.item
    model.selectedID = opened.id; model.detail = opened
    var tail = opened; tail.id = "loaded-tail"
    model.items.append(tail); model.nextCursor = "keep-pagination"
    var delayed = opened; delayed.id = "delayed"
    delayed.updatedAt = .now.addingTimeInterval(-86400)
    var unrelated = opened; unrelated.id = "not-in-change-log"
    await stub.serveItems([delayed, unrelated])
    await stub.serve(SyncPage(changes: [SyncChange(sequence: 9, entityId: delayed.id, kind: "upsert")], nextCursor: 9, hasMore: false))
    await model.pollSync()
    #expect(model.isArrived(delayed.id))
    #expect(!model.isArrived(unrelated.id))
    #expect(model.items.contains { $0.id == tail.id })
    #expect(model.nextCursor == "keep-pagination")
    #expect(model.selectedID == opened.id && model.detail?.id == opened.id)
}

@Test @MainActor func failedArrivalRefreshRetriesTheSameCursor() async throws {
    let suite = "melted-test-\(UUID())"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let stub = try WorkspaceStub()
    let model = WorkspaceModel(defaults: defaults, makeClient: { _ in stub })
    await model.discover(); model.acceptedServer = true; await model.login()
    var fresh = stub.item; fresh.id = "fresh"
    await stub.serveItems([fresh])
    await stub.serve(SyncPage(changes: [SyncChange(sequence: 9, entityId: fresh.id, kind: "upsert")], nextCursor: 9, hasMore: false))
    await stub.failListing(.cannotConnect)
    await model.pollSync()
    #expect(!model.isArrived(fresh.id))
    #expect(model.banner != nil && model.connected)
    await stub.failListing(nil)
    await model.pollSync()
    #expect(model.isArrived(fresh.id))
    #expect(await stub.syncRequests == [0, 0])
    await model.pollSync()
    #expect(await stub.syncRequests == [0, 0, 9])
}

@Test @MainActor func pagedArrivalsAccumulateAndExistingRowsRetrigger() async throws {
    let suite = "melted-test-\(UUID())"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let stub = try WorkspaceStub()
    let model = WorkspaceModel(defaults: defaults, makeClient: { _ in stub })
    await model.discover(); model.acceptedServer = true; await model.login()
    let known = stub.item
    var fresh = known; fresh.id = "fresh"
    await stub.serveItems([fresh, known])
    await stub.servePages([
        0: SyncPage(changes: [SyncChange(sequence: 1, entityId: fresh.id, kind: "upsert")], nextCursor: 1, hasMore: true),
        1: SyncPage(changes: [SyncChange(sequence: 2, entityId: known.id, kind: "upsert")], nextCursor: 2, hasMore: false)
    ])
    await model.pollSync()
    #expect(model.arrivalSequences == [fresh.id: 1, known.id: 2])
    await stub.serve(SyncPage(changes: [SyncChange(sequence: 3, entityId: known.id, kind: "upsert")], nextCursor: 3, hasMore: false))
    await model.pollSync()
    #expect(model.arrivalSequences == [fresh.id: 1, known.id: 3])
}

@Test @MainActor func expiredSessionDuringSyncReturnsToLogin() async throws {
    let suite = "melted-test-\(UUID())"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let stub = try WorkspaceStub()
    let model = WorkspaceModel(defaults: defaults, makeClient: { _ in stub })
    await model.discover(); model.acceptedServer = true; await model.login()
    await stub.failSync(.sessionExpired)
    await model.pollSync()
    #expect(!model.connected)
    #expect(model.failure?.kind == .sessionExpired)
}

@Test @MainActor func refreshFailureKeepsContentAndOnlyRaisesABanner() async throws {
    let suite = "melted-test-\(UUID())"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let stub = try WorkspaceStub()
    let model = WorkspaceModel(defaults: defaults, makeClient: { _ in stub })
    await model.discover(); model.acceptedServer = true
    await model.login()
    #expect(model.items.count == 1)

    await stub.failListing(.cannotConnect)
    await model.reload()
    #expect(model.items.count == 1)          // loaded content is kept
    #expect(model.failure == nil)            // the reading surface is not taken over
    #expect(model.banner != nil)             // the user is still told
    model.dismissBanner()
    #expect(model.banner == nil)
}

@Test @MainActor func expiredSessionReturnsToConnectionFlow() async throws {
    let suite = "melted-test-\(UUID())"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let stub = try WorkspaceStub()
    let model = WorkspaceModel(defaults: defaults, makeClient: { _ in stub })
    await model.discover(); model.acceptedServer = true
    await model.login()
    #expect(model.connected)

    await stub.failListing(.sessionExpired)
    await model.reload()
    #expect(model.connected == false)
    #expect(model.failure?.kind == .sessionExpired)
    #expect(model.items.isEmpty)
    #expect(defaults.string(forKey: "accountID") == nil)
    #expect(model.authenticationMethod == .key)
    #expect(model.acceptedServer == false)

    // Reauthentication stays available without mistaking session expiry for unsupported auth.
    await stub.failListing(nil)
    model.acceptedServer = true
    await model.login()
    #expect(model.connected)
    #expect(model.failure == nil)
    #expect(await stub.logins == 2)
}

@Test @MainActor func expiredSessionPreservesTheSelectedSupportedLoginMethod() async throws {
    let suite = "melted-test-\(UUID())"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let stub = try WorkspaceStub(auth: #"{"version":1,"methods":["password","api_key"],"preferred":"password"}"#)
    let model = WorkspaceModel(defaults: defaults, makeClient: { _ in stub })
    await model.discover()
    model.selectAuthenticationMethod(.apiKey)
    model.acceptedServer = true
    await model.login(credential: .apiKey("test-key"))
    await stub.failListing(.sessionExpired)
    await model.reload()
    #expect(!model.connected)
    #expect(!model.acceptedServer)
    #expect(model.authenticationMethod == .apiKey)
    #expect(model.discovery?.auth.supportedMethods == [.password, .apiKey])
    #expect(model.failure?.kind == .sessionExpired)
    #expect(await stub.logins == 0)
}

@Test @MainActor func deletedGeneratedContentIsRemovedFromLoadedPagesAndOpenArticle() async throws {
    let suite = "melted-test-\(UUID())"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let stub = try WorkspaceStub(), model = WorkspaceModel(defaults: defaults, makeClient: { _ in stub })
    await model.discover(); model.acceptedServer = true; await model.login()
    let opened = stub.item
    model.selectedID = opened.id; model.detail = opened
    var tail = opened; tail.id = "deleted-tail"; model.items.append(tail)
    await stub.serve(SyncPage(changes: [SyncChange(sequence: 1, entityId: opened.id, kind: "delete"), SyncChange(sequence: 2, entityId: tail.id, kind: "delete")], nextCursor: 2, hasMore: false))
    await model.pollSync()
    #expect(model.items.isEmpty); #expect(model.detail == nil); #expect(model.selectedID == nil)
    await model.pollSync(); #expect(await stub.syncRequests == [0, 2])
}
@Test @MainActor func deleteThenRegenerateUsesTheLatestChangeForTheSameContent() async throws {
    let suite = "melted-test-\(UUID())"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let stub = try WorkspaceStub(), model = WorkspaceModel(defaults: defaults, makeClient: { _ in stub })
    await model.discover(); model.acceptedServer = true; await model.login()
    let item = stub.item
    await stub.serve(SyncPage(changes: [SyncChange(sequence: 1, entityId: item.id, kind: "delete"), SyncChange(sequence: 2, entityId: item.id, kind: "upsert")], nextCursor: 2, hasMore: false))
    await model.pollSync(); #expect(model.items.contains { $0.id == item.id }); #expect(model.arrivalSequences[item.id] == 2)
}
