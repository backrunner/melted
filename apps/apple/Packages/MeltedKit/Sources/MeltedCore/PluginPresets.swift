// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

public struct PluginPreset: Decodable, Identifiable, Sendable {
    public let id, label, group, summary: String
    public let description: String?
    public let requirements: [String]
    public let allowed: Bool
    public let input: PluginForm
    public var supported: Bool {
        id.count == 64 && id.allSatisfy { $0.isASCII && ($0.isNumber || ("a"..."f").contains(String($0))) }
            && !label.isEmpty && label.utf16.count <= 300 && !group.isEmpty && group.utf16.count <= 200 && summary.utf16.count <= 2048
            && (description?.utf16.count ?? 0) <= 16000
            && requirements.count <= 40 && requirements.allSatisfy { $0.utf16.count <= 200 } && input.supported
    }
}
public struct PluginPresetPage: Decodable, Sendable {
    public let presets: [PluginPreset]
    public let total: Int
    public let nextCursor: String?
    public var supported: Bool { presets.count <= 50 && total >= presets.count && (0...20000).contains(total) && Set(presets.map(\.id)).count == presets.count && presets.allSatisfy(\.supported) && (nextCursor?.count ?? 0) <= 300 }
}
public struct PluginPresetResolution: Decodable, Sendable {
    public let label: String
    public let configuration: PluginConfiguration
}
