// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import Testing
import MeltedCore
@testable import Melted

private func credentialSection() throws -> ServerCredentialSection {
    var root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    while !FileManager.default.fileExists(atPath: root.appendingPathComponent("contracts/fixtures/server-settings-credentials-byok.json").path), root.path != "/" { root.deleteLastPathComponent() }
    return try #require(Wire.decoder().decode(ServerSettingsCatalog.self, from: Data(contentsOf: root.appendingPathComponent("contracts/fixtures/server-settings-credentials-byok.json"))).credentials?.first)
}
private actor CredentialClient: ServerCredentialsClient {
    var version = 0
    var failure = false
    var ids: [String] = []
    var submissions: [[String: ServerCredentialChange]] = []
    func setFailure(_ value: Bool) { failure = value }
    func status() throws -> ServerCredentialStatus { try Wire.decoder().decode(ServerCredentialStatus.self, from: Data("{\"version\":\(version),\"configured\":{\"generator_key\":true,\"decision_key\":true},\"updated_at\":null,\"updated_by\":null}".utf8)) }
    func serverCredentials(_ section: ServerCredentialSection) throws -> ServerCredentialStatus { try status() }
    func saveServerCredentials(_ section: ServerCredentialSection, version: Int, changes: [String: ServerCredentialChange], requestID: String) throws -> ServerCredentialStatus {
        ids.append(requestID); submissions.append(changes)
        if failure { throw URLError(.timedOut) }
        guard version == self.version else { throw APIError.response(409, "credentials_conflict") }
        self.version += 1; return try status()
    }
}
@Test @MainActor func credentialRetryPreservesRequestAndSuccessErasesInputAndRetainedRequestCopy() async throws {
    let client = CredentialClient(), model = try ServerCredentialsModel(client: client, section: credentialSection())
    await model.load(); #expect(model.values.isEmpty)
    model.values["generator_key"] = "new-example-key"
    await client.setFailure(true); await model.save()
    #expect(model.dirty); #expect(model.error != nil)
    await client.setFailure(false); await model.save()
    let ids = await client.ids; #expect(ids.count == 2 && ids[0] == ids[1])
    #expect(model.values.isEmpty && model.clearing.isEmpty && !model.dirty)
    #expect(await client.submissions.first == ["generator_key": .replace("new-example-key")])
    model.clearing.insert("decision_key"); await model.save()
    #expect(await client.submissions.last == ["decision_key": .clear])
    #expect(model.status?.version == 2 && !model.dirty)
}
