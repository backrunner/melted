// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import MeltedCore

@MainActor
final class PluginPresetCatalogModel: ObservableObject {
    @Published private(set) var presets: [PluginPreset] = []
    @Published private(set) var total = 0
    @Published private(set) var nextCursor: String?
    @Published private(set) var loading = false
    @Published private(set) var error: String?
    private var generation = UUID()
    private var currentQuery = ""

    func load(model: SourceSettingsModel, plugin: PluginDescriptor, query: String, more: Bool = false) async {
        if more && (loading || nextCursor == nil || currentQuery != query) { return }
        let current = UUID(); generation = current
        let cursor = more ? nextCursor : nil
        if !more { presets = []; total = 0; nextCursor = nil }
        currentQuery = query; loading = true; error = nil
        defer { if generation == current { loading = false } }
        do {
            if !more { try await Task.sleep(for: .milliseconds(200)) }
            let page = try await model.presets(plugin, query: query, cursor: cursor)
            try Task.checkCancellation()
            guard current == generation else { return }
            guard page.supported else { throw APIError.incompatible }
            let existing = Set(presets.map(\.id))
            presets += page.presets.filter { !existing.contains($0.id) }
            total = page.total; nextCursor = page.nextCursor
        } catch is CancellationError {} catch {
            guard current == generation else { return }
            self.error = Self.message(error)
            if case APIError.response(409, _) = error { nextCursor = nil }
        }
    }
    static func message(_ error: Error) -> String {
        switch error {
        case APIError.response(409, _): return "来源目录已更新，请重新加载"
        case APIError.response(403, _): return "服务器未开放此路由，请联系运营者"
        case APIError.response(503, _): return "暂时无法读取实例目录，请稍后重试"
        case APIError.response(400, "preset_parameter_gap"): return "请按顺序填写可选参数，不能跳过前面的参数"
        case APIError.response(400, _): return "参数不符合路由要求，请检查后重试"
        default: return error.localizedDescription
        }
    }
}
