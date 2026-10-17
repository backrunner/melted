// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem
import MeltedRendering

/// Evidence status and its sources. Collapsed it is one line of text with a single
/// disclosure control; expanded, sources read as a numbered list, not as cards.
struct ReadingEvidence: View {
    let item: Briefing
    @Binding var evidenceOpen: Bool
    let openSource: (URL) -> Void
    @Environment(\.colorScheme) private var scheme
    private var palette: MeltedPalette { MeltedPalette(scheme) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                // The header already shows a status that needs attention; don't repeat it here.
                if !item.requiresEvidenceNotice {
                    Text(item.evidenceLabel)
                        .font(.system(size: MeltedType.metadata))
                        .foregroundStyle(palette.secondary)
                }
                if !item.evidence.isEmpty {
                    MeltedDisclosureToggle(isExpanded: $evidenceOpen) {
                        Text("\(item.evidence.count) 个来源")
                            .font(.system(size: MeltedType.metadata, weight: .medium))
                            .alignmentGuide(.firstTextBaseline) { $0[.firstTextBaseline] }
                    }
                    .accessibilityLabel(evidenceOpen ? "收起来源" : "展开 \(item.evidence.count) 个来源")
                } else if item.requiresEvidenceNotice {
                    Text("暂无来源")
                        .font(.system(size: MeltedType.metadata))
                        .foregroundStyle(palette.secondary)
                }
            }

            if evidenceOpen && !item.evidence.isEmpty {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(Array(item.evidence.enumerated()), id: \.offset) { index, evidence in
                        source(index + 1, evidence)
                    }
                }
                .transition(.opacity)
            }
        }
    }

    private func source(_ number: Int, _ evidence: Evidence) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text("\(number)")
                .font(.system(size: MeltedType.metadata, weight: .medium))
                .monospacedDigit()
                .foregroundStyle(palette.secondary.opacity(0.7))
                .frame(width: 14, alignment: .trailing)
            VStack(alignment: .leading, spacing: 4) {
                // A linked source is its own title; no separate "view source" button.
                if let url = SafeLinks.url(evidence.url) {
                    Button { openSource(url) } label: {
                        Text(evidence.title).underline(true, color: palette.accent.opacity(0.35))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(palette.accent)
                    .help(url.absoluteString)
                } else {
                    Text(evidence.title).foregroundStyle(palette.text)
                }
                Text(evidence.excerpt)
                    .foregroundStyle(palette.secondary)
                    .lineSpacing(3)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .font(.system(size: MeltedType.metadata))
        }
    }
}
