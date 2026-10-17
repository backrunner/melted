// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

/// A finite media vocabulary. Source HTML, attributes and query parameters never become executable markup.
public struct EmbeddedMedia: Hashable, Sendable {
    public enum Kind: String, Sendable { case image, youtube, bilibili }
    public let kind: Kind
    public let sourceURL: URL
    public let playerURL: URL?
    public let title: String

    public var provider: String {
        switch kind {
        case .image: sourceURL.host ?? "图片"
        case .youtube: "YouTube"
        case .bilibili: "哔哩哔哩"
        }
    }

    public static func image(_ value: String?, title: String = "") -> Self? {
        if let video = video(value, title: title) { return video }
        guard let url = publicURL(value) else { return nil }
        return Self(kind: .image, sourceURL: url, playerURL: nil, title: title)
    }

    public static func video(_ value: String?, title: String = "") -> Self? {
        guard let url = publicURL(value), let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let host = url.host!.lowercased(), path = url.path.split(separator: "/").map(String.init)
        func query(_ name: String) -> String? {
            let values = (parts.queryItems ?? []).filter { $0.name == name }
            return values.count == 1 ? values[0].value : nil
        }
        let youtubeHosts = ["youtube.com", "www.youtube.com", "m.youtube.com", "www.youtube-nocookie.com", "youtube-nocookie.com"]
        if youtubeHosts.contains(host) || host == "youtu.be" {
            let id: String?
            if host == "youtu.be" { id = path.count == 1 ? path.first : nil }
            else if path == ["watch"] { id = query("v") }
            else if path.count == 2 && ["embed", "shorts", "live"].contains(path[0]) { id = path[1] }
            else { id = nil }
            guard let id, matches(id, "[A-Za-z0-9_-]{11}") else { return nil }
            var player = URLComponents(string: "https://www.youtube-nocookie.com/embed/\(id)")!
            player.queryItems = [.init(name: "autoplay", value: "0"), .init(name: "playsinline", value: "1")]
            var source = URLComponents(string: "https://www.youtube.com/watch?v=\(id)")!
            if let start = seconds(query("start") ?? query("t")) {
                player.queryItems!.append(.init(name: "start", value: String(start)))
                source.queryItems!.append(.init(name: "t", value: String(start)))
            }
            return Self(kind: .youtube, sourceURL: source.url!, playerURL: player.url!, title: title)
        }
        if ["bilibili.com", "www.bilibili.com", "m.bilibili.com", "player.bilibili.com"].contains(host) {
            let id: String?
            if host == "player.bilibili.com" && path == ["player.html"] { id = query("bvid") ?? query("aid").map { "av" + $0 } }
            else if path.count == 2 && path[0] == "video" { id = path[1] }
            else { id = nil }
            guard let id, matches(id, "BV[A-Za-z0-9]{10}|av[1-9][0-9]{0,18}") else { return nil }
            let key = id.hasPrefix("BV") ? "bvid" : "aid", value = id.hasPrefix("BV") ? id : String(id.dropFirst(2))
            var player = URLComponents(string: "https://player.bilibili.com/player.html")!
            player.queryItems = [.init(name: key, value: value), .init(name: "autoplay", value: "0"), .init(name: "danmaku", value: "0")]
            var source = URLComponents(string: "https://www.bilibili.com/video/\(id)")!
            if let p = query("p"), let number = Int(p), (1...1000).contains(number) {
                player.queryItems!.append(.init(name: "p", value: String(number)))
                source.queryItems = [.init(name: "p", value: String(number))]
            }
            if let cid = query("cid"), matches(cid, "[1-9][0-9]{0,18}") { player.queryItems!.append(.init(name: "cid", value: cid)) }
            if let start = seconds(query("t")) {
                player.queryItems!.append(.init(name: "t", value: String(start)))
                source.queryItems = (source.queryItems ?? []) + [.init(name: "t", value: String(start))]
            }
            return Self(kind: .bilibili, sourceURL: source.url!, playerURL: player.url!, title: title)
        }
        return nil
    }

    /// Public HTTPS only; this is a URL policy, not DNS pinning or an egress sandbox.
    static func publicURL(_ value: String?) -> URL? {
        guard let value, value.utf8.count <= 4096, !value.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
              let url = URL(string: value), url.scheme?.lowercased() == "https", url.user == nil, url.password == nil,
              url.port == nil || url.port == 443, let host = url.host?.lowercased(), host.contains("."), !host.contains(":"), !host.hasSuffix("."),
              !matches(host, "(?:0x[0-9a-f]+|[0-9]+)(?:\\.(?:0x[0-9a-f]+|[0-9]+))*"),
              !["localhost", "local", "internal", "home", "lan", "test", "invalid"].contains(where: { host == $0 || host.hasSuffix("." + $0) }) else { return nil }
        return url
    }

    /// Recognize one standalone img/iframe; never execute source HTML or honor its attributes.
    static func html(_ value: String) -> Self? {
        guard let reference = htmlReference(value) else { return nil }
        return reference.tag == "img" ? image(reference.source, title: reference.title) : video(reference.source, title: reference.title)
    }

    static func htmlLink(_ value: String) -> URL? {
        guard let reference = htmlReference(value) else { return nil }
        return publicURL(reference.source)
    }

    private static func htmlReference(_ value: String) -> (tag: String, source: String, title: String)? {
        guard value.utf8.count <= 16000,
              let regex = try? NSRegularExpression(pattern: #"^\s*<(img|iframe)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>\s*(?:</iframe>\s*)?$"#, options: [.caseInsensitive]),
              let match = regex.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)), match.range.length == value.utf16.count,
              let tagRange = Range(match.range(at: 1), in: value), let attributeRange = Range(match.range(at: 2), in: value) else { return nil }
        let tag = value[tagRange].lowercased()
        var remaining = String(value[attributeRange]).trimmingCharacters(in: .whitespacesAndNewlines)
        if remaining.hasSuffix("/") { remaining.removeLast() }
        let attribute = try! NSRegularExpression(pattern: #"^([A-Za-z_:][A-Za-z0-9_:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?(?:\s+|$)"#)
        var attributes: [String: String] = [:]
        while !remaining.isEmpty {
            remaining = remaining.trimmingCharacters(in: .whitespacesAndNewlines)
            if remaining.isEmpty { break }
            guard let m = attribute.firstMatch(in: remaining, range: NSRange(remaining.startIndex..., in: remaining)),
                  let nameRange = Range(m.range(at: 1), in: remaining), let consumed = Range(m.range, in: remaining) else { return nil }
            let name = remaining[nameRange].lowercased()
            guard attributes[name] == nil else { return nil }
            attributes[name] = (2...4).compactMap { Range(m.range(at: $0), in: remaining).map { String(remaining[$0]) } }.first ?? ""
            remaining.removeSubrange(..<consumed.upperBound)
        }
        guard attributes["srcdoc"] == nil, var source = attributes["src"] else { return nil }
        source = source.replacingOccurrences(of: "&amp;", with: "&")
        if source.hasPrefix("//") { source = "https:" + source }
        let title = attributes["alt"] ?? attributes["title"] ?? ""
        return (tag, source, title)
    }

    private static func matches(_ value: String, _ pattern: String) -> Bool {
        value.range(of: "^(?:" + pattern + ")$", options: .regularExpression) != nil
    }
    private static func seconds(_ value: String?) -> Int? {
        guard let value else { return nil }
        if let n = Int(value), (0...86400).contains(n) { return n }
        guard let regex = try? NSRegularExpression(pattern: "^(?:([0-9]{1,5})h)?(?:([0-9]{1,5})m)?(?:([0-9]{1,5})s)?$"),
              !value.isEmpty, let m = regex.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)) else { return nil }
        let numbers = (1...3).map { Range(m.range(at: $0), in: value).flatMap { Int(value[$0]) } ?? 0 }
        let seconds = numbers[0] * 3600 + numbers[1] * 60 + numbers[2]
        return seconds <= 86400 ? seconds : nil
    }
}
