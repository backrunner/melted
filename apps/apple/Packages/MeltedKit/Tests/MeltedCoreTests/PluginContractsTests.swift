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
    #expect(plugin.collection.layout == "table")
    #expect(plugin.collection.columns.map(\.id) == ["source.name", "configuration.route", "source.enabled", "source.interval_seconds"])
    #expect(plugin.collection.presetCatalog?.maximum == 20)
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

@Test func serverPresetCatalogDecodesParameterizedRoutesWithoutClientPresets() throws {
    let catalog = try Wire.decoder().decode(PluginCatalog.self, from: pluginFixture("plugin-settings"))
    let plugin = try #require(catalog.plugins.first)
    #expect(plugin.collection.presetCatalog?.field == "route")
    #expect(plugin.form.fields.first?.suggestions == nil)
    let page = try Wire.decoder().decode(PluginPresetPage.self, from: pluginFixture("plugin-presets"))
    #expect(page.supported)
    let twitter = try #require(page.presets.first { $0.summary.contains("/twitter/user/") })
    #expect(twitter.requirements.contains { $0.contains("TWITTER_AUTH_TOKEN") })
    #expect(twitter.input.error(in: [:]) != nil)
    #expect(twitter.input.error(in: ["p2": .string("_RSSHub")]) == nil)
}

@Test func optionalSuggestionsAndInvalidMetadata() throws {
    func form(_ suggestions: String) throws -> PluginForm {
        try Wire.decoder().decode(PluginForm.self, from: Data("{\"fields\":[{\"id\":\"count\",\"type\":\"integer\",\"label\":\"数量\",\"required\":true,\"minimum\":1,\"maximum\":9,\"step\":2\(suggestions)}]}".utf8))
    }
    #expect(try form("").supported) // Suggestions are optional for fields without presets.
    #expect(try form(#","suggestions":[{"value":3,"label":"常用"}]"#).supported)
    for items in [#"[{"value":3,"label":"A"},{"value":3,"label":"B"}]"#, #"[{"value":"3","label":"Wrong type"}]"#, #"[{"value":2,"label":"Wrong step"}]"#, #"[{"value":11,"label":"Range"}]"#] {
        #expect(try !form(",\"suggestions\":\(items)").supported)
    }
}

@Test func collectionRenderingRequiresCurrentDescriptorAndRejectsUnknownBindings() throws {
    var document = try #require(JSONSerialization.jsonObject(with: pluginFixture("plugin-settings")) as? [String: Any])
    var plugins = try #require(document["plugins"] as? [[String: Any]])
    for layout in ["list", "table"] {
        plugins[0]["collection"] = ["layout": layout, "title": "Rows", "columns": [["scope": "source", "field": "name", "label": "Name"]]]
        document["plugins"] = plugins
        let plugin = try Wire.decoder().decode(PluginCatalog.self, from: JSONSerialization.data(withJSONObject: document)).plugins[0]
        #expect(plugin.supported)
        #expect(plugin.collection.layout == layout)
    }
    for collection in [
        ["layout": "execute", "title": "Rows", "columns": [["scope": "source", "field": "name", "label": "Name"]]],
        ["layout": "table", "title": "Rows", "columns": [["scope": "configuration", "field": "unknown", "label": "Unknown"]]],
    ] as [[String: Any]] {
        plugins[0]["collection"] = collection; document["plugins"] = plugins
        #expect(try !Wire.decoder().decode(PluginCatalog.self, from: JSONSerialization.data(withJSONObject: document)).plugins[0].supported)
    }
    plugins[0].removeValue(forKey: "collection"); document["plugins"] = plugins
    #expect(throws: DecodingError.self) { try Wire.decoder().decode(PluginCatalog.self, from: JSONSerialization.data(withJSONObject: document)) }
}

@Test func feedDSLProvidesURLFormatChoicesLimitsAndIndependentSubscriptions() throws {
    let catalog = try Wire.decoder().decode(PluginCatalog.self, from: pluginFixture("plugin-settings"))
    let feed = try #require(catalog.plugins.first { $0.id == "feed" })
    #expect(feed.supported && feed.available)
    let field = try #require(feed.form.fields.first { $0.id == "url" })
    #expect(field.format == "url")
    #expect(field.suggestions == nil && feed.collection.presetCatalog == nil && feed.collection.addFromSuggestions == nil)
    #expect(feed.collection.columns.contains { $0.id == "configuration.url" })
    #expect(feed.form.error(in: ["url": .string("https://feeds.bbci.co.uk/news/world/rss.xml")]) == nil)
    for value in ["/feed", "https://user:secret@feeds.example.org/a", "https://feeds.example.org/#frag", "https://feeds.example.org/white space", "https://feeds.example.org/%GG", "file:///etc/passwd", "https://feeds.example.org\\@localhost/a"] { #expect(!field.accepts(.string(value))) }
    #expect(feed.form.error(in: ["url": .string("https://feeds.example.org/rss"), "format": .string("html")]) != nil)
    #expect(feed.form.error(in: ["url": .string("https://feeds.example.org/rss"), "max_items": .number(101)]) != nil)
    let source = try Wire.decoder().decode(PluginSource.self, from: pluginFixture("feed-source"))
    #expect(source.plugin == "feed")
    #expect(feed.form.error(in: source.configuration) == nil)
    let unknown = try Wire.decoder().decode(PluginForm.self, from: Data(#"{"fields":[{"id":"url","type":"text","format":"script","label":"URL","required":true,"max_length":2048}]}"#.utf8))
    #expect(!unknown.supported)
}
