// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore

/// The row's selection owns feedback; pressing an already selected row is inert.
public struct ContentRowButtonStyle: ButtonStyle {
    public init() {}
    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
    }
}

/// A feed-style content row with rich preview and native macOS polish
public struct ContentRowView: View {
    private let item: Briefing
    private let category: String
    private let isSelected: Bool

    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isHovered = false

    public init(item: Briefing, category: String, isSelected: Bool = false) {
        self.item = item
        self.category = category
        self.isSelected = isSelected
    }

    public var body: some View {
        let palette = MeltedPalette(scheme)
        VStack(alignment: .leading, spacing: 10) {
            // Title - bold and prominent
            Text(item.title)
                .font(.system(size: 14, weight: item.state.read ? .medium : .bold))
                .foregroundStyle(isSelected ? palette.accent : palette.text)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)

            // Rich summary preview - feed style
            if !item.summary.isEmpty {
                Text(item.summary)
                    .font(.system(size: 12.5))
                    .foregroundStyle(palette.secondary)
                    .lineLimit(4)
                    .lineSpacing(2.5)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // Metadata row
            HStack(alignment: .center, spacing: 10) {
                if !category.isEmpty {
                    CategoryLabel(category, isSelected: isSelected)
                }

                Spacer(minLength: 0)

                HStack(spacing: 6) {
                    if !item.state.read {
                        Circle()
                            .fill(palette.accent)
                            .frame(width: 7, height: 7)
                            .transition(.scale.combined(with: .opacity))
                    }

                    if item.state.saved {
                        Image(systemName: "bookmark.fill")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(palette.accent)
                    }

                    Text(item.updatedAt, format: timeFormat)
                        .font(.system(size: 11.5))
                        .foregroundStyle(palette.secondary)
                        .monospacedDigit()
                }
            }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(backgroundMaterial(palette))
        .contentShape(Rectangle())
        .onHover { isHovered = $0 }
        .animation(reduceMotion ? nil : .easeOut(duration: MeltedMotion.feedback), value: isHovered && !isSelected)
        .animation(reduceMotion ? nil : .easeOut(duration: MeltedMotion.selection), value: isSelected)
        .accessibilityElement(children: .combine)
        .accessibilityValue(item.state.read ? "已读" : "未读")
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    private func backgroundMaterial(_ palette: MeltedPalette) -> some View {
        // Keep one shape alive so selection only interpolates its colors and border.
        RoundedRectangle(cornerRadius: 10)
            .fill(isSelected ? palette.accent.opacity(0.12) : (isHovered ? palette.canvas.opacity(0.7) : .clear))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(isSelected ? palette.accent.opacity(0.4) : (isHovered ? palette.separator.opacity(0.3) : .clear),
                                  lineWidth: isSelected ? 1.5 : 0.5)
            )
            .shadow(color: palette.accent.opacity(isSelected ? 0.15 : 0), radius: 4, x: 0, y: 1)
    }

    private var timeFormat: Date.FormatStyle {
        let calendar = Calendar.current
        if calendar.isDateInToday(item.updatedAt) {
            // 今日显示 HH:MM
            return .dateTime.hour().minute()
        } else if calendar.isDateInYesterday(item.updatedAt) {
            // 昨日显示 "昨天"
            return .dateTime.month().day()
        } else if calendar.isDate(item.updatedAt, equalTo: .now, toGranularity: .year) {
            // 今年显示月日
            return .dateTime.month().day()
        } else {
            // 更早显示年月日
            return .dateTime.year().month().day()
        }
    }
}
