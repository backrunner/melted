// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import CryptoKit
import Testing
@testable import MeltedCore
@testable import MeltedRendering

private func fixture(_ name: String) throws -> Data {
    var folder = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    while folder.path != "/" {
        let candidate = folder.appendingPathComponent("contracts/fixtures/\(name).json")
        if FileManager.default.fileExists(atPath: candidate.path) { return try Data(contentsOf: candidate) }
        folder.deleteLastPathComponent()
    }
    throw CocoaError(.fileNoSuchFile)
}
@Test func sharedBriefingDecodesAndRoundTrips() throws {
    let item = try Wire.decoder().decode(Briefing.self, from: fixture("briefing"))
    #expect(item.id == "demo_library")
    #expect(item.categoryId == "cat_culture")
    #expect(item.tagIds == ["tag_reading", "tag_city"])
    #expect(item.publishedAt == nil)
    #expect(item.state.version == 1)
    #expect(item.markdown.contains("图书馆"))
    let again = try Wire.decoder().decode(Briefing.self, from: Wire.encoder().encode(item))
    #expect(again.updatedAt == item.updatedAt)
    #expect(again.evidence == item.evidence)
}
@Test func sharedFilterPreservesSearchWhenCleared() throws {
    var filter = try Wire.decoder().decode(FilterSelection.self, from: fixture("filter"))
    #expect(filter.view == "saved")
    #expect(filter.queryItems.contains(.init(name: "category_ids", value: "cat_culture")))
    filter.categoryIds += ["cat_culture"]
    #expect(filter.queryItems.filter { $0.name == "category_ids" }.count == 1)
    filter.clearFilters()
    #expect(filter.q == "阅读")
    #expect(!filter.isFiltered)
}
@Test func unknownEvidenceNeverAppearsVerified() throws {
    var item = try Wire.decoder().decode(Briefing.self, from: fixture("briefing"))
    item.evidenceStatus = "future_status"
    #expect(item.evidenceLabel == "核验状态未知")
}
@Test func endpointsRejectUnsafeDestinations() throws {
    for value in ["http://example.com", "https://user:secret@example.com", "file:///etc/passwd", "https://example.com/api", "https://example.com?token=x", "https://example.com#fragment"] {
        #expect(throws: APIError.self) { try APIClient.validatedURL(value) }
    }
    #expect(try APIClient.validatedURL("http://127.0.0.1:8421").host == "127.0.0.1")
    #expect(try APIClient.validatedURL("https://melted.local").scheme == "https")
}
@Test func readerDoesNotAllowExecutableOrCredentialLinks() {
    for value in ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,test", "melted://action", "//tracker.invalid/image", "https://user:pass@example.com"] {
        #expect(SafeLinks.url(value) == nil)
    }
    #expect(SafeLinks.url("https://example.com/article") != nil)
}

@Test func identityProofIsBoundToServerAndChallenge() throws {
    let key = P256.Signing.PrivateKey()
    let message = "melted-key-v1\nserver-one\nchallenge-one\n" + IdentityProof.random()
    let signature = try IdentityProof.sign(message: message, challengeID: "challenge-one", serverID: "server-one", key: key)
    var encoded = signature.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
    let raw = try #require(Data(base64Encoded: encoded))
    #expect(raw.count == 64)
    #expect(key.publicKey.isValidSignature(try P256.Signing.ECDSASignature(rawRepresentation: raw), for: Data(message.utf8)))
    #expect(throws: APIError.self) { try IdentityProof.sign(message: message, challengeID: "other", serverID: "server-one", key: key) }
    #expect(throws: APIError.self) { try IdentityProof.sign(message: message, challengeID: "challenge-one", serverID: "other", key: key) }
    #expect(IdentityProof.challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    #expect(try APIClient.validatedURL("https://example.com/") == APIClient.validatedURL("https://example.com"))
}
