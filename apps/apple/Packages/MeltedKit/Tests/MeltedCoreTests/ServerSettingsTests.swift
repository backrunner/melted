// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import Testing
@testable import MeltedCore

private func serverSettingsJSON() throws -> Data {
    var directory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    while directory.path != "/" {
        let path = directory.appendingPathComponent("contracts/fixtures/server-settings.json")
        if FileManager.default.fileExists(atPath: path.path) { return try Data(contentsOf: path) }
        directory.deleteLastPathComponent()
    }
    throw CocoaError(.fileNoSuchFile)
}
@Test func serverSettingsFixtureSupportsNaturalLanguageAndDynamicEndpoints() throws {
    let data = try serverSettingsJSON()
    let catalog = try Wire.decoder().decode(ServerSettingsCatalog.self, from: data)
    #expect(catalog.supported)
    let section = try #require(catalog.sections.first)
    #expect(section.supported)
    #expect(section.form.fields.count == 4)
    #expect(section.form.fields.allSatisfy { $0.multiline == true })
    #expect(section.form.error(in: ["content": .string("关注阅读、艺术与社区\n保留信息来源")]) == nil)
    #expect(section.form.error(in: ["content": .boolean(true)]) != nil)
    #expect(section.form.error(in: ["unknown": .string("x")]) != nil)
    var json = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
    var sections = try #require(json["sections"] as? [[String: Any]])
    var save = try #require(sections[0]["save"] as? [String: Any])
    save["method"] = "PATCH"; save["path"] = "/v1/settings/another_section/update"
    sections[0]["save"] = save; sections[0]["schema_version"] = 8; json["sections"] = sections
    let futureFields = try Wire.decoder().decode(ServerSettingsCatalog.self, from: JSONSerialization.data(withJSONObject: json))
    #expect(futureFields.sections[0].supported)
    #expect(try !section.sameDefinition(as: futureFields.sections[0]))
    #expect(try section.sameDefinition(as: section))
}
@Test func serverSettingsRejectsUnsafeTransportUnknownFormatsAndVersions() throws {
    for path in ["https://evil.invalid/v1/settings/preferences", "//evil.invalid/x", "/v1/auth/refresh", "/v1/settings/../auth", "/v1/settings/%2e%2e", "/v1/settings/x?key=y", "/v1/settings/x#y", "/v1/settings/x\n"] {
        #expect(!ServerSettingsSection.validPath(path))
    }
    let data = try serverSettingsJSON()
    for (field, value) in [("method", "DELETE"), ("format", "eval"), ("path", "/v1/auth/refresh")] {
        var json = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        var sections = try #require(json["sections"] as? [[String: Any]])
        var save = try #require(sections[0]["save"] as? [String: Any]); save[field] = value
        sections[0]["save"] = save; json["sections"] = sections
        let catalog = try Wire.decoder().decode(ServerSettingsCatalog.self, from: JSONSerialization.data(withJSONObject: json))
        #expect(!catalog.sections[0].supported)
    }
    let unknown = try Wire.decoder().decode(ServerSettingsCatalog.self, from: Data(#"{"dsl_version":2,"sections":[]}"#.utf8))
    #expect(!unknown.supported)
    let section = try Wire.decoder().decode(ServerSettingsCatalog.self, from: data).sections[0]
    let unknownState = try Wire.decoder().decode(ServerSettingsState.self, from: Data(#"{"schema_version":1,"version":1,"values":{},"application":"unknown"}"#.utf8))
    #expect(!unknownState.supported(for: section))
    let oldServer = try Wire.decoder().decode(Discovery.Capabilities.self, from: Data(#"{"reading":true}"#.utf8))
    #expect(oldServer.serverSettings == nil)
}

@Test func processingWorkflowIsFiniteAndCompiledPreviewDecodes() throws {
    let base = try serverSettingsJSON()
    var root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    while !FileManager.default.fileExists(atPath: root.appendingPathComponent("contracts/fixtures/server-settings-processing.json").path), root.path != "/" { root.deleteLastPathComponent() }
    let data = try Data(contentsOf: root.appendingPathComponent("contracts/fixtures/server-settings-processing.json"))
    let catalog = try Wire.decoder().decode(ServerSettingsCatalog.self, from: data)
    #expect(catalog.supported); #expect(catalog.sections[0].workflow?.actions.count == 3)
    #expect(try !catalog.sections[0].sameDefinition(as: Wire.decoder().decode(ServerSettingsCatalog.self, from: base).sections[0]))
    let status = try Wire.decoder().decode(ServerProcessingStatus.self, from: Data(contentsOf: root.appendingPathComponent("contracts/fixtures/server-processing-status.json")))
    #expect(status.supported(version: 1)); #expect(!status.supported(version: 2))
    #expect(status.preview?.first?.value.contains("文化") == true)
    for (key, value) in [("id", "execute"), ("method", "DELETE"), ("path", "https://evil.invalid/action")] {
        var json = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        var sections = try #require(json["sections"] as? [[String: Any]])
        var workflow = try #require(sections[0]["workflow"] as? [String: Any])
        var actions = try #require(workflow["actions"] as? [[String: Any]])
        actions[0][key] = value; workflow["actions"] = actions; sections[0]["workflow"] = workflow; json["sections"] = sections
        #expect(try !Wire.decoder().decode(ServerSettingsCatalog.self, from: JSONSerialization.data(withJSONObject: json)).sections[0].supported)
    }
}
