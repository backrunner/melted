import Foundation
import SwiftUI
import MeltedCore

@MainActor
final class WorkspaceModel: ObservableObject {
    @Published var serverAddress = UserDefaults.standard.string(forKey: "serverAddress") ?? "http://127.0.0.1:8421"
    @Published var localCredentialOption = false
    @Published var identityStorage = UserDefaults.standard.string(forKey: "identityStorage") ?? "session"
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
    private var client: APIClient?
    private var queryGeneration = UUID()
    private var detailGeneration = UUID()
    private var connectionGeneration = UUID()

    func discover() async {
        let generation = UUID(); connectionGeneration = generation
        connecting = true; error = nil; discovery = nil; manifest = nil; acceptedServer = false
        defer { if connectionGeneration == generation { connecting = false } }
        do {
            let url = try APIClient.validatedURL(serverAddress)
            let candidate = APIClient(url: url)
            let (d, m) = try await candidate.discover()
            guard generation == connectionGeneration else { return }
            client = candidate; discovery = d; manifest = m
        } catch { if generation == connectionGeneration { self.error = message(error) } }
    }
    func bootstrap() async {
        guard UserDefaults.standard.string(forKey: "accountID") != nil else { return }
        await discover()
        guard let client, let discovery, let account = UserDefaults.standard.string(forKey: "accountID"),
              UserDefaults.standard.string(forKey: "serverID") == discovery.serverId,
              UserDefaults.standard.string(forKey: "manifestVersion") == discovery.processingManifestVersion else { return }
        do { if try await client.restore(account: account) { acceptedServer = true; connected = true; await loadInitial() } }
        catch { self.error = message(error) }
    }
    func login(localOnly: Bool = false, browser: Bool = false) async {
        guard acceptedServer, let client, let discovery else { return }
        connecting = true; error = nil
        defer { connecting = false }
        do {
            let account: String
            if browser {
                let state = IdentityProof.random(), verifier = IdentityProof.random()
                let url = try await client.browserStart(state: state, verifier: verifier)
                let callback = try await browserAuthentication.authenticate(url)
                account = try await client.browserExchange(callback: callback, state: state, verifier: verifier)
                identityStorage = "browser"
            } else {
                let localPreference = "localIdentity|\(serverAddress)|\(discovery.serverId)"
                let useLocal = localOnly || UserDefaults.standard.bool(forKey: localPreference)
                account = try await client.login(localOnly: useLocal)
                UserDefaults.standard.set(useLocal, forKey: localPreference)
                identityStorage = useLocal ? "local" : "keychain"
            }
            UserDefaults.standard.set(identityStorage, forKey: "identityStorage")
            UserDefaults.standard.set(serverAddress, forKey: "serverAddress")
            UserDefaults.standard.set(discovery.serverId, forKey: "serverID")
            UserDefaults.standard.set(discovery.processingManifestVersion, forKey: "manifestVersion")
            UserDefaults.standard.set(account, forKey: "accountID")
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
            let page = try await client.list(selection)
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
            if generation == detailGeneration, selectedID == id { detail = d }
        } catch is CancellationError {} catch { if generation == detailGeneration { self.error = message(error) } }
    }
    func updateState(saved: Bool? = nil, read: Bool? = nil) async {
        guard let client, let current = detail, !mutating else { return }
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
            UserDefaults.standard.removeObject(forKey: "accountID")
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
                UserDefaults.standard.removeObject(forKey: "accountID")
            }
            return error.localizedDescription
        }
        if error is DecodingError { return "服务器返回的数据格式无法识别。" }
        return "连接中断，请检查服务器后重试。当前显示的是本次已加载的内容。"
    }
}
