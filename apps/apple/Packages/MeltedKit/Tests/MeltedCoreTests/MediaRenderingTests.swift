// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import Testing
import WebKit
import Markdown
@testable import MeltedRendering

@Test func videoReferencesUseCanonicalPlayersWithoutSourceExecutionParameters() throws {
    for source in [
        "https://www.youtube.com/watch?v=M7lc1UVf-VE&autoplay=1&origin=https://evil.example.org",
        "https://youtu.be/M7lc1UVf-VE", "https://m.youtube.com/shorts/M7lc1UVf-VE",
        "https://www.youtube.com/live/M7lc1UVf-VE", "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE"
    ] {
        let media = try #require(EmbeddedMedia.video(source))
        #expect(media.kind == .youtube)
        #expect(media.playerURL?.absoluteString == "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?autoplay=0&playsinline=1")
        #expect(media.sourceURL.absoluteString == "https://www.youtube.com/watch?v=M7lc1UVf-VE")
    }
    let youtube = try #require(EmbeddedMedia.video("https://youtu.be/M7lc1UVf-VE?t=90s"))
    #expect(youtube.playerURL?.query?.contains("start=90") == true)
    #expect(youtube.sourceURL.query?.contains("t=90") == true)
    #expect(EmbeddedMedia.video("https://youtu.be/M7lc1UVf-VE?t=1m30s")?.playerURL == youtube.playerURL)
    for source in ["https://www.bilibili.com/video/BV1B7411m7LV?p=2&autoplay=1", "https://player.bilibili.com/player.html?bvid=BV1B7411m7LV&p=2"] {
        let media = try #require(EmbeddedMedia.video(source))
        #expect(media.kind == .bilibili)
        #expect(media.playerURL?.absoluteString == "https://player.bilibili.com/player.html?bvid=BV1B7411m7LV&autoplay=0&danmaku=0&p=2")
    }
    #expect(EmbeddedMedia.video("https://www.bilibili.com/video/av1234")?.playerURL?.query == "aid=1234&autoplay=0&danmaku=0")
    #expect(EmbeddedMedia.video("https://player.bilibili.com/player.html?bvid=BV1B7411m7LV&cid=1234")?.playerURL?.query?.contains("cid=1234") == true)
}

@Test func mediaRejectsExecutablePrivateCredentialAndAmbiguousReferences() {
    for source in ["file:///etc/passwd", "data:image/svg+xml,test", "javascript:alert(1)", "http://example.com/a.png", "https://user:secret@example.com/a.png", "https://127.0.0.1/a", "https://[::1]/a", "https://0x7f.0.0.1/a", "https://169.254.169.254/a", "https://host.local/a", "https://host.internal/a", "https://example.com:8443/a", "https://www.youtube.com\n/watch?v=M7lc1UVf-VE"] {
        #expect(EmbeddedMedia.image(source) == nil, "Accepted \(source)")
    }
    for source in ["https://www.youtube.com.evil.example.org/watch?v=M7lc1UVf-VE", "https://www.youtube.com/watch?v=M7lc1UVf-VE&v=AAAAAAAAAAA", "https://youtu.be/invalid", "https://www.youtube.com/embed/M7lc1UVf-VE/extra", "https://b23.tv/short", "https://www.bilibili.com/video/BVinvalid", "https://player.bilibili.com/other?bvid=BV1B7411m7LV"] {
        #expect(EmbeddedMedia.video(source) == nil)
    }
    #expect(EmbeddedMedia.image("https://images.example.org/a.webp")?.kind == .image)
}

@Test func htmlOnlyExtractsKnownMediaAndIgnoresExecutableAttributes() throws {
    let html = #"<iframe src="//player.bilibili.com/player.html?bvid=BV1B7411m7LV&amp;autoplay=1" onload="alert('unsafe')" allowfullscreen></iframe>"#
    let media = try #require(EmbeddedMedia.html(html))
    #expect(media.kind == .bilibili)
    #expect(!media.playerURL!.absoluteString.contains("unsafe"))
    #expect(media.playerURL!.query?.contains("autoplay=0") == true)
    #expect(EmbeddedMedia.html(#"<img src='https://images.example.org/photo.png' alt='文化活动' />"#)?.title == "文化活动")
    #expect(EmbeddedMedia.htmlLink(#"<iframe src="https://other.example.org/embed"></iframe>"#)?.host == "other.example.org")
    #expect(EmbeddedMedia.htmlLink(#"<iframe src="file:///etc/passwd"></iframe>"#) == nil)
    for html in [#"<iframe src="https://evil.example.org/embed"></iframe>"#, #"<iframe srcdoc="<script>alert(1)</script>" src="https://www.youtube.com/embed/M7lc1UVf-VE"></iframe>"#, #"<img src="https://images.example.org/a.png" src="https://images.example.org/b.png">"#, #"<script src="https://www.youtube.com/embed/M7lc1UVf-VE"></script>"#, #"<iframe src="https://www.youtube.com/embed/M7lc1UVf-VE"></iframe><script>alert(1)</script>"#] {
        #expect(EmbeddedMedia.html(html) == nil)
    }
}

@Test @MainActor func playerUsesAppIdentityAndRealWebKitPermissionDelegates() throws {
    let media = try #require(EmbeddedMedia.video("https://youtu.be/M7lc1UVf-VE"))
    let request = try #require(PlayerNavigationPolicy.request(media, bundleID: "com.alkinum.melted"))
    #expect(request.value(forHTTPHeaderField: "Referer") == "https://com.alkinum.melted/")
    #expect(request.value(forHTTPHeaderField: "Authorization") == nil)
    #expect(PlayerNavigationPolicy.request(media, bundleID: nil) == nil)
    #expect(PlayerNavigationPolicy.allows(media.playerURL!, media: media, mainFrame: true))
    for url in ["https://evil.example.org/", "file:///etc/passwd", "melted://action", "https://www.youtube-nocookie.com/account", "https://www.youtube-nocookie.com.evil.example.org/embed/M7lc1UVf-VE"] {
        #expect(!PlayerNavigationPolicy.allows(URL(string: url)!, media: media, mainFrame: true))
    }
    let coordinator = EmbeddedPlayer.Coordinator(EmbeddedPlayer(media: media, loaded: {}, failed: {}, openURL: { _ in }))
    // Incorrect actor annotations on optional ObjC requirements can compile with warnings and silently skip policy enforcement.
    for selector in ["webView:decidePolicyForNavigationAction:decisionHandler:", "webView:decidePolicyForNavigationResponse:decisionHandler:", "webView:requestMediaCapturePermissionForOrigin:initiatedByFrame:type:decisionHandler:", "webView:didReceiveAuthenticationChallenge:completionHandler:"] {
        #expect(coordinator.responds(to: NSSelectorFromString(selector)))
    }
    #if os(macOS)
    #expect(coordinator.responds(to: NSSelectorFromString("webView:runOpenPanelWithParameters:initiatedByFrame:completionHandler:")))
    #endif
}

private let png = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=")!

@Test func imageDecoderBoundsBytesAndRejectsHTMLAndSVG() throws {
    let image = try RemoteImageLoader.decode(png)
    #expect(image.width == 1 && image.height == 1)
    for data in [Data("<html>not an image</html>".utf8), Data("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>".utf8), Data(repeating: 0, count: RemoteImageLoader.maximumBytes + 1)] {
        #expect(throws: MediaLoadError.self) { try RemoteImageLoader.decode(data) }
    }
}

private final class ImageFixtureProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "images.example.org" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        #expect(request.value(forHTTPHeaderField: "Authorization") == nil)
        #expect(request.value(forHTTPHeaderField: "Cookie") == nil)
        let path = request.url!.path
        let status = path == "/redirect" ? 302 : 200
        let type = path == "/html" ? "text/html" : "image/png"
        var headers = ["Content-Type": type]
        if path == "/large" { headers["Content-Length"] = String(RemoteImageLoader.maximumBytes + 1) }
        if path == "/redirect" { headers["Location"] = "https://other.example.org/image.png" }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        if path == "/slow" { return }
        if path == "/stream-large" {
            client?.urlProtocol(self, didLoad: Data(repeating: 0, count: RemoteImageLoader.maximumBytes + 1))
            client?.urlProtocolDidFinishLoading(self)
            return
        }
        client?.urlProtocol(self, didLoad: path == "/invalid" ? Data("not an image".utf8) : png)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@Test func imageTransportIsIsolatedAndRejectsBadResponses() async throws {
    func configuration() -> URLSessionConfiguration {
        let c = URLSessionConfiguration.ephemeral
        c.protocolClasses = [ImageFixtureProtocol.self]
        c.httpAdditionalHeaders = ["Authorization": "must-not-escape", "Cookie": "must-not-escape"]
        return c
    }
    let image = try await RemoteImageLoader.load(URL(string: "https://images.example.org/ok")!, configuration: configuration())
    #expect(image.width == 1)
    for path in ["html", "large", "stream-large", "redirect", "invalid"] {
        await #expect(throws: MediaLoadError.self) { try await RemoteImageLoader.load(URL(string: "https://images.example.org/\(path)")!, configuration: configuration()) }
    }
    let cancelled = Task { try await RemoteImageLoader.load(URL(string: "https://images.example.org/slow")!, configuration: configuration()) }
    try await Task.sleep(for: .milliseconds(50))
    cancelled.cancel()
    do { _ = try await cancelled.value; Issue.record("Cancelled image fetch returned an image") }
    catch { #expect(error is CancellationError || (error as? URLError)?.code == .cancelled) }
    let session = URLSession(configuration: .ephemeral)
    defer { session.invalidateAndCancel() }
    let task = session.dataTask(with: URL(string: "https://images.example.org/redirect")!)
    ImageRequestPolicy().urlSession(session, task: task,
        willPerformHTTPRedirection: HTTPURLResponse(url: task.originalRequest!.url!, statusCode: 302, httpVersion: nil, headerFields: nil)!,
        newRequest: URLRequest(url: URL(string: "https://other.example.org/image.png")!)) { request in
        #expect(request == nil)
    }
}

@Test(.enabled(if: ProcessInfo.processInfo.environment["MELTED_LIVE_MEDIA"] == "1"))
func publicWebPDecodesThroughTheProductionImageTransport() async throws {
    let image = try await RemoteImageLoader.load(URL(string: "https://www.gstatic.com/webp/gallery/1.webp")!)
    #expect(image.width > 0 && image.height > 0)
    print("Public WebP decoded: \(image.width) × \(image.height)")
}
