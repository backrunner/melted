// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore

/// The row's selection owns feedback; pressing an already selected row is inert.
/// Keyboard focus draws its own ring so it matches the row's rounded shape.
public struct ContentRowButtonStyle: ButtonStyle {
    public init() {}
    public func makeBody(configuration: Configuration) -> some View {
        ContentRowFocusRing(label: configuration.label)
    }
}

private struct ContentRowFocusRing<Label: View>: View {
    let label: Label
    @Environment(\.isFocused) private var isFocused
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        label.overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(MeltedPalette(scheme).accent.opacity(isFocused ? 0.7 : 0), lineWidth: 2)
        }
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
                .foregroundStyle(palette.text)
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
        .animation(reduceMotion ? nil : .easeOut(duration: MeltedMotion.feedback), value: isHovered)
        .animation(reduceMotion ? nil : .easeOut(duration: MeltedMotion.selection), value: isSelected)
        .accessibilityElement(children: .combine)
        .accessibilityValue(item.state.read ? "已读" : "未读")
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    private func backgroundMaterial(_ palette: MeltedPalette) -> some View {
        // Keep one shape alive so hover and selection only interpolate color, never geometry.
        // Hover is a light wash; selection is the solid sand tone with a hairline accent edge.
        let fill: Color = isSelected ? palette.selection : (isHovered ? palette.selection.opacity(0.55) : palette.selection.opacity(0))
        return RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(fill)
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(palette.accent.opacity(isSelected ? 0.28 : 0), lineWidth: 1)
            )
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
