import SwiftUI
import MeltedCore
import MeltedDesignSystem

/// An isolated native harness using the current product views and state model.
actor AuditClient: WorkspaceClient {
    var delay = false
    var fails = false
    var sequence = 0
    var rows: [Briefing]
    init() {
        let item = try! Wire.decoder().decode(Briefing.self, from: Data(contentsOf: Bundle.main.url(forResource: "briefing", withExtension: "json")!))
        rows = [item]
    }
    func configure(delay: Bool, fails: Bool) { self.delay = delay; self.fails = fails }
    func discover() async throws -> (Discovery, ProcessingManifest) {
        if delay { try await Task.sleep(for: .seconds(2)) }
        if fails { throw URLError(.cannotConnectToHost) }
        let discovery = try Wire.decoder().decode(Discovery.self, from: Data(#"{"protocol":{"min":1,"max":1},"server_id":"audit","api_base":"/v1","registration":"open","operator":{"name":"动画验证"},"processing_manifest_version":"1","auth":{"version":1,"methods":["password","api_key"],"preferred":"password"}}"#.utf8))
        let manifest = try Wire.decoder().decode(ProcessingManifest.self, from: Data(#"{"version":"1","description":"隔离的原生交互验证，不访问真实服务器或钥匙串"}"#.utf8))
        return (discovery, manifest)
    }
    func restore(account: String) -> Bool { false }
    func login(localOnly: Bool) -> String { "audit" }
    func credentialLogin(_ credential: LoginCredential) -> String { "audit" }
    func browserStart(state: String, verifier: String) throws -> URL { throw APIError.incompatible }
    func browserExchange(callback: URL, state: String, verifier: String) throws -> String { throw APIError.incompatible }
    func syncAnchor() -> Int { sequence }
    func syncChanges(after: Int) -> SyncPage {
        SyncPage(changes: sequence > after ? [SyncChange(sequence: sequence, entityId: rows[0].id, kind: "upsert")] : [], nextCursor: sequence, hasMore: false)
    }
    func deliver(update: Bool) {
        sequence += 1
        var item = rows[0]
        if !update { item.id = "arrival-\(sequence)" }
        item.title = "第 \(sequence) 次内容到达"
        item.updatedAt = .now.addingTimeInterval(-86400)
        item.state.read = true
        rows.removeAll { $0.id == item.id }; rows.insert(item, at: 0)
    }
    func taxonomy() -> [Term] { [] }
    func list(_ filter: FilterSelection, cursor: String?) throws -> BriefingPage {
        var page = try Wire.decoder().decode(BriefingPage.self, from: Data(#"{"items":[],"query_hash":"audit","total":0}"#.utf8))
        page.items = filter.view == "unread" ? [] : rows
        page.total = page.items.count
        return page
    }
    func detail(_ id: String) -> Briefing { rows.first { $0.id == id }! }
    func setState(_ id: String, state: ReadingState, mutationID: String) -> ReadingState { state }
    func logout() {}
}

struct AuditRoot: View {
    @StateObject private var model: WorkspaceModel
    private let client: AuditClient
    @State private var dark = true
    @State private var compact = false
    @State private var delay = true
    @State private var fails = false
    init() {
        let client = AuditClient(); self.client = client
        _model = StateObject(wrappedValue: WorkspaceModel(defaults: UserDefaults(suiteName: "melted-animation-audit")!, makeClient: { _ in client }))
    }
    var body: some View {
        WorkspaceView(model: model)
            .preferredColorScheme(dark ? .dark : .light)
            .frame(width: compact ? 680 : 1120, height: compact ? 520 : 760)
            .toolbar {
                ToolbarItemGroup {
                    Toggle("深色", isOn: $dark)
                    Toggle("紧凑", isOn: $compact)
                    Menu("验证") {
                        Toggle("延迟响应", isOn: $delay)
                        Toggle("连接失败", isOn: $fails)
                        Button("连接页") { Task { await model.logout(); model.resetConnection() } }
                        Button("工作台") { Task {
                            await client.configure(delay: false, fails: false)
                            await model.discover(); model.acceptedServer = true
                            await model.login(credential: .password(username: "audit", password: "fixture"))
                        } }
                        Button("新内容") { Task { await client.deliver(update: false); await model.pollSync() } }
                        Button("更新当前条目") { Task { await client.deliver(update: true); await model.pollSync() } }
                    }
                }
            }
            .task { model.serverAddress = "https://melted.example.com"; await client.configure(delay: delay, fails: fails) }
            .task(id: delay) { await client.configure(delay: delay, fails: fails) }
            .task(id: fails) { await client.configure(delay: delay, fails: fails) }
    }
}

@main struct AuditApp: App {
    var body: some Scene {
        Window("Melted 动画复核 · 隔离样例", id: "audit") { AuditRoot() }
            .windowResizability(.contentSize)
    }
}
