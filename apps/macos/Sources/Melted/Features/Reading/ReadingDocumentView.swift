// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

import MeltedRendering

struct ReadingDocumentView: View {
    let item: Briefing
    let compact: Bool
    let scale: Double
    let mutating: Bool
    let termName: (String?) -> String
    let toggleSaved: () -> Void
    let openSource: (URL) -> Void
    @State private var evidenceOpen = false
    var body: some View {
        ScrollViewReader { proxy in
            MeltedScrollView {
                VStack(alignment: .leading, spacing: MeltedReading.sectionSpacing) {
                    ReadingHeader(item: item, scale: scale, mutating: mutating, toggleSaved: toggleSaved).id("reading-top")
                    ReadingMarkdown(item.markdown, scale: scale)
                    ReadingMetadata(item: item, termName: termName, evidenceOpen: $evidenceOpen, openSource: openSource)
                }
                .padding(compact ? MeltedReading.compactInset : MeltedReading.contentInset)
                .frame(maxWidth: MeltedLayout.readingMaximum, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .top)
            }
            .onChange(of: item.id) { _, _ in evidenceOpen = false; proxy.scrollTo("reading-top", anchor: .top) }
        }
    }
}
