// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import Security

public struct CredentialStore: Sendable {
    public init() {}
    private func query(server: String, account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "org.melted.session.\(server)", kSecAttrAccount as String: account]
    }
    public func save(_ session: Session, server: String) throws {
        let data = try Wire.encoder().encode(session)
        let q = query(server: server, account: session.accountId)
        let status = SecItemUpdate(q as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var insert = q; insert[kSecValueData as String] = data
            insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            guard SecItemAdd(insert as CFDictionary, nil) == errSecSuccess else { throw APIError.localCredentials }
        } else if status != errSecSuccess { throw APIError.localCredentials }
    }
    public func read(server: String, account: String) throws -> Session? {
        var q = query(server: server, account: account); q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?; let status = SecItemCopyMatching(q as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw APIError.localCredentials }
        return try Wire.decoder().decode(Session.self, from: data)
    }
    public func delete(server: String, account: String) throws {
        let status = SecItemDelete(query(server: server, account: account) as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound { throw APIError.localCredentials }
    }
}
