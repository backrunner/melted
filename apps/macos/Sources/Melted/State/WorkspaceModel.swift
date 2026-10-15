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
    @Published var error: String?
    @Published var filter = FilterSelection()
    @Published var terms: [Term] = []
    @Published var items: [Briefing] = []
    @Published var selectedID: String?
    @Published var detail: Briefing?
    @Published var nextCursor: String?
    @Published var total = 0
    @Published var searchRequest = 0
    private var client: (any WorkspaceClient)?
    private let defaults: UserDefaults
    private let makeClient: (URL) -> any WorkspaceClient
    private var queryGeneration = UUID()
    private var detailGeneration = UUID()
    private var connectionGeneration = UUID()
    private var hasBootstrapped = false

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
        acceptedServer = false; localCredentialOption = false; error = nil
        authenticationMethod = nil
    }

    func discover() async {
        guard !connecting else { return }
        let generation = UUID(); connectionGeneration = generation
        connecting = true; error = nil; discovery = nil; manifest = nil; acceptedServer = false
        client = nil; authenticationMethod = nil; localCredentialOption = false
        defer { if connectionGeneration == generation { connecting = false } }
        do {
            let url = try APIClient.validatedURL(serverAddress)
            let candidate = makeClient(url)
            let (d, m) = try await candidate.discover()
            guard generation == connectionGeneration else { return }
            client = candidate; discovery = d; manifest = m
            authenticationMethod = d.auth?.preferredMethod
        } catch { if generation == connectionGeneration { self.error = message(error) } }
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
        do { if try await client.restore(account: account) { acceptedServer = true; connected = true; await loadInitial() } }
        catch { self.error = message(error) }
    }
    func selectAuthenticationMethod(_ method: AuthenticationMethod) {
        guard !connecting, discovery?.auth?.supportedMethods.contains(method) == true, authenticationMethod != method else { return }
        authenticationMethod = method; error = nil; localCredentialOption = false
    }
    func login(localOnly: Bool = false, credential: LoginCredential? = nil) async {
        guard !connecting, acceptedServer, let client, let discovery, let method = authenticationMethod,
              discovery.auth?.supportedMethods.contains(method) == true else { return }
        if method == .password || method == .apiKey {
            guard credential?.method == method else { return }
        }
        connecting = true; error = nil; localCredentialOption = false
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
            connected = true; await loadInitial()
        } catch { self.error = message(error) }
    }
    func seedDevelopmentSamples() async {
        guard discovery?.capabilities?.developmentSamples == true, let client else { return }
        do { try await client.seedDevelopmentSamples(); await loadInitial() } catch { self.error = message(error) }
    }
    func loadInitial() async {
        guard let client else { return }
        do { terms = try await client.taxonomy(); await reload() } catch { self.error = message(error) }
    }
    func reload() async {
        guard connected, let client else { return }
        let generation = UUID(); queryGeneration = generation; let selection = filter
        loading = true; error = nil
        defer { if queryGeneration == generation { loading = false } }
        do {
            try await Task.sleep(for: .milliseconds(180))
            let page = try await client.list(selection, cursor: nil)
            try Task.checkCancellation()
            guard generation == queryGeneration, selection == filter else { return }
            items = page.items; nextCursor = page.nextCursor; total = page.total
            if let selectedID, !items.contains(where: { $0.id == selectedID }) { self.selectedID = nil; detail = nil }
        } catch is CancellationError {} catch { if generation == queryGeneration { self.error = message(error) } }
    }
    func loadMore() async {
        guard let client, let cursor = nextCursor, !loading else { return }
        let generation = queryGeneration; let selection = filter; loading = true
        defer { if generation == queryGeneration { loading = false } }
        do {
            let page = try await client.list(selection, cursor: cursor)
            guard generation == queryGeneration, selection == filter else { return }
            let ids = Set(items.map(\.id)); items += page.items.filter { !ids.contains($0.id) }; nextCursor = page.nextCursor
        } catch { if generation == queryGeneration { self.error = message(error) } }
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
        } catch is CancellationError {} catch { if generation == detailGeneration { self.error = message(error) } }
    }
    func updateState(saved: Bool? = nil, read: Bool? = nil) async {
        guard let detail else { return }
        await updateState(for: detail, saved: saved, read: read)
    }
    func updateState(for item: Briefing, saved: Bool? = nil, read: Bool? = nil) async {
        guard let client, !mutating else { return }
        // Context actions always target their row, even while a different article is open.
        let current = items.first(where: { $0.id == item.id }) ?? item
        mutating = true; error = nil; defer { mutating = false }
        var state = current.state; if let saved { state.saved = saved }; if let read { state.read = read }
        do {
            let result = try await client.setState(current.id, state: state, mutationID: UUID().uuidString)
            if detail?.id == current.id { detail?.state = result }
            if let index = items.firstIndex(where: { $0.id == current.id }) { items[index].state = result }
            if (filter.view == "saved" && !result.saved) || (filter.view == "unread" && result.read) {
                items.removeAll { $0.id == current.id }; total = max(0, total - 1)
                if selectedID == current.id { selectedID = nil; detail = nil }
            }
        } catch { self.error = message(error) }
    }
    func logout() async {
        guard let client else { return }
        do {
            try await client.logout()
            queryGeneration = UUID(); detailGeneration = UUID(); connectionGeneration = UUID()
            connected = false; items = []; terms = []; detail = nil; selectedID = nil; filter = .init()
            discovery = nil; manifest = nil; acceptedServer = false; error = nil
            authenticationMethod = nil; localCredentialOption = false
            defaults.removeObject(forKey: "accountID")
        } catch { self.error = message(error) }
    }
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
    private func message(_ error: Error) -> String {
        if let error = error as? APIError {
            if case .syncCredentialsUnavailable = error { localCredentialOption = true }
            if case .response(401, _) = error, connected {
                queryGeneration = UUID(); detailGeneration = UUID()
                connected = false; items = []; detail = nil; selectedID = nil
                defaults.removeObject(forKey: "accountID")
            }
            return error.localizedDescription
        }
        if error is DecodingError { return "服务器返回的数据格式无法识别。" }
        return "连接中断，请检查服务器后重试。当前显示的是本次已加载的内容。"
    }
}
