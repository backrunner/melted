// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import MeltedCore

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
        guard !busy else { return }
        for receipt in receipts.values.filter(\.pending) {
            guard !Task.isCancelled else { return }
            await refreshReceipt(receipt.id, sourceID: receipt.sourceId)
        }
    }
    private func message(_ error: Error) -> String {
        if case APIError.response(409, _) = error { return "设置已在其他位置更新，请刷新来源后重试" }
        if case APIError.response(403, "route_not_allowed") = error { return "此路由未获运营者允许，请检查路由或联系运营者" }
        if case APIError.response(503, _) = error { return "此插件当前不可用，请联系运营者检查配置" }
        return error.localizedDescription
    }
}
