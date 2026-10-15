// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

extension Briefing {
    public var requiresEvidenceNotice: Bool {
        // Unknown or newly introduced states must remain visible before the body.
        !["not_applicable", "corroborated"].contains(evidenceStatus)
    }
}

public struct Term: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var kind: String
    public var name: String
}
public struct ReadingState: Codable, Equatable, Sendable {
    public var read: Bool
    public var saved: Bool
    public var hidden: Bool
    public var version: Int
}
public struct Evidence: Codable, Hashable, Sendable {
    public var title: String
    public var url: String?
    public var excerpt: String
}
public struct Briefing: Codable, Identifiable, Sendable {
    public var id: String
    public var schemaVersion: Int
    public var revision: Int
    public var kind: String
    public var contentKind: String
    public var title: String
    public var summary: String
    public var markdown: String
    public var updatedAt: Date
    public var publishedAt: Date?
    public var categoryId: String?
    public var tagIds: [String]
    public var subjectIds: [String]
    public var evidenceStatus: String
    public var evidence: [Evidence]
    public var state: ReadingState
    public var isDemo: Bool

    public var evidenceLabel: String {
        switch evidenceStatus {
        case "corroborated": "有独立佐证"
        case "single_source": "仅有单一来源"
        case "unconfirmed", "unknown": "尚未确认"
        case "conflicting": "存在不同说法"
        case "expired": "部分依据已失效"
        case "not_applicable": "无需事实核验"
        default: "核验状态未知"
        }
    }
}
public struct FilterSelection: Codable, Equatable, Sendable {
    public var view = "all"
    public var q = ""
    public var categoryIds: [String] = []
    public var tagIds: [String] = []
    public var subjectIds: [String] = []
    public var from: String?
    public var to: String?
    public var sort = "updated_desc"
    public init() {}
    public var isFiltered: Bool { view != "all" || !categoryIds.isEmpty || !tagIds.isEmpty || !subjectIds.isEmpty || from != nil || to != nil }
    public mutating func clearFilters() { let search = q; self = .init(); q = search }
    public var queryItems: [URLQueryItem] {
        var items = [URLQueryItem(name: "view", value: view), .init(name: "q", value: q.trimmingCharacters(in: .whitespacesAndNewlines)), .init(name: "sort", value: sort)]
        for (name, ids) in [("category_ids", categoryIds), ("tag_ids", tagIds), ("subject_ids", subjectIds)] {
            items += Set(ids).sorted().map { .init(name: name, value: $0) }
        }
        if let from { items.append(.init(name: "from", value: from)) }
        if let to { items.append(.init(name: "to", value: to)) }
        return items
    }
}
public struct BriefingPage: Codable, Sendable {
    public var items: [Briefing]
    public var nextCursor: String?
    public var queryHash: String
    public var total: Int
}
public struct Discovery: Codable, Sendable {
    public struct ProtocolRange: Codable, Sendable { public var min: Int; public var max: Int }
    public struct Operator: Codable, Sendable { public var name: String }
    public struct Authentication: Codable, Sendable { public var methods: [String]; public var keyAlgorithm: String; public var browserCallback: String }
    public struct Capabilities: Codable, Sendable { public var developmentSamples: Bool? }
    public var auth: Authentication?
    public var capabilities: Capabilities?
    public var `protocol`: ProtocolRange
    public var serverId: String
    public var apiBase: String
    public var registration: String
    public var `operator`: Operator
    public var processingManifestVersion: String
}
public struct ProcessingManifest: Codable, Sendable { public var version: String; public var description: String }
public struct Session: Codable, Sendable {
    public var accountId: String
    public var accessToken: String
    public var refreshToken: String
    public var expiresAt: Date
}
public enum Wire {
    public static func decoder() -> JSONDecoder {
        let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .custom { decoder in
            let value = try decoder.singleValueContainer().decode(String.self)
            let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = f.date(from: value) { return date }
            f.formatOptions = [.withInternetDateTime]
            guard let date = f.date(from: value) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Invalid timestamp")) }
            return date
        }
        return d
    }
    public static func encoder() -> JSONEncoder { let e = JSONEncoder(); e.keyEncodingStrategy = .convertToSnakeCase; e.dateEncodingStrategy = .iso8601; return e }
}
