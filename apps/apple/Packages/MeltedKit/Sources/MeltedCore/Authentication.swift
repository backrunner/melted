// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

public enum AuthenticationMethod: String, Codable, Sendable, Identifiable {
    case password, apiKey = "api_key", browser, key
    public var id: String { rawValue }
    public var title: String {
        switch self {
        case .password: "账号密码"
        case .apiKey: "API Key"
        case .browser: "浏览器登录"
        case .key: "身份密钥"
        }
    }
}

public enum LoginCredential: Sendable {
    case password(username: String, password: String)
    case apiKey(String)
    public var method: AuthenticationMethod {
        switch self { case .password: .password; case .apiKey: .apiKey }
    }
}

extension Discovery.Authentication {
    public var supportedMethods: [AuthenticationMethod] {
        guard version == 1 else { return [] }
        var seen = Set<String>()
        return methods.compactMap { value in
            guard seen.insert(value).inserted, let method = AuthenticationMethod(rawValue: value) else { return nil }
            if method == .key && keyAlgorithm != "P-256" { return nil }
            if method == .browser && browserCallback != "melted://auth/callback" { return nil }
            return method
        }
    }
    public var preferredMethod: AuthenticationMethod? {
        if let preferred, let method = AuthenticationMethod(rawValue: preferred), supportedMethods.contains(method) { return method }
        return supportedMethods.first
    }
}
