// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import WebKit

enum PlayerNavigationPolicy {
    static func allows(_ url: URL, media: EmbeddedMedia, mainFrame: Bool) -> Bool {
        guard EmbeddedMedia.publicURL(url.absoluteString) != nil, let player = media.playerURL else { return false }
        if mainFrame { return url.host == player.host && url.path == player.path }
        let domains = media.kind == .youtube ? ["youtube.com", "youtube-nocookie.com", "googlevideo.com", "ytimg.com"] : ["bilibili.com", "bilivideo.com", "hdslb.com"]
        let host = url.host!.lowercased()
        return domains.contains { host == $0 || host.hasSuffix("." + $0) }
    }

    static func request(_ media: EmbeddedMedia, bundleID: String?) -> URLRequest? {
        guard let url = media.playerURL, let bundleID, bundleID.range(of: #"^[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)+$"#, options: .regularExpression) != nil else { return nil }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        // YouTube requires app identity even for non-store desktop distribution.
        request.setValue("https://" + bundleID.lowercased() + "/", forHTTPHeaderField: "Referer")
        return request
    }
}

/// Only canonical provider player pages enter WebKit. Never loads source HTML or installs a native bridge.
struct EmbeddedPlayer {
    let media: EmbeddedMedia
    let loaded: () -> Void
    let failed: () -> Void
    let openURL: (URL) -> Void

    @MainActor final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let parent: EmbeddedPlayer
        private var timer: Task<Void, Never>?
        private var stopped = false
        init(_ parent: EmbeddedPlayer) { self.parent = parent }

        func makeView() -> WKWebView {
            let config = WKWebViewConfiguration()
            config.websiteDataStore = .nonPersistent()
            config.preferences.javaScriptCanOpenWindowsAutomatically = false
            config.preferences.isElementFullscreenEnabled = true
            config.mediaTypesRequiringUserActionForPlayback = .all
            config.allowsAirPlayForMediaPlayback = false
            #if os(iOS)
            config.allowsInlineMediaPlayback = true
            #endif
            let view = WKWebView(frame: .zero, configuration: config)
            view.navigationDelegate = self
            view.uiDelegate = self
            view.allowsBackForwardNavigationGestures = false
            guard let request = PlayerNavigationPolicy.request(parent.media, bundleID: Bundle.main.bundleIdentifier) else {
                Task { self.fail() }
                return view
            }
            view.load(request)
            timer = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(20)) } catch { return }
                self?.fail()
            }
            return view
        }

        func stop(_ view: WKWebView) {
            stopped = true
            timer?.cancel()
            view.pauseAllMediaPlayback(completionHandler: nil)
            view.stopLoading()
            view.navigationDelegate = nil
            view.uiDelegate = nil
            view.loadHTMLString("", baseURL: nil)
        }
        private func fail() {
            guard !stopped else { return }
            timer?.cancel()
            parent.failed()
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard !stopped else { return }
            timer?.cancel()
            parent.loaded() // Page loaded, not a claim that media playback succeeded.
        }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { fail() }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { fail() }
        func webView(_ webView: WKWebView, didReceive challenge: URLAuthenticationChallenge,
                     completionHandler: @escaping @MainActor @Sendable (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
            completionHandler(challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust ? .performDefaultHandling : .cancelAuthenticationChallenge, nil)
        }
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { fail() }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
            guard !stopped, let url = navigationAction.request.url, !navigationAction.shouldPerformDownload else { decisionHandler(.cancel); return }
            if PlayerNavigationPolicy.allows(url, media: parent.media, mainFrame: navigationAction.targetFrame?.isMainFrame != false) {
                decisionHandler(.allow)
            } else {
                decisionHandler(.cancel)
                if navigationAction.navigationType == .linkActivated, let safe = SafeLinks.url(url.absoluteString) { parent.openURL(safe) }
            }
        }
        func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                     decisionHandler: @escaping @MainActor @Sendable (WKNavigationResponsePolicy) -> Void) {
            let success = navigationResponse.canShowMIMEType && ((navigationResponse.response as? HTTPURLResponse).map { (200..<400).contains($0.statusCode) } ?? false)
            decisionHandler(success ? .allow : .cancel)
            if !success && navigationResponse.isForMainFrame { fail() }
        }
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if navigationAction.navigationType == .linkActivated, let safe = SafeLinks.url(navigationAction.request.url?.absoluteString) { parent.openURL(safe) }
            return nil
        }
        func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                     initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping @MainActor @Sendable (WKPermissionDecision) -> Void) {
            decisionHandler(.deny)
        }
        #if os(macOS)
        func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo,
                     completionHandler: @escaping @MainActor @Sendable ([URL]?) -> Void) {
            completionHandler(nil)
        }
        #elseif os(iOS)
        func webView(_ webView: WKWebView, requestDeviceOrientationAndMotionPermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo,
                     decisionHandler: @escaping @MainActor @Sendable (WKPermissionDecision) -> Void) {
            decisionHandler(.deny)
        }
        #endif
        @available(macOS 27.0, iOS 27.0, *)
        func webView(_ webView: WKWebView, requestGeolocationPermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo,
                     decisionHandler: @escaping @MainActor @Sendable (WKPermissionDecision) -> Void) {
            decisionHandler(.deny)
        }
    }
}

#if os(macOS)
extension EmbeddedPlayer: NSViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeNSView(context: Context) -> WKWebView { context.coordinator.makeView() }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
    static func dismantleNSView(_ nsView: WKWebView, coordinator: Coordinator) { coordinator.stop(nsView) }
}
#elseif os(iOS)
extension EmbeddedPlayer: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> WKWebView { context.coordinator.makeView() }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) { coordinator.stop(uiView) }
}
#endif
