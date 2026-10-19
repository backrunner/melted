// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import Testing
@testable import MeltedCore

private func credentialFixture(_ name: String) throws -> Data {
    var root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    while !FileManager.default.fileExists(atPath: root.appendingPathComponent("contracts/fixtures/\(name).json").path), root.path != "/" { root.deleteLastPathComponent() }
    return try Data(contentsOf: root.appendingPathComponent("contracts/fixtures/\(name).json"))
}
@Test func credentialDSLScopesAreExplicitAndRejectUnsafeOrPlaintextForms() throws {
    for mode in ["byok", "shared"] {
        let data = try credentialFixture("server-settings-credentials-\(mode)")
        let catalog = try Wire.decoder().decode(ServerSettingsCatalog.self, from: data)
        let section = try #require(catalog.credentials?.first)
        #expect(section.supported)
        #expect(section.scope == (mode == "byok" ? "account" : "server"))
        for (key, value) in [("path", "https://evil.invalid/save"), ("method", "PUT"), ("format", "versioned-values-v1")] {
            var json = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
            var credentials = try #require(json["credentials"] as? [[String: Any]])
            var save = try #require(credentials[0]["save"] as? [String: Any])
            save[key] = value; credentials[0]["save"] = save; json["credentials"] = credentials
            #expect(try Wire.decoder().decode(ServerSettingsCatalog.self, from: JSONSerialization.data(withJSONObject: json)).credentials?.first?.supported == false)
        }
    }
}
@Test func credentialsOmitKeptKeysAndEncodeClearsWithoutPersistedValues() throws {
    let changes: [String: ServerCredentialChange] = ["decision_key": .clear, "generator_key": .replace("example-secret")]
    let encoded = try Wire.encoder().encode(changes)
    let json = try #require(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
    #expect(json["decision_key"] is NSNull)
    #expect(json["generator_key"] as? String == "example-secret")
    #expect(!ServerCredentialChange.replace("has space").valid)
    #expect(!ServerCredentialChange.replace("\n").valid)
    #expect(!ServerCredentialChange.replace("x".repeating(4097)).valid)
    #expect(ServerCredentialChange.clear.valid)
    let status = try Wire.decoder().decode(ServerCredentialStatus.self, from: Data(#"{"version":3,"configured":{"generator_key":true,"decision_key":false},"updated_at":null,"updated_by":null}"#.utf8))
    #expect(status.supported)
}

private extension String { func repeating(_ count: Int) -> String { String(repeating: self, count: count) } }
