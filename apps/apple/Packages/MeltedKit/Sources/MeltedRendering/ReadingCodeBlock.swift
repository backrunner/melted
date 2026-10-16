// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedDesignSystem
#if os(macOS)
import AppKit
#else
import UIKit
#endif

struct ReadingCodeBlock: View {
    let source: String
    let info: String?
    let scale: CGFloat
    @Environment(\.colorScheme) private var scheme
    @State private var highlighted: AttributedString?
    @State private var highlightedRequest: Request?
    @State private var copied = false
    @State private var copyGeneration = 0

    private struct Request: Hashable {
        let source: String
        let language: String?
        let dark: Bool
    }
    private var request: Request { .init(source: source, language: CodeHighlighting.language(info), dark: scheme == .dark) }
    private var palette: MeltedPalette { MeltedPalette(scheme) }
    private var languageLabel: String {
        guard let language = request.language, language != "plaintext" else { return "代码" }
        return ["javascript": "JavaScript", "typescript": "TypeScript", "xml": "HTML / XML",
                "json": "JSON", "sql": "SQL", "yaml": "YAML", "cpp": "C++", "csharp": "C#"] [language]
            ?? language.capitalized
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(languageLabel)
                    .font(.system(size: MeltedCode.labelSize, weight: .medium, design: .monospaced))
                    .foregroundStyle(palette.secondary)
                    .lineLimit(1)
                Spacer(minLength: 12)
                Button(action: copy) {
                    Label(copied ? "已复制" : "复制", systemImage: copied ? "checkmark" : "doc.on.doc")
                        .font(.system(size: MeltedCode.labelSize, weight: .medium))
                        .frame(minHeight: 28)
                }
                .buttonStyle(.plain)
                .fixedSize()
                .foregroundStyle(copied ? palette.accent : palette.secondary)
                .help("复制完整代码")
                .accessibilityLabel(copied ? "代码已复制" : "复制代码")
            }
            .padding(.horizontal, MeltedCode.inset)
            .frame(minHeight: MeltedCode.headerHeight)

            Rectangle().fill(palette.separator).frame(height: MeltedCode.borderWidth)

            ScrollView(.horizontal, showsIndicators: true) {
                Text(highlightedRequest == request ? (highlighted ?? AttributedString(source)) : AttributedString(source))
                    .font(.system(size: MeltedReading.codeSize * scale, design: .monospaced))
                    .foregroundStyle(palette.text)
                    .lineSpacing(MeltedCode.lineSpacing * scale)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: true, vertical: true)
                    .padding(MeltedCode.inset)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(palette.canvas)
        .clipShape(RoundedRectangle(cornerRadius: MeltedCode.cornerRadius))
        .overlay {
            RoundedRectangle(cornerRadius: MeltedCode.cornerRadius)
                .strokeBorder(palette.separator, lineWidth: MeltedCode.borderWidth)
        }
        .task(id: request) {
            let current = request
            let result = await CodeHighlighting.text(current.source, language: current.language, dark: current.dark)
            guard !Task.isCancelled, current == request else { return }
            highlighted = result
            highlightedRequest = current
        }
        .task(id: copyGeneration) {
            guard copied else { return }
            do { try await Task.sleep(for: .seconds(2)); copied = false } catch { }
        }
        .onChange(of: source) { _, _ in copied = false; copyGeneration += 1 }
    }

    private func copy() {
        #if os(macOS)
        NSPasteboard.general.clearContents()
        copied = NSPasteboard.general.setString(source, forType: .string)
        #else
        UIPasteboard.general.string = source
        copied = true
        #endif
        copyGeneration += 1
    }
}
