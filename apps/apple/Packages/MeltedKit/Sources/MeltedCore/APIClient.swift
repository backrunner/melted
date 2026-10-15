// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import CryptoKit

public enum APIError: Error, LocalizedError, Sendable {
    case invalidServer, incompatible, localCredentials, syncCredentialsUnavailable, response(Int, String), oversizedResponse
    public var errorDescription: String? {
        switch self {
        case .invalidServer: "请输入有效的 HTTPS 服务器地址。本机开发可使用 http://127.0.0.1。"
        case .incompatible: "服务器协议或处理服务声明不兼容。"
        case .localCredentials: "无法访问系统钥匙串，请检查钥匙串状态。"
        case .syncCredentialsUnavailable: "当前构建无法访问可同步钥匙串。你可以使用本机凭据继续，它不会同步到其他设备。"
        case .oversizedResponse: "服务器返回的内容过大。"
        case .response(let code, _):
            switch code {
            case 401: "登录已失效，请重新连接服务器。"
            case 409: "内容已在其他地方更新。请刷新后重试。"
            case 410: "列表已过期，请刷新。"
            case 429: "请求过于频繁，请稍后重试。"
            case 422: "结果过多，请缩小搜索或筛选范围。"
            default: "服务器暂时无法完成请求（\(code)）。"
            }
        }
    }
}
private final class NoRedirects: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) { completionHandler(nil) }
}
public actor APIClient {
    public let baseURL: URL
    private let transport: URLSession
    private let credentials = CredentialStore()
    private var session: Session?
    private var serverID = ""
    private var discoveredID = ""
    private var authenticationMethods: [String] = []
    private var refreshTask: Task<Session, Error>?

    public static func validatedURL(_ input: String) throws -> URL {
        guard var c = URLComponents(string: input.trimmingCharacters(in: .whitespacesAndNewlines)),
              let host = c.host, !host.isEmpty, c.user == nil, c.password == nil, c.query == nil, c.fragment == nil,
              c.path.isEmpty || c.path == "/", c.url != nil,
              c.scheme == "https" || (c.scheme == "http" && ["localhost", "127.0.0.1", "[::1]"].contains(host)) else { throw APIError.invalidServer }
        c.path = ""
        return c.url!
    }
    public init(url: URL) {
        baseURL = url
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 15; config.timeoutIntervalForResource = 30
        config.httpShouldSetCookies = false; config.urlCache = nil
        transport = URLSession(configuration: config, delegate: NoRedirects(), delegateQueue: nil)
    }
    public func discover() async throws -> (Discovery, ProcessingManifest) {
        let d: Discovery = try await send("/.well-known/melted")
        guard d.protocol.min <= 1, d.protocol.max >= 1, d.apiBase == "/v1", !d.serverId.isEmpty else { throw APIError.incompatible }
        let manifest: ProcessingManifest = try await send("/.well-known/melted/processing")
        guard manifest.version == d.processingManifestVersion else { throw APIError.incompatible }
        discoveredID = d.serverId
        authenticationMethods = d.auth?.methods ?? []
        serverID = d.serverId + "|" + baseURL.absoluteString
        return (d, manifest)
    }
    public func login(localOnly: Bool = false) async throws -> String {
        guard !serverID.isEmpty, authenticationMethods.contains("key") else { throw APIError.incompatible }
        let key = try IdentityKeyStore().key(server: serverID, localOnly: localOnly)
        struct Challenge: Decodable, Sendable { let challengeId: String; let message: String; let expiresIn: Int }
        let proof: Challenge = try await send("/v1/auth/key/challenges", method: "POST", body: Wire.encoder().encode(["public_key": IdentityProof.base64URL(key.publicKey.x963Representation)]))
        let signature = try IdentityProof.sign(message: proof.message, challengeID: proof.challengeId, serverID: discoveredID, key: key)
        let next: Session = try await send("/v1/auth/key/sessions", method: "POST", body: Wire.encoder().encode(["challenge_id": proof.challengeId, "signature": signature]))
        return try accept(next)
    }
    public func browserStart(state: String, verifier: String) async throws -> URL {
        guard authenticationMethods.contains("browser") else { throw APIError.incompatible }
        struct Start: Decodable, Sendable { let authorizationUrl: String }
        let start: Start = try await send("/v1/auth/browser/start", method: "POST", body: Wire.encoder().encode(["state": state, "code_challenge": IdentityProof.challenge(verifier), "redirect_uri": "melted://auth/callback"]))
        guard let url = URL(string: start.authorizationUrl), url.scheme == baseURL.scheme, url.host == baseURL.host, url.port == baseURL.port,
              url.user == nil, url.password == nil, url.fragment == nil, url.path == "/v1/auth/browser/authorize" else { throw APIError.incompatible }
        return url
    }
    public func browserExchange(callback: URL, state: String, verifier: String) async throws -> String {
        guard callback.scheme == "melted", callback.host == "auth", callback.path == "/callback", callback.user == nil, callback.password == nil, callback.fragment == nil,
              let parts = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems,
              parts.filter({ $0.name == "state" }).count == 1, parts.first(where: { $0.name == "state" })?.value == state,
              parts.filter({ $0.name == "code" }).count == 1, let code = parts.first(where: { $0.name == "code" })?.value else { throw APIError.incompatible }
        let next: Session = try await send("/v1/auth/browser/exchange", method: "POST", body: Wire.encoder().encode(["code": code, "code_verifier": verifier, "redirect_uri": "melted://auth/callback"]))
        return try accept(next)
    }
    private func accept(_ next: Session) throws -> String {
        try credentials.save(next, server: serverID); session = next; return next.accountId
    }
    public func seedDevelopmentSamples() async throws { let _: Empty = try await send("/v1/development/seed", method: "POST", body: Data("{}".utf8), token: accessToken()) }
    public func restore(account: String) throws -> Bool { session = try credentials.read(server: serverID, account: account); return session != nil }
    public func logout() async throws {
        let token = try await accessToken()
        let _: Empty = try await send("/v1/auth/sessions/current", method: "DELETE", token: token)
        if let session { try credentials.delete(server: serverID, account: session.accountId) }
        session = nil
    }
    private func accessToken() async throws -> String {
        guard let s = session else { throw APIError.response(401, "unauthorized") }
        if s.expiresAt.timeIntervalSinceNow > 30 { return s.accessToken }
        if let refreshTask { return try await refreshTask.value.accessToken }
        let task = Task<Session, Error> {
            let next: Session = try await self.send("/v1/auth/refresh", method: "POST", body: Wire.encoder().encode(["refresh_token": s.refreshToken]))
            try self.credentials.save(next, server: self.serverID)
            return next
        }
        refreshTask = task
        defer { refreshTask = nil }
        let next = try await task.value; session = next
        return next.accessToken
    }
    public func taxonomy() async throws -> [Term] { struct Response: Decodable, Sendable { var terms: [Term] }; let r: Response = try await send("/v1/taxonomy", token: accessToken()); return r.terms }
    public func list(_ filter: FilterSelection, cursor: String? = nil) async throws -> BriefingPage {
        var query = filter.queryItems; if let cursor { query.append(.init(name: "cursor", value: cursor)) }
        return try await send("/v1/briefings", query: query, token: accessToken())
    }
    public func detail(_ id: String) async throws -> Briefing { try await send("/v1/briefings/\(id)", token: accessToken()) }
    public func setState(_ id: String, state: ReadingState, mutationID: String) async throws -> ReadingState {
        struct Mutation: Encodable { let read, saved, hidden: Bool; let expectedVersion: Int; let mutationId: String }
        let b = try Wire.encoder().encode(Mutation(read: state.read, saved: state.saved, hidden: state.hidden, expectedVersion: state.version, mutationId: mutationID))
        return try await send("/v1/briefings/\(id)/state", method: "PUT", body: b, token: accessToken())
    }
    private struct Empty: Decodable, Sendable {}
    private func send<T: Decodable & Sendable>(_ path: String, method: String = "GET", query: [URLQueryItem] = [], body: Data? = nil, token: String? = nil) async throws -> T {
        var c = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        c.path = path; c.queryItems = query.isEmpty ? nil : query
        guard let url = c.url else { throw APIError.invalidServer }
        var request = URLRequest(url: url); request.httpMethod = method; request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (bytes, response) = try await transport.bytes(for: request)
        let limit = 16 * 1024 * 1024
        guard response.expectedContentLength <= limit else { bytes.task.cancel(); throw APIError.oversizedResponse }
        var data = Data()
        for try await byte in bytes {
            if data.count == limit { bytes.task.cancel(); throw APIError.oversizedResponse }
            data.append(byte)
        }
        guard let response = response as? HTTPURLResponse else { throw APIError.response(0, "invalid_response") }
        guard (200...299).contains(response.statusCode) else { throw APIError.response(response.statusCode, "request_failed") }
        return try Wire.decoder().decode(T.self, from: response.statusCode == 204 ? Data("{}".utf8) : data)
    }
}
