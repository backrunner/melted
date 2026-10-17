// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import Testing
@testable import MeltedCore

private func pluginFixture(_ name: String) throws -> Data {
    var folder = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    while folder.path != "/" {
        let file = folder.appendingPathComponent("contracts/fixtures/\(name).json")
        if FileManager.default.fileExists(atPath: file.path) { return try Data(contentsOf: file) }
        folder.deleteLastPathComponent()
    }
    throw CocoaError(.fileNoSuchFile)
}
@Test func serverPluginFixtureDecodesIntoNativeControlsAndSettings() throws {
    let catalog = try Wire.decoder().decode(PluginCatalog.self, from: pluginFixture("plugin-settings"))
    #expect(catalog.supported)
    let plugin = try #require(catalog.plugins.first)
    #expect(plugin.supported && plugin.available)
    #expect(plugin.form.fields.first?.id == "route")
    #expect(plugin.actions.map(\.effect) == ["collect", "validate"])
    #expect(catalog.sourceForm.error(in: ["name": .string("新闻"), "enabled": .boolean(true), "interval_seconds": .number(900)]) == nil)
    #expect(plugin.form.error(in: ["route": .string("/bbc/world-asia")]) == nil)
    let source = try Wire.decoder().decode(PluginSource.self, from: pluginFixture("plugin-source"))
    #expect(source.configuration["route"] == .string("/bbc/world-asia"))
    #expect(source.commonSettings["interval_seconds"] == .number(900))
    let again = try Wire.decoder().decode(PluginSource.self, from: Wire.encoder().encode(source))
    #expect(again.id == source.id)
}
@Test func unknownPluginVersionsAndControlsDisableInteraction() throws {
    let data = try pluginFixture("plugin-settings")
    var document = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
    document["dsl_version"] = 2
    #expect(try !Wire.decoder().decode(PluginCatalog.self, from: JSONSerialization.data(withJSONObject: document)).supported)
    document["dsl_version"] = 1
    var plugins = try #require(document["plugins"] as? [[String: Any]])
    plugins[0]["form"] = ["fields": [["id": "execute", "type": "javascript", "label": "Execute", "required": true]]]
    document["plugins"] = plugins
    #expect(try !Wire.decoder().decode(PluginCatalog.self, from: JSONSerialization.data(withJSONObject: document)).plugins[0].supported)
    for id in ["../../auth", "action?url=x", "constructor", "__proto__"] { #expect(!PluginIdentifiers.valid(id)) }
    #expect(!PluginIdentifiers.reference("src/a"))
}
@Test func nativeFormValidatesTypesRangesAndChoiceValues() throws {
    let form = try Wire.decoder().decode(PluginForm.self, from: Data(#"{"fields":[{"id":"count","type":"integer","label":"数量","required":true,"minimum":1,"maximum":9,"step":2,"default":3},{"id":"mode","type":"select","label":"方式","required":true,"default":"all","options":[{"value":"all","label":"全部"}]}]}"#.utf8))
    #expect(form.supported)
    #expect(form.error(in: form.defaults) == nil)
    #expect(form.error(in: ["count": .number(2), "mode": .string("all")]) != nil)
    #expect(form.error(in: ["count": .number(3), "mode": .string("other")]) != nil)
    #expect(form.error(in: ["count": .boolean(true), "mode": .string("all")]) != nil)
    #expect(throws: DecodingError.self) { try Wire.decoder().decode(PluginConfiguration.self, from: Data(#"{"value":{"nested":true}}"#.utf8)) }
}
@Test func queuedPartialAndUnknownReceiptsRemainDistinct() throws {
    func receipt(_ state: String) throws -> CollectionReceipt {
        try Wire.decoder().decode(CollectionReceipt.self, from: Data("{\"id\":\"run_a\",\"source_id\":\"src_a\",\"state\":\"\(state)\",\"counts\":{\"received\":3,\"inserted\":2,\"updated\":0,\"duplicates\":0,\"invalid\":1},\"error\":null,\"next_retry_at\":null}".utf8))
    }
    #expect(try receipt("queued").pending)
    #expect(try !receipt("partial").pending)
    #expect(try receipt("partial").label == "部分内容未能采集")
    #expect(try receipt("future").label == "未知任务状态")
}
