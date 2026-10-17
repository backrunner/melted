// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later

enum CodeBlockPresentation {
    /// Markdown ends the last code line with a delimiter. Text would lay out a
    /// phantom line after it; hide that delimiter, retaining intentional blank lines.
    /// Copying continues to use the untouched source.
    static func text(_ source: String) -> String {
        switch source.last {
        case "\n", "\r\n", "\r": String(source.dropLast())
        default: source
        }
    }
}
