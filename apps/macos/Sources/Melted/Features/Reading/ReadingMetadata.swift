// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

/// Appendix below the article: taxonomy and evidence as one quiet labeled grid,
/// set apart from the body by space and a hairline, in smaller secondary type.
struct ReadingMetadata: View {
    let item: Briefing
    let termName: (String?) -> String
    @Binding var evidenceOpen: Bool
    let openSource: (URL) -> Void
    @Environment(\.colorScheme) private var scheme
    private var palette: MeltedPalette { MeltedPalette(scheme) }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Rectangle()
                .fill(palette.separator)
                .frame(height: 1)

            Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 20, verticalSpacing: 10) {
                if let category = item.categoryId {
                    row("分类") { value(termName(category)) }
                }
                if !item.tagIds.isEmpty {
                    row("标签") { value(item.tagIds.map { termName($0) }.joined(separator: "、")) }
                }
                if !item.subjectIds.isEmpty {
                    row("关注") { value(item.subjectIds.map { termName($0) }.joined(separator: "、")) }
                }
                row("依据") {
                    ReadingEvidence(item: item, evidenceOpen: $evidenceOpen, openSource: openSource)
                }
            }
        }
        .padding(.top, MeltedReading.sectionSpacing)
    }

    private func row<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        GridRow {
            Text(title)
                .font(.system(size: MeltedType.metadata, weight: .medium))
                .foregroundStyle(palette.secondary.opacity(0.8))
                .gridColumnAlignment(.leading)
            content()
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func value(_ text: String) -> some View {
        Text(text)
            .font(.system(size: MeltedType.metadata))
            .foregroundStyle(palette.secondary)
            .textSelection(.enabled)
            .fixedSize(horizontal: false, vertical: true)
    }
}
