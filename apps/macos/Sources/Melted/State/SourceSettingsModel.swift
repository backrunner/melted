// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import MeltedCore

struct SourceBatchDraft: Identifiable {
    let id: String
    let common, configuration: PluginConfiguration
}
struct SourceBatchResult {
    var saved: Set<String> = []
    var errors: [String: String] = [:]
}
@MainActor
final class SourceSettingsModel: ObservableObject {
    @Published private(set) var catalog: PluginCatalog?
    @Published private(set) var sources: [PluginSource] = []
    @Published private(set) var receipts: [String: CollectionReceipt] = [:]
    @Published private(set) var loading = false
    @Published private(set) var busy = false
    @Published var error: String?
    @Published var notice: String?
    private let client: any PluginClient
    private var generation = UUID()
    init(client: any PluginClient) { self.client = client }

    func presets(_ plugin: PluginDescriptor, query: String, cursor: String?) async throws -> PluginPresetPage {
        try await client.pluginPresets(plugin, query: query, cursor: cursor)
    }
    func resolvePreset(_ preset: PluginPreset, plugin: PluginDescriptor, input: PluginConfiguration) async throws -> PluginPresetResolution {
        try await client.resolvePreset(preset, plugin: plugin, input: input)
    }
    func load() async {
        guard !loading else { return }
        let current = generation
        loading = true; error = nil
        defer { loading = false }
        do {
            async let catalog = client.pluginCatalog()
            async let sources = client.sources()
            let result = try await (catalog, sources)
            try Task.checkCancellation()
            guard generation == current else { return }
            guard result.0.supported else { throw APIError.incompatible }
            self.catalog = result.0; self.sources = result.1
        } catch is CancellationError {} catch { if current == generation { self.error = message(error) } }
    }
    func save(_ source: PluginSource?, plugin: PluginDescriptor, common: PluginConfiguration, configuration: PluginConfiguration, requestID: String) async -> Bool {
        guard !busy else { return false }
        busy = true; error = nil; notice = nil
        defer { busy = false }
        do {
            let saved = try await client.saveSource(source, plugin: plugin, common: common, configuration: configuration, requestID: requestID)
            generation = UUID()
            if let index = sources.firstIndex(where: { $0.id == saved.id }) { sources[index] = saved } else { sources.append(saved) }
            notice = "来源已保存"; return true
        } catch { self.error = message(error); return false }
    }
    func remove(_ source: PluginSource) async {
        guard !busy else { return }
        busy = true; error = nil; notice = nil
        defer { busy = false }
        do { try await client.removeSource(source); generation = UUID(); sources.removeAll { $0.id == source.id }; receipts[source.id] = nil; notice = "来源及其原始数据已删除" }
        catch { self.error = message(error) }
    }
    /// Each row has its own durable idempotency key. A failed retry never replays successful rows.
    func addBatch(_ drafts: [SourceBatchDraft], plugin: PluginDescriptor) async -> SourceBatchResult {
        guard !busy, drafts.count <= 20 else { return SourceBatchResult(errors: Dictionary(uniqueKeysWithValues: drafts.map { ($0.id, "请稍后重试") })) }
        busy = true; error = nil; notice = nil
        defer { busy = false }
        var result = SourceBatchResult()
        for draft in drafts {
            do {
                try Task.checkCancellation()
                let saved = try await client.saveSource(nil, plugin: plugin, common: draft.common, configuration: draft.configuration, requestID: draft.id)
                generation = UUID()
                if let index = sources.firstIndex(where: { $0.id == saved.id }) { sources[index] = saved } else { sources.append(saved) }
                result.saved.insert(draft.id)
            } catch { result.errors[draft.id] = message(error) }
        }
        notice = result.errors.isEmpty ? "已添加 \(result.saved.count) 个订阅" : "已添加 \(result.saved.count) 个，\(result.errors.count) 个未完成"
        return result
    }
    func toggle(_ source: PluginSource) async {
        guard !busy else { return }
        busy = true; error = nil; notice = nil
        defer { busy = false }
        do {
            let saved = try await client.setSourceEnabled(source, enabled: !source.enabled)
            generation = UUID()
            if let index = sources.firstIndex(where: { $0.id == saved.id }) { sources[index] = saved }
            notice = saved.enabled ? "已启用自动采集" : "已暂停采集，已有资料保留"
        } catch { self.error = message(error) }
    }
    func perform(_ action: PluginAction, source: PluginSource, plugin: PluginDescriptor, input: PluginConfiguration, requestID: String) async -> Bool {
        guard !busy else { return false }
        busy = true; error = nil; notice = nil
        defer { busy = false }
        do {
            let result = try await client.performAction(action, source: source, plugin: plugin, input: input, requestID: requestID)
            switch result.status {
            case "accepted":
                guard let receipt = result.receiptId else { throw APIError.incompatible }
                notice = "任务已提交"
                await refreshReceipt(receipt, sourceID: source.id)
            case "complete": notice = result.message ?? "操作完成"
            default: throw APIError.incompatible
            }
            return true
        } catch { self.error = message(error); return false }
    }
    func refreshReceipt(_ id: String, sourceID: String) async {
        let current = generation
        do {
            let receipt = try await client.collectionReceipt(id)
            try Task.checkCancellation()
            guard current == generation else { return }
            guard receipt.sourceId == sourceID else { throw APIError.incompatible }
            receipts[sourceID] = receipt
            if !receipt.pending {
                notice = receipt.label
                let latest = try await client.sources()
                if current == generation { sources = latest }
            }
        } catch is CancellationError {} catch { self.error = message(error) }
    }
    func pollReceipts() async {
        guard !busy, !loading, !sources.isEmpty else { return }
        let current = generation
        do {
            let latest = try await client.sources()
            try Task.checkCancellation()
            guard current == generation, !busy else { return }
            sources = latest
            let activeIDs = Set(latest.map(\.id))
            receipts = receipts.filter { activeIDs.contains($0.key) }
            for source in latest {
                guard !Task.isCancelled, current == generation, !busy else { return }
                guard let run = source.lastRunId, receipts[source.id]?.id != run || receipts[source.id]?.pending == true else { continue }
                await refreshReceipt(run, sourceID: source.id)
            }
        } catch is CancellationError {} catch { if current == generation { self.error = message(error) } }
    }
    private func message(_ error: Error) -> String {
        if case APIError.response(409, _) = error { return "设置已在其他位置更新，请刷新来源后重试" }
        if case APIError.response(403, _) = error { return "此来源未获运营者允许，请检查订阅配置或联系运营者" }
        if case APIError.response(503, _) = error { return "此插件当前不可用，请联系运营者检查配置" }
        return error.localizedDescription
    }
}
