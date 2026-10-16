// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// Shown only while a filter or query is active, so the list never looks short for no reason.
/// It reports state and clears it; opening search stays on the keyboard shortcut.
public struct MeltedFilterChip: View {
    private let title: String
    private let open: () -> Void
    private let clear: () -> Void
    @State private var isHovered = false
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(_ title: String, open: @escaping () -> Void, clear: @escaping () -> Void) {
        self.title = title
        self.open = open
        self.clear = clear
    }

    public var body: some View {
        let palette = MeltedPalette(scheme)
        HStack(spacing: 6) {
            Button(action: open) {
                HStack(spacing: 6) {
                    Image(systemName: "line.3.horizontal.decrease")
                        .font(.system(size: 11, weight: .semibold))
                    Text(title)
                        .font(.system(size: MeltedType.metadata, weight: .medium))
                        .lineLimit(1)
                }
                .foregroundStyle(palette.accent)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("调整筛选（⌘F）")
            .accessibilityLabel("筛选：\(title)")

            Divider().frame(height: 12)

            Button(action: clear) {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(palette.secondary)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("清除搜索与筛选")
            .accessibilityLabel("清除搜索与筛选")
        }
        .padding(.horizontal, 9)
        .frame(height: 26)
        .background(palette.selection, in: Capsule())
        .overlay { Capsule().strokeBorder(palette.accent.opacity(isHovered ? 0.35 : 0.2), lineWidth: 1) }
        .onHover { isHovered = $0 }
        .animation(reduceMotion ? nil : MeltedMotion.hover, value: isHovered)
    }
}
