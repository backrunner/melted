// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import Security
import CryptoKit

public struct IdentityKeyStore: Sendable {
    public init() {}
    private func query(server: String, synchronizable: Bool) -> [String: Any] {
        var attributes: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "org.melted.identity.v1",
         kSecAttrAccount as String: server,
         kSecAttrSynchronizable as String: synchronizable,
         kSecUseDataProtectionKeychain as String: true]
        #if os(macOS)
        if !synchronizable { attributes.removeValue(forKey: kSecUseDataProtectionKeychain as String) }
        #endif
        return attributes
    }
    public func key(server: String, localOnly: Bool = false) throws -> P256.Signing.PrivateKey {
        var q = query(server: server, synchronizable: !localOnly)
        q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &result)
        if status == errSecSuccess, let data = result as? Data { return try P256.Signing.PrivateKey(rawRepresentation: data) }
        guard status == errSecItemNotFound else { throw localOnly ? APIError.localCredentials : APIError.syncCredentialsUnavailable }
        let key = P256.Signing.PrivateKey()
        var insert = query(server: server, synchronizable: !localOnly)
        insert[kSecAttrAccessible as String] = localOnly ? kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly : kSecAttrAccessibleAfterFirstUnlock
        insert[kSecValueData as String] = key.rawRepresentation
        let added = SecItemAdd(insert as CFDictionary, nil)
        if added == errSecDuplicateItem { return try self.key(server: server, localOnly: localOnly) }
        guard added == errSecSuccess else { throw localOnly ? APIError.localCredentials : APIError.syncCredentialsUnavailable }
        return key
    }
}

public enum IdentityProof {
    public static func base64URL(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
    public static func random() -> String { base64URL(P256.Signing.PrivateKey().rawRepresentation) }
    public static func challenge(_ verifier: String) -> String { base64URL(Data(SHA256.hash(data: Data(verifier.utf8)))) }
    public static func sign(message: String, challengeID: String, serverID: String, key: P256.Signing.PrivateKey) throws -> String {
        let parts = message.components(separatedBy: "\n")
        guard parts.count == 4, parts[0] == "melted-key-v1", parts[1] == serverID, parts[2] == challengeID,
              parts[3].count == 43, parts[3].allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") }) else { throw APIError.incompatible }
        return base64URL(try key.signature(for: Data(message.utf8)).rawRepresentation)
    }
}
