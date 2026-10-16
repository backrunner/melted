// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import Testing
@testable import MeltedRendering

@Test func syntaxColorsPreserveSourceInBothAppearances() async {
    let samples = [
        ("swift", "    let title = \"阅读与 café ☕\"\n    print(title) // 保留缩进\n\n"),
        ("typescript", "const message: string = \"Melted\";\nconsole.log(message);\n"),
        ("json", "{\"title\": \"文化\", \"count\": 42, \"enabled\": true}\n"),
        ("python", "def read(title):\n    return f\"阅读 {title}\"\n"),
        ("bash", "# 只作为文本展示\necho \"$PATH\"\n")
    ]
    for dark in [false, true] {
        for (language, source) in samples {
            let text = await CodeHighlighting.text(source, language: language, dark: dark)
            #expect(String(text.characters) == source, "Source changed for \(language)")
            #expect(text.runs.count > 1, "Expected token colors for \(language)")
        }
    }
}

@Test func syntaxFallbacksPreserveUnknownEmptyAndLargeCode() async {
    for source in ["", "\t  \n\n", "  literal <script>alert('x')</script> & 中文\n", String(repeating: "x", count: 70_000)] {
        for language in ["unknown-melted-language", "plaintext"] {
            let text = await CodeHighlighting.text(source, language: language, dark: false)
            #expect(String(text.characters) == source)
        }
    }
    let indented = "\tlet text = \"<&>\"\n\n"
    #expect(String(await CodeHighlighting.text(indented, language: "swift", dark: false).characters) == indented)
}

@Test func fencedLanguageInfoUsesAliasesWithoutTreatingOptionsAsLanguage() {
    #expect(CodeHighlighting.language("ts linenos") == "typescript")
    #expect(CodeHighlighting.language("SH") == "bash")
    #expect(CodeHighlighting.language("  json title=config.json") == "json")
    #expect(CodeHighlighting.language(nil) == nil)
    #expect(CodeHighlighting.language(" ") == nil)
}
