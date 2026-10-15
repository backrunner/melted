import SwiftUI
import MeltedCore

/// A feed-style content row with rich preview and native macOS polish
public struct ContentRowView: View {
    private let item: Briefing
    private let category: String
    private let isSelected: Bool

    @Environment(\.colorScheme) private var scheme
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
        .animation(.spring(response: 0.2, dampingFraction: 0.85), value: isHovered)
        .animation(.spring(response: 0.25, dampingFraction: 0.8), value: isSelected)
        .animation(.spring(response: 0.2, dampingFraction: 0.85), value: item.state.read)
        .accessibilityElement(children: .combine)
        .accessibilityValue(item.state.read ? "已读" : "未读")
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    @ViewBuilder
    private func backgroundMaterial(_ palette: MeltedPalette) -> some View {
        if isSelected {
            RoundedRectangle(cornerRadius: 10)
                .fill(palette.accent.opacity(0.12))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(palette.accent.opacity(0.4), lineWidth: 1.5)
                )
                .shadow(color: palette.accent.opacity(0.15), radius: 4, x: 0, y: 1)
        } else if isHovered {
            RoundedRectangle(cornerRadius: 10)
                .fill(palette.canvas.opacity(0.7))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(palette.separator.opacity(0.3), lineWidth: 0.5)
                )
        } else {
            Color.clear
        }
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
