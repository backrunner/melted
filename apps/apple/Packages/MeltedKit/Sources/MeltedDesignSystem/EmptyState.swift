// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// Empty or no-result state. The symbol sits on a soft tile whose lower edge slowly
/// melts into a drip, echoing the brand mark; then a title, one line of help, and an optional action.
public struct EmptyState: View {
    private let icon: String
    private let title: String
    private let description: String
    private let action: (() -> Void)?
    private let actionLabel: String?

    @Environment(\.colorScheme) private var scheme

    public init(
        icon: String,
        title: String,
        description: String,
        action: (() -> Void)? = nil,
        actionLabel: String? = nil
    ) {
        self.icon = icon
        self.title = title
        self.description = description
        self.action = action
        self.actionLabel = actionLabel
    }

    public var body: some View {
        let palette = MeltedPalette(scheme)
        VStack(spacing: 20) {
            MeltingTile(icon: icon)
                .meltedEntrance(0)

            VStack(spacing: 6) {
                Text(title)
                    .font(.system(size: MeltedType.section, weight: .semibold))
                    .foregroundStyle(palette.text)
                Text(description)
                    .font(.system(size: MeltedType.control))
                    .foregroundStyle(palette.secondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .meltedEntrance(1)

            if let action, let actionLabel {
                Button(actionLabel, action: action)
                    .buttonStyle(MeltedSecondaryButtonStyle())
                    .frame(height: 30)
                    .meltedEntrance(2)
            }
        }
        .frame(maxWidth: 320)
        .padding(32)
        .accessibilityElement(children: .combine)
    }
}

private struct MeltingTile: View {
    let icon: String
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let palette = MeltedPalette(scheme)
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { timeline in
            let t = reduceMotion ? 1.2 : timeline.date.timeIntervalSinceReferenceDate
            Canvas { context, size in
                // Blur then threshold, so tile, drip and drop fuse into one liquid outline.
                context.addFilter(.alphaThreshold(min: 0.5, color: palette.accent))
                context.addFilter(.blur(radius: 4))
                context.drawLayer { layer in
                    let tile = CGRect(x: 8, y: 6, width: size.width - 16, height: 64)
                    layer.fill(Path(roundedRect: tile, cornerRadius: 18, style: .continuous), with: .color(.black))
                    let x = tile.minX + tile.width * 0.68
                    let stretch = 0.5 + 0.5 * sin(t * 0.9)
                    let length = 8 + 14 * stretch
                    layer.fill(Path(roundedRect: CGRect(x: x - 5, y: tile.maxY - 12, width: 10, height: length + 12), cornerRadius: 5), with: .color(.black))
                    let cycle = (t * 0.32).truncatingRemainder(dividingBy: 1)
                    let dropY = tile.maxY + length + cycle * cycle * (size.height - tile.maxY - length + 8)
                    let r = 5.5 * (1 - 0.35 * cycle)
                    layer.fill(Path(ellipseIn: CGRect(x: x - r, y: dropY - r, width: r * 2, height: r * 2)), with: .color(.black))
                }
            }
            .opacity(scheme == .dark ? 0.2 : 0.13)
        }
        .frame(width: 80, height: 104)
        .overlay(alignment: .top) {
            Image(systemName: icon)
                .font(.system(size: 26, weight: .regular))
                .foregroundStyle(palette.accent)
                .frame(height: 64)
                .padding(.top, 6)
        }
        .accessibilityHidden(true)
    }
}
