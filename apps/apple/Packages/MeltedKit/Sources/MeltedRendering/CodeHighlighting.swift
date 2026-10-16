// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import HighlightSwift
import SwiftUI
import MeltedDesignSystem

/// Highlighting is a presentation transform. It must never alter the source or execute it.
enum CodeHighlighting {
    private static let engine = Highlight()
    static let maximumHighlightedBytes = 64 * 1024

    static func language(_ info: String?) -> String? {
        guard let word = info?.split(whereSeparator: { $0.isWhitespace }).first else { return nil }
        let value = String(word.prefix(64)).lowercased()
        return ["js": "javascript", "ts": "typescript", "py": "python", "sh": "bash",
                "zsh": "bash", "yml": "yaml", "c++": "cpp", "c#": "csharp",
                "html": "xml", "htm": "xml", "text": "plaintext", "txt": "plaintext"] [value] ?? value
    }

    static func text(_ source: String, language: String?, dark: Bool) async -> AttributedString {
        let plain = AttributedString(source)
        guard !Task.isCancelled, !source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              source.utf8.count <= maximumHighlightedBytes,
              language != "plaintext" else { return plain }
        do {
            let colors = HighlightColors.custom(css: MeltedPalette(dark ? .dark : .light).codeHighlightCSS)
            let highlighted: AttributedString
            if let language {
                highlighted = try await engine.attributedText(source, language: language, colors: colors)
            } else {
                highlighted = try await engine.attributedText(source, colors: colors)
            }
            guard !Task.isCancelled else { return plain }
            let rendered = String(highlighted.characters)
            if rendered == source { return highlighted }
            // The upstream HTML importer trims boundary whitespace. Restore it only when the
            // complete remaining body matches; otherwise keep the original as plain mono text.
            guard !rendered.isEmpty, let range = source.range(of: rendered),
                  source[..<range.lowerBound].allSatisfy(\.isWhitespace),
                  source[range.upperBound...].allSatisfy(\.isWhitespace) else { return plain }
            return AttributedString(String(source[..<range.lowerBound])) + highlighted
                + AttributedString(String(source[range.upperBound...]))
        } catch {
            return plain
        }
    }
}
