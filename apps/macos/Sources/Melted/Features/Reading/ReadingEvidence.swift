// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem
import MeltedRendering

struct ReadingEvidence: View {
    let item: Briefing
    @Binding var evidenceOpen: Bool
    let openSource: (URL) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var scheme
    private var palette: MeltedPalette { MeltedPalette(scheme) }
    var body: some View {
        DisclosureGroup(isExpanded: $evidenceOpen) {
            VStack(alignment: .leading, spacing: 16) {
                ForEach(Array(item.evidence.enumerated()), id: \.offset) { index, evidence in
                    VStack(alignment: .leading, spacing: 12) {
                        // Evidence number badge
                        HStack(spacing: 10) {
                            ZStack {
                                Circle()
                                    .fill(palette.accent.opacity(0.12))
                                Text("\(index + 1)")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundStyle(palette.accent)
                            }
                            .frame(width: 24, height: 24)

                            Text(evidence.title)
                                .font(.system(size: 13.5, weight: .semibold))
                                .foregroundStyle(palette.text)
                        }

                        Text(evidence.excerpt)
                            .font(.system(size: 12.5))
                            .foregroundStyle(palette.secondary)
                            .textSelection(.enabled)
                            .lineSpacing(4)
                            .fixedSize(horizontal: false, vertical: true)

                        if let url = SafeLinks.url(evidence.url) {
                            Button {
                                openSource(url)
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: "link")
                                        .font(.system(size: 11, weight: .semibold))
                                    Text("查看来源")
                                        .font(.system(size: 12, weight: .medium))
                                }
                                .foregroundStyle(palette.accent)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(palette.accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 6))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(18)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .strokeBorder(palette.separator.opacity(0.3), lineWidth: 0.5)
                    )
                }
                if item.evidence.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "doc.text.magnifyingglass")
                            .font(.system(size: 24, weight: .light))
                            .foregroundStyle(palette.secondary.opacity(0.6))
                        Text("暂无可查看的依据")
                            .font(.system(size: 13))
                            .foregroundStyle(palette.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
                }
            }
            .padding(.top, 16)
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "doc.text.magnifyingglass")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(palette.accent)
                    .frame(width: 24, height: 24)

                VStack(alignment: .leading, spacing: 2) {
                    Text("事实依据")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(palette.text)
                    if !item.requiresEvidenceNotice {
                        Text(item.evidenceLabel)
                            .font(.system(size: 11))
                            .foregroundStyle(palette.secondary)
                    }
                }

                Spacer()

                Image(systemName: evidenceOpen ? "chevron.up" : "chevron.down")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(palette.secondary.opacity(0.6))
                    .animation(reduceMotion ? nil : .easeOut(duration: MeltedMotion.feedback), value: evidenceOpen)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(palette.canvas.opacity(0.4), in: RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(palette.separator.opacity(0.2), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
    }
}
