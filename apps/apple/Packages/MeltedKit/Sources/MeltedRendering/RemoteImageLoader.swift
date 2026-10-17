// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import ImageIO
import UniformTypeIdentifiers

enum MediaLoadError: Error { case denied, response, tooLarge, invalidImage }

/// Separate ephemeral transport: never inherits the API session, cookies, cache or credentials.
enum RemoteImageLoader {
    static let maximumBytes = 8 * 1024 * 1024
    static let maximumPixels = 40_000_000

    static func load(_ url: URL, configuration: URLSessionConfiguration = .ephemeral) async throws -> CGImage {
        try Task.checkCancellation()
        guard EmbeddedMedia.publicURL(url.absoluteString) != nil else { throw MediaLoadError.denied }
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.httpAdditionalHeaders = nil
        configuration.urlCredentialStorage = nil
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 20
        let session = URLSession(configuration: configuration, delegate: ImageRequestPolicy(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        return try await withTaskCancellationHandler {
            try await read(url, session: session)
        } onCancel: {
            session.invalidateAndCancel()
        }
    }

    private static func read(_ url: URL, session: URLSession) async throws -> CGImage {
        var request = URLRequest(url: url)
        request.setValue("image/png,image/jpeg,image/gif,image/webp", forHTTPHeaderField: "Accept")
        let (stream, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              ["image/png", "image/jpeg", "image/gif", "image/webp"].contains(http.mimeType?.lowercased() ?? "") else { throw MediaLoadError.response }
        guard response.expectedContentLength <= maximumBytes else { throw MediaLoadError.tooLarge }
        var data = Data()
        for try await byte in stream {
            if data.count.isMultiple(of: 8192) { try Task.checkCancellation() }
            guard data.count < maximumBytes else { throw MediaLoadError.tooLarge }
            data.append(byte)
        }
        try Task.checkCancellation()
        let image = try decode(data)
        try Task.checkCancellation()
        return image
    }

    static func decode(_ data: Data) throws -> CGImage {
        guard data.count <= maximumBytes else { throw MediaLoadError.tooLarge }
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              let type = CGImageSourceGetType(source) as String?,
              [UTType.png.identifier, UTType.jpeg.identifier, UTType.gif.identifier, UTType.webP.identifier].contains(type),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let w = properties[kCGImagePropertyPixelWidth] as? NSNumber,
              let h = properties[kCGImagePropertyPixelHeight] as? NSNumber,
              w.doubleValue > 0, h.doubleValue > 0, w.doubleValue * h.doubleValue <= Double(maximumPixels),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 2048,
                kCGImageSourceShouldCacheImmediately: true
              ] as CFDictionary) else { throw MediaLoadError.invalidImage }
        return image
    }
}

final class ImageRequestPolicy: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping @Sendable (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        completionHandler(challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust ? .performDefaultHandling : .cancelAuthenticationChallenge, nil)
    }
}
