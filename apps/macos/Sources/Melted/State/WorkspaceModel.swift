// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import SwiftUI
import MeltedCore

@MainActor
final class WorkspaceModel: ObservableObject {
    @Published var serverAddress: String
    @Published var localCredentialOption = false
    @Published var identityStorage: String
    @Published private(set) var authenticationMethod: AuthenticationMethod?
    private let browserAuthentication = BrowserAuthentication()
    @Published var discovery: Discovery?
    @Published var manifest: ProcessingManifest?
    @Published var acceptedServer = false
    @Published var connected = false
    @Published var connecting = false
    @Published var loading = false
    @Published var loadingDetail = false
    @Published var mutating = false
    /// Classified failure for the connection flow; surface errors replace the whole screen,
    /// inline ones sit next to the control that failed.
    @Published var failure: WorkspaceFailure?
    /// Failures that happen while already reading keep the loaded content and only raise a banner.
    @Published var banner: String?
    /// Server change sequences retrigger feedback even when an existing row is updated.
    @Published private(set) var arrivalSequences: [String: Int] = [:]
    @Published var filter = FilterSelection()
    @Published var terms: [Term] = []
    @Published var items: [Briefing] = []
    @Published var selectedID: String?
    @Published var detail: Briefing?
    @Published var nextCursor: String?
    @Published var total = 0
    @Published var searchRequest = 0
    private var client: (any WorkspaceClient)?
    var pluginClient: (any PluginClient)? { connected ? client : nil }
    private let defaults: UserDefaults
    private let makeClient: (URL) -> any WorkspaceClient
    private var queryGeneration = UUID()
    private var detailGeneration = UUID()
    private var connectionGeneration = UUID()
    private var hasBootstrapped = false
    private var syncTask: Task<Void, Never>?
    private var syncCursor: Int?
    private var arrivalTask: Task<Void, Never>?
    private var syncGeneration = UUID()
    private var syncing = false

    init(defaults: UserDefaults = .standard, makeClient: @escaping (URL) -> any WorkspaceClient = { APIClient(url: $0) }) {
        self.defaults = defaults
        self.makeClient = makeClient
        serverAddress = defaults.string(forKey: "serverAddress") ?? "http://127.0.0.1:8421"
        identityStorage = defaults.string(forKey: "identityStorage") ?? "session"
    }

    func resetConnection() {
        guard !connecting else { return }
        connectionGeneration = UUID()
        client = nil; discovery = nil; manifest = nil
        acceptedServer = false; localCredentialOption = false; failure = nil; banner = nil
        authenticationMethod = nil
    }

    func discover() async {
        guard !connecting else { return }
        let generation = UUID(); connectionGeneration = generation
        connecting = true; failure = nil; discovery = nil; manifest = nil; acceptedServer = false
        client = nil; authenticationMethod = nil; localCredentialOption = false
        defer { if connectionGeneration == generation { connecting = false } }
        do {
            let url = try APIClient.validatedURL(serverAddress)
            let candidate = makeClient(url)
            let (d, m) = try await candidate.discover()
            guard generation == connectionGeneration else { return }
            client = candidate; discovery = d; manifest = m
            authenticationMethod = d.auth?.preferredMethod
        } catch {
            guard generation == connectionGeneration else { return }
            failure = classify(error, source: .discovery)
        }
    }
    func bootstrap() async {
        // A reopened window must not start another Keychain restore or replace the active client.
        guard !hasBootstrapped else { return }
        hasBootstrapped = true
        guard defaults.string(forKey: "accountID") != nil else { return }
        await discover()
        guard let client, let discovery, let account = defaults.string(forKey: "accountID"),
              defaults.string(forKey: "serverID") == discovery.serverId,
              defaults.string(forKey: "manifestVersion") == discovery.processingManifestVersion else { return }
        connecting = true
        defer { connecting = false }
        do {
            if try await client.restore(account: account) {
                acceptedServer = true; connected = true; await loadInitial(); startSync()
            }
        } catch {
            let failure = classify(error, source: .restore)
            // A rejected session is dropped; a transient failure (keychain, network) keeps the
            // stored account so retrying does not make the user redo the whole connection flow.
            if failure.kind == .sessionExpired { defaults.removeObject(forKey: "accountID") }
            self.failure = failure
        }
    }
    func selectAuthenticationMethod(_ method: AuthenticationMethod) {
        guard !connecting, discovery?.auth?.supportedMethods.contains(method) == true, authenticationMethod != method else { return }
        authenticationMethod = method; failure = nil; localCredentialOption = false
    }
    func login(localOnly: Bool = false, credential: LoginCredential? = nil) async {
        guard !connecting, acceptedServer, let client, let discovery, let method = authenticationMethod,
              discovery.auth?.supportedMethods.contains(method) == true else { return }
        if method == .password || method == .apiKey {
            guard credential?.method == method else { return }
        }
        connecting = true; failure = nil; localCredentialOption = false
        defer { connecting = false }
        do {
            let account: String
            if method == .browser {
                let state = IdentityProof.random(), verifier = IdentityProof.random()
                let url = try await client.browserStart(state: state, verifier: verifier)
                let callback = try await browserAuthentication.authenticate(url)
                account = try await client.browserExchange(callback: callback, state: state, verifier: verifier)
                identityStorage = "browser"
            } else if method == .key {
                let localPreference = "localIdentity|\(serverAddress)|\(discovery.serverId)"
                let useLocal = localOnly || defaults.bool(forKey: localPreference)
                account = try await client.login(localOnly: useLocal)
                defaults.set(useLocal, forKey: localPreference)
                identityStorage = useLocal ? "local" : "keychain"
            } else if let credential {
                account = try await client.credentialLogin(credential)
                identityStorage = method.rawValue
            } else {
                return
            }
            defaults.set(identityStorage, forKey: "identityStorage")
            defaults.set(serverAddress, forKey: "serverAddress")
            defaults.set(discovery.serverId, forKey: "serverID")
            defaults.set(discovery.processingManifestVersion, forKey: "manifestVersion")
            defaults.set(account, forKey: "accountID")
            connected = true; await loadInitial(); startSync()
        } catch {
            failure = classify(error, source: .login(method))
        }
    }
    func loadInitial() async {
        guard let client else { return }
        // Establish the boundary before loading content, not twelve seconds later:
        // deliveries between the first page and the first poll must not be skipped.
        do { syncCursor = try await client.syncAnchor() }
        catch { syncCursor = 0 }
        do { terms = try await client.taxonomy() } catch { report(error) }
        await reload()
    }
    func reload() async {
        guard connected, let client else { return }
        let generation = UUID(); queryGeneration = generation; let selection = filter
        loading = true; failure = nil
        defer { if queryGeneration == generation { loading = false } }
        do {
            try await Task.sleep(for: .milliseconds(180))
            let page = try await client.list(selection, cursor: nil)
            try Task.checkCancellation()
            guard generation == queryGeneration, selection == filter else { return }
            items = page.items; nextCursor = page.nextCursor; total = page.total
            if let selectedID, !items.contains(where: { $0.id == selectedID }) { self.selectedID = nil; detail = nil }
        } catch is CancellationError {} catch {
            if generation == queryGeneration { report(error) }
        }
    }
    func loadMore() async {
        guard let client, let cursor = nextCursor, !loading else { return }
        let generation = queryGeneration; let selection = filter; loading = true
        defer { if generation == queryGeneration { loading = false } }
        do {
            let page = try await client.list(selection, cursor: cursor)
            guard generation == queryGeneration, selection == filter else { return }
            let ids = Set(items.map(\.id)); items += page.items.filter { !ids.contains($0.id) }; nextCursor = page.nextCursor
        } catch {
            if generation == queryGeneration { report(error) }
        }
    }
    func select() async {
        let generation = UUID(); detailGeneration = generation
        guard let client, let id = selectedID else { detail = nil; loadingDetail = false; return }
        detail = nil; loadingDetail = true
        defer { if generation == detailGeneration { loadingDetail = false } }
        do {
            let d = try await client.detail(id); try Task.checkCancellation()
            guard generation == detailGeneration, selectedID == id else { return }
            detail = d
            loadingDetail = false
            if !d.state.read {
                try await Task.sleep(for: .milliseconds(300))
                try Task.checkCancellation()
                guard generation == detailGeneration, selectedID == id, detail?.id == id else { return }
                await updateState(for: d, read: true)
            }
        } catch is CancellationError {} catch {
            if generation == detailGeneration { report(error) }
        }
    }
    func updateState(saved: Bool? = nil, read: Bool? = nil) async {
        guard let detail else { return }
        await updateState(for: detail, saved: saved, read: read)
    }
    func updateState(for item: Briefing, saved: Bool? = nil, read: Bool? = nil) async {
        guard let client, !mutating else { return }
        // Context actions always target their row, even while a different article is open.
        let current = items.first(where: { $0.id == item.id }) ?? item
        mutating = true; defer { mutating = false }
        var state = current.state; if let saved { state.saved = saved }; if let read { state.read = read }
        do {
            let result = try await client.setState(current.id, state: state, mutationID: UUID().uuidString)
            if detail?.id == current.id { detail?.state = result }
            if let index = items.firstIndex(where: { $0.id == current.id }) { items[index].state = result }
            if (filter.view == "saved" && !result.saved) || (filter.view == "unread" && result.read) {
                items.removeAll { $0.id == current.id }; total = max(0, total - 1)
                if selectedID == current.id { selectedID = nil; detail = nil }
            }
        } catch { report(error) }
    }
    func logout() async {
        guard let client else { return }
        do {
            try await client.logout()
            queryGeneration = UUID(); detailGeneration = UUID(); connectionGeneration = UUID()
            connected = false; items = []; terms = []; detail = nil; selectedID = nil; filter = .init()
            discovery = nil; manifest = nil; acceptedServer = false; failure = nil; banner = nil
            authenticationMethod = nil; localCredentialOption = false
            arrivalSequences = [:]; syncCursor = nil
            defaults.removeObject(forKey: "accountID")
            stopSync()
        } catch { report(error) }
    }
    func dismissBanner() { banner = nil }

    func termName(_ id: String?) -> String { terms.first { $0.id == id }?.name ?? "" }
    func toggle(_ id: String, kind: String) {
        switch kind {
        case "category": toggleID(id, in: &filter.categoryIds)
        case "tag": toggleID(id, in: &filter.tagIds)
        case "subject": toggleID(id, in: &filter.subjectIds)
        default: break
        }
    }
    private func toggleID(_ id: String, in values: inout [String]) { if values.contains(id) { values.removeAll { $0 == id } } else { values.append(id) } }
    func selectedTerms(_ kind: String) -> [String] { switch kind { case "category": filter.categoryIds; case "tag": filter.tagIds; default: filter.subjectIds } }
    // MARK: - Failure classification

    private func classify(_ error: Error, source: FailureSource) -> WorkspaceFailure {
        if let error = error as? APIError, case .syncCredentialsUnavailable = error { localCredentialOption = true }
        switch error {
        case APIError.invalidServer:
            return .init(kind: .invalidAddress, technical: nil, source: source)
        case APIError.incompatible:
            return .init(kind: .incompatible, technical: nil, source: source)
        case APIError.localCredentials:
            return .init(kind: .lessThan, technical: nil, source: source)
        case APIError.syncCredentialsUnavailable:
            return .init(kind: .lessThan, technical: nil, source: source)
        case APIError.oversizedResponse:
            return .init(kind: .unexpected, technical: "oversized_response", source: source)
        case let APIError.response(status, code):
            return .init(kind: classify(status: status, code: code), technical: "\(status) \(code)", source: source)
        default:
            break
        }
        if error is DecodingError {
            return .init(kind: .unexpected, technical: "decoding_failed", source: source)
        }
        let urlError = (error as? URLError) ?? (error as NSError).underlyingURLError
        switch urlError?.code {
        case .some(.notConnectedToInternet), .some(.networkConnectionLost), .some(.dataNotAllowed):
            return .init(kind: .offline, technical: urlError.map { "\($0.code.rawValue)" }, source: source)
        case .some(.cannotFindHost), .some(.dnsLookupFailed):
            return .init(kind: .hostNotFound, technical: urlError.map { "\($0.code.rawValue)" }, source: source)
        case .some(.cannotConnectToHost), .some(.networkConnectionLost), .some(.timedOut), .some(.secureConnectionFailed),
             .some(.serverCertificateHasBadDate), .some(.serverCertificateUntrusted), .some(.serverCertificateNotYetValid),
             .some(.serverCertificateHasUnknownRoot), .some(.clientCertificateRejected), .some(.clientCertificateRequired):
            return .init(kind: .cannotReach, technical: urlError.map { "\($0.code.rawValue)" }, source: source)
        default:
            return .init(kind: .unexpected, technical: urlError.map { "\($0.code.rawValue)" }, source: source)
        }
    }

    private func classify(status: Int, code: String) -> WorkspaceFailure.Kind {
        switch (status, code) {
        case (_, "auth_method_unavailable"): .authMethodUnavailable
        case (_, "registration_closed"): .registrationClosed
        case (401, _), (403, _): .sessionExpired
        case (410, _): .incompatible
        case (429, _): .busy
        default: .unexpected
        }
    }

    /// Failure while the user already has content: keep what is on screen, say so in a banner.
    private func report(_ error: Error) {
        if let error = error as? APIError, case .syncCredentialsUnavailable = error { localCredentialOption = true }
        if let error = error as? APIError, case let .response(status, _) = error, status == 401 || status == 403 {
            endSession()
            failure = classify(error, source: .refresh)
            return
        }
        banner = classify(error, source: .refresh).message
    }

    /// Drops credentials and returns to the connection flow without discarding the failure shown.
    private func endSession() {
        queryGeneration = UUID(); detailGeneration = UUID()
        stopSync()
        connected = false; items = []; terms = []; detail = nil; selectedID = nil
        acceptedServer = false; localCredentialOption = false
        // Losing a session does not make the server's negotiated login methods unsupported.
        // Keep a valid selection so the connection form can actually offer sign-in again.
        if let method = authenticationMethod, discovery?.auth?.supportedMethods.contains(method) == true {
            authenticationMethod = method
        } else {
            authenticationMethod = discovery?.auth?.preferredMethod
        }
        arrivalSequences = [:]; syncCursor = nil
        defaults.removeObject(forKey: "accountID")
    }

    // MARK: - Sync and arrival

    private func startSync() {
        stopSync()
        arrivalTask?.cancel()
        let task = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(12))
                guard let self, !Task.isCancelled, self.connected, self.client != nil else { return }
                await self.pollSync()
            }
        }
        syncTask = task
    }

    /// One sync tick. Runs on a timer while reading, and can be driven directly in tests.
    func pollSync() async {
        guard connected, !syncing, !loading, let client else { return }
        let generation = syncGeneration
        syncing = true
        defer { if generation == syncGeneration { syncing = false } }
        do {
            var cursor = syncCursor ?? 0
            var arrivals: [String: Int] = [:]
            // Bound each tick and combine pages so a second page cannot erase the
            // first page's highlights. Commit the cursor only after content succeeds.
            for _ in 0..<20 {
                let page = try await client.syncChanges(after: cursor)
                try Task.checkCancellation()
                guard generation == syncGeneration, connected else { return }
                for change in page.changes where change.kind == "upsert" {
                    arrivals[change.entityId] = change.sequence
                }
                guard !page.hasMore || page.nextCursor > cursor else { throw APIError.incompatible }
                cursor = page.nextCursor
                if !page.hasMore { break }
            }
            if !arrivals.isEmpty {
                guard try await applyArrivals(arrivals), generation == syncGeneration else { return }
            }
            syncCursor = cursor
        } catch is CancellationError {
            return
        } catch {
            guard generation == syncGeneration, connected else { return }
            report(error)
        }
    }

    private func stopSync() {
        syncGeneration = UUID(); syncing = false
        syncTask?.cancel(); syncTask = nil
        arrivalTask?.cancel(); arrivalTask = nil
    }

    /// Server sequences, rather than the device clock, identify actual deliveries.
    /// Keep the loaded tail and the open article stable while refreshing the first page.
    private func applyArrivals(_ changes: [String: Int]) async throws -> Bool {
        guard connected, !loading, let client else { return false }
        let generation = queryGeneration; let selection = filter
        let page = try await client.list(selection, cursor: nil)
        try Task.checkCancellation()
        guard connected, !loading, generation == queryGeneration, selection == filter else { return false }
        // Merge rather than replace: pages the reader already loaded must not disappear.
        let inPage = Set(page.items.map(\.id))
        if items.isEmpty { nextCursor = page.nextCursor }
        items = page.items + items.filter { !inPage.contains($0.id) }
        total = page.total
        let visibleChanges = changes.filter { inPage.contains($0.key) }
        guard !visibleChanges.isEmpty else { return true }
        arrivalSequences.merge(visibleChanges) { _, latest in latest }
        arrivalTask?.cancel()
        arrivalTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(9))
            guard let self, !Task.isCancelled else { return }
            self.arrivalSequences = [:]
        }
        return true
    }
}

extension WorkspaceModel {
    func isArrived(_ id: String) -> Bool { arrivalSequences[id] != nil }
}

private extension NSError {
    var underlyingURLError: URLError? {
        (userInfo[NSUnderlyingErrorKey] as? URLError) ?? (self as? URLError)
    }
}
