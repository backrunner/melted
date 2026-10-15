// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct ReadingHeader: View {
    let item: Briefing
    let scale: Double
    let mutating: Bool
    let toggleSaved: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var scheme
    private var palette: MeltedPalette { MeltedPalette(scheme) }
    var body: some View {
        VStack(alignment: .leading, spacing: MeltedReading.headingBodySpacing) {
            Text(item.title)
                .font(.system(size: MeltedType.title * scale, weight: .semibold))
                .lineSpacing(MeltedReading.titleLineSpacing * scale)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled).accessibilityAddTraits(.isHeader)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: MeltedReading.blockInset) {
                    updatedTime(item)
                    Spacer(minLength: MeltedReading.blockInset)
                    readingActions(item)
                }
                VStack(alignment: .leading, spacing: MeltedReading.headingBodySpacing) {
                    updatedTime(item)
                    readingActions(item)
                }
            }
            if item.requiresEvidenceNotice {
                Text(item.evidenceLabel)
                    .font(.system(size: MeltedType.control))
                    .foregroundStyle(palette.warning)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func updatedTime(_ item: Briefing) -> some View {
        let format: Date.FormatStyle = Calendar.current.isDate(item.updatedAt, equalTo: .now, toGranularity: .year)
            ? .dateTime.month().day().hour().minute()
            : .dateTime.year().month().day().hour().minute()
        return Text(item.updatedAt, format: format)
            .font(.system(size: MeltedType.metadata))
            .foregroundStyle(palette.secondary)
            .fixedSize()
            .help("更新时间 \(item.updatedAt.formatted(date: .complete, time: .shortened))")
            .accessibilityLabel("更新时间 \(item.updatedAt.formatted(date: .complete, time: .shortened))")
    }

    private func readingActions(_ item: Briefing) -> some View {
        HStack(spacing: 8) {
            // 只保留收藏按钮，更低调的样式
            Button {
                toggleSaved()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: item.state.saved ? "bookmark.fill" : "bookmark")
                        .font(.system(size: 11, weight: .medium))
                    Text(item.state.saved ? "已收藏" : "收藏")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundStyle(item.state.saved ? palette.accent : palette.secondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(item.state.saved ? palette.accent.opacity(0.08) : palette.canvas.opacity(0.5))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .strokeBorder(
                            item.state.saved ? palette.accent.opacity(0.25) : palette.separator.opacity(0.2),
                            lineWidth: 0.5
                        )
                )
            }
            .buttonStyle(.plain)
            .accessibilityLabel(item.state.saved ? "取消收藏" : "收藏")
            .help(item.state.saved ? "取消收藏" : "收藏这条资讯")

            if mutating {
                ProgressView()
                    .controlSize(.small)
                    .tint(palette.accent)
                    .accessibilityLabel("正在保存")
            }
        }
        .disabled(mutating)
        .animation(reduceMotion ? nil : .easeOut(duration: MeltedMotion.feedback), value: mutating)
        .animation(reduceMotion ? nil : .easeOut(duration: MeltedMotion.feedback), value: item.state.saved)
    }

}
