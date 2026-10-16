// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import MeltedCore

// The workspace coordinates UI state; credentials and transport stay in MeltedCore.
protocol WorkspaceClient: Sendable {
    func discover() async throws -> (Discovery, ProcessingManifest)
    func restore(account: String) async throws -> Bool
    func login(localOnly: Bool) async throws -> String
    func credentialLogin(_ credential: LoginCredential) async throws -> String
    func browserStart(state: String, verifier: String) async throws -> URL
    func browserExchange(callback: URL, state: String, verifier: String) async throws -> String
    func syncAnchor() async throws -> Int
    func syncChanges(after: Int) async throws -> SyncPage
    func taxonomy() async throws -> [Term]
    func list(_ filter: FilterSelection, cursor: String?) async throws -> BriefingPage
    func detail(_ id: String) async throws -> Briefing
    func setState(_ id: String, state: ReadingState, mutationID: String) async throws -> ReadingState
    func logout() async throws
}

extension APIClient: WorkspaceClient {}
