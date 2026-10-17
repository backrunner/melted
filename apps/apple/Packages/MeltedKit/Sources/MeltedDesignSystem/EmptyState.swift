// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// A compact illustration and its copy stay still while liquid falls behind them
/// to the bottom of the available pane. Decorative drawing never takes input.
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
        VStack(spacing: MeltedEmptyState.contentGap) {
            Color.clear
                .frame(width: MeltedEmptyState.illustrationWidth, height: MeltedEmptyState.illustrationHeight)
                .overlay(alignment: .top) {
                    Image(systemName: icon)
                        .font(.system(size: 26, weight: .regular))
                        .foregroundStyle(palette.accent)
                        .frame(height: MeltedEmptyState.tileSize)
                        .padding(.top, MeltedEmptyState.tileTop)
                }
                .anchorPreference(key: MeltingTileBounds.self, value: .bounds) { $0 }
                .accessibilityHidden(true)

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
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .backgroundPreferenceValue(MeltingTileBounds.self) { anchor in
            GeometryReader { proxy in
                if let anchor {
                    EmptyStateLiquid(tileBounds: proxy[anchor])
                }
            }
        }
        .clipped()
        .accessibilityElement(children: .combine)
    }
}

private struct MeltingTileBounds: PreferenceKey {
    static let defaultValue: Anchor<CGRect>? = nil
    static func reduce(value: inout Anchor<CGRect>?, nextValue: () -> Anchor<CGRect>?) {
        value = nextValue() ?? value
    }
}

private struct EmptyStateLiquid: View {
    let tileBounds: CGRect
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var seed = Double.random(in: 0...1000)

    var body: some View {
        let palette = MeltedPalette(scheme)
        TimelineView(.animation(paused: reduceMotion)) { timeline in
            let t = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate
            Canvas { context, size in
                let tile = CGRect(x: tileBounds.minX + MeltedEmptyState.tileInset,
                                  y: tileBounds.minY + MeltedEmptyState.tileTop,
                                  width: MeltedEmptyState.tileSize, height: MeltedEmptyState.tileSize)
                let corner = MeltedEmptyState.tileCornerRadius
                context.fill(Path(roundedRect: tile, cornerRadius: corner, style: .continuous),
                             with: .color(palette.accent))
                // The drip hangs from the tile's actual bottom edge, rising into the
                // corners, so its shoulders blend into the outline instead of crossing it.
                let edge: (Double) -> Double = { x in
                    let into = min(corner, max(0, abs(x - tile.midX) - (tile.width / 2 - corner)))
                    return tile.maxY - (corner - sqrt(corner * corner - into * into))
                }
                let radius = 6.2
                // Keep the whole shoulder on the flat edge or the shallow start of a corner.
                let positionRange = max(0, tile.width / 2 - corner + 3 - radius * 1.18 * MeltedLiquid.Drip.rootSpread)
                MeltedLiquid.Drip(x: tile.midX, source: edge, pool: { _ in size.height },
                                  reach: 19, radius: radius, positionRange: positionRange)
                    .draw(in: &context, time: t, period: 7.6, offset: reduceMotion ? 0 : seed,
                          seed: seed, tint: palette.accent)
            }
            .opacity(scheme == .dark ? 0.2 : 0.13)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
