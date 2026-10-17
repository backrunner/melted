// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

public enum SettingValue: Codable, Equatable, Sendable {
    case string(String), number(Double), boolean(Bool)
    public init(from decoder: any Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let v = try? c.decode(Bool.self) { self = .boolean(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else { self = .number(try c.decode(Double.self)) }
    }
    public func encode(to encoder: any Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self { case .string(let v): try c.encode(v); case .number(let v): try c.encode(v); case .boolean(let v): try c.encode(v) }
    }
    public var text: String { switch self { case .string(let v): v; case .number(let v): v.formatted(.number.grouping(.never)); case .boolean(let v): v ? "true" : "false" } }
    public var bool: Bool { if case .boolean(let v) = self { v } else { false } }
}
public typealias PluginConfiguration = [String: SettingValue]

public struct PluginField: Codable, Identifiable, Sendable {
    public struct Option: Codable, Sendable { public let value, label: String }
    public let id, type, label: String
    public let help: String?
    public let required: Bool
    public let `default`: SettingValue?
    public let placeholder: String?
    public let maxLength: Int?
    public let minimum, maximum, step: Double?
    public let unit: String?
    public let options: [Option]?
    public var supported: Bool {
        guard PluginIdentifiers.valid(id), !label.isEmpty, label.count <= 1000, (help?.count ?? 0) <= 1000 else { return false }
        switch type {
        case "text": return maxLength.map { (1...4096).contains($0) } ?? false
        case "integer":
            guard let minimum, let maximum, let step else { return false }
            return minimum.isFinite && maximum.isFinite && minimum <= maximum && abs(minimum) <= 9_007_199_254_740_991 && abs(maximum) <= 9_007_199_254_740_991 && step > 0 && step.rounded() == step && minimum.rounded() == minimum && maximum.rounded() == maximum
        case "boolean": return true
        case "select": return options.map { !$0.isEmpty && $0.count <= 100 && Set($0.map(\.value)).count == $0.count } ?? false
        default: return false
        }
    }
    public func accepts(_ value: SettingValue?) -> Bool {
        guard supported else { return false }
        guard let value = value ?? `default` else { return !required }
        switch (type, value) {
        case ("text", .string(let v)): return v.utf16.count <= (maxLength ?? 0) && (!required || !v.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) && !v.contains("\0")
        case ("integer", .number(let v)): return v.isFinite && v.rounded() == v && v >= minimum! && v <= maximum! && (v - minimum!).truncatingRemainder(dividingBy: step!) == 0
        case ("boolean", .boolean): return true
        case ("select", .string(let v)): return options?.contains(where: { $0.value == v }) == true
        default: return false
        }
    }
}
public struct PluginForm: Codable, Sendable {
    public let fields: [PluginField]
    public var supported: Bool { fields.count <= 40 && Set(fields.map(\.id)).count == fields.count && fields.allSatisfy { $0.supported && ($0.default == nil || $0.accepts($0.default)) } }
    public var defaults: PluginConfiguration { Dictionary(uniqueKeysWithValues: fields.compactMap { f in f.default.map { (f.id, $0) } }) }
    public func error(in values: PluginConfiguration) -> String? {
        guard supported else { return "此设置格式需要更新客户端" }
        if values.keys.contains(where: { key in !fields.contains(where: { $0.id == key }) }) { return "设置包含未知字段，请重新加载" }
        return fields.first(where: { !$0.accepts(values[$0.id]) }).map { "请检查“\($0.label)”" }
    }
}
public struct PluginAction: Codable, Identifiable, Sendable {
    public let id, label, description, effect: String
    public let input: PluginForm
    public let confirmation: String?
    public var supported: Bool { PluginIdentifiers.valid(id) && ["collect", "validate"].contains(effect) && input.supported && input.fields.isEmpty }
}
public struct PluginDescriptor: Codable, Identifiable, Sendable {
    public let dslVersion: Int
    public let id, version, title, description, kind: String
    public let configVersion: Int
    public let capabilities: [String]
    public let form: PluginForm
    public let actions: [PluginAction]
    public let available: Bool
    public let unavailableReason: String?
    public var supported: Bool { dslVersion == 1 && PluginIdentifiers.valid(id) && configVersion == 1 && kind == "collector" && capabilities == ["collector.poll"] && form.supported && actions.count <= 10 && Set(actions.map(\.id)).count == actions.count && actions.allSatisfy(\.supported) }
}
public struct PluginCatalog: Codable, Sendable {
    public let dslVersion: Int
    public let sourceForm: PluginForm
    public let plugins: [PluginDescriptor]
    public var supported: Bool {
        dslVersion == 1 && sourceForm.supported && plugins.count <= 100 && Set(plugins.map(\.id)).count == plugins.count &&
        Set(sourceForm.fields.map(\.id)) == ["name", "enabled", "interval_seconds"] &&
        sourceForm.fields.first(where: { $0.id == "name" })?.type == "text" &&
        sourceForm.fields.first(where: { $0.id == "enabled" })?.type == "boolean" &&
        sourceForm.fields.first(where: { $0.id == "interval_seconds" })?.type == "integer"
    }
}
public enum PluginIdentifiers {
    public static func valid(_ value: String) -> Bool {
        !["constructor", "prototype", "__proto__"].contains(value) && value.range(of: "^[a-z][a-z0-9_.-]{0,99}$", options: .regularExpression) != nil
    }
    public static func reference(_ value: String) -> Bool { value.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil }
}
public struct PluginSource: Codable, Identifiable, Sendable {
    public let id, plugin, name: String
    public let configVersion: Int
    public let configuration: PluginConfiguration
    public let intervalSeconds: Int
    public let enabled: Bool
    public let version: Int
    public let blocked: Bool
    public let lastSuccessAt: Date?
    public let lastRunId, lastError: String?
    public var commonSettings: PluginConfiguration { ["name": .string(name), "enabled": .boolean(enabled), "interval_seconds": .number(Double(intervalSeconds))] }
}
public struct PluginActionResult: Codable, Sendable {
    public let status: String
    public let receiptId: String?
    public let message: String?
}
public struct CollectionReceipt: Codable, Identifiable, Sendable {
    public struct Counts: Codable, Sendable { public let received, inserted, updated, duplicates, invalid: Int }
    public struct Failure: Codable, Sendable { public let code: String; public let retryable: Bool }
    public let id, sourceId, state: String
    public let counts: Counts
    public let error: Failure?
    public let nextRetryAt: String?
    public var pending: Bool { ["queued", "running"].contains(state) }
    public var label: String {
        switch state {
        case "queued": nextRetryAt == nil ? "等待采集" : "等待重试"
        case "running": "正在采集"
        case "complete": "采集完成"
        case "partial": "部分内容未能采集"
        case "failed": "采集失败"
        case "cancelled": "采集已取消"
        default: "未知任务状态"
        }
    }
}
