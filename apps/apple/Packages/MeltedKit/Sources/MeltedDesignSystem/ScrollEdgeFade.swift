// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// Fades scrollable rows in viewport coordinates, leaving headings and native scrollers untouched.
public struct ScrollEdgeFade: ViewModifier {
    public let coordinateSpace: String
    public let viewportHeight: CGFloat
    public let topInset: CGFloat
    public let hiddenAbove: CGFloat
    public let hiddenBelow: CGFloat
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    public init(coordinateSpace: String, viewportHeight: CGFloat, topInset: CGFloat,
                hiddenAbove: CGFloat, hiddenBelow: CGFloat) {
        self.coordinateSpace = coordinateSpace
        self.viewportHeight = viewportHeight
        self.topInset = topInset
        self.hiddenAbove = hiddenAbove
        self.hiddenBelow = hiddenBelow
    }

    public func body(content: Content) -> some View {
        let inset = min(max(topInset, 0), max(viewportHeight, 0))
        let height = min(MeltedScrollEdge.fadeHeight, max(0, viewportHeight - inset) / 2)
        if !reduceTransparency && contrast != .increased && height > 0 {
            content.mask {
                GeometryReader { row in
                    // Only the row's pixels are masked; pinned headers retain their own native stacking.
                    LinearGradient(stops: [
                        .init(color: .white.opacity(opacity(for: hiddenAbove, height: height)), location: 0),
                        .init(color: .white.opacity(opacity(for: hiddenAbove, height: height)), location: inset / viewportHeight),
                        .init(color: .white, location: (inset + height) / viewportHeight),
                        .init(color: .white, location: (viewportHeight - height) / viewportHeight),
                        .init(color: .white.opacity(opacity(for: hiddenBelow, height: height)), location: 1)
                    ], startPoint: .top, endPoint: .bottom)
                    .frame(height: viewportHeight)
                    .offset(y: -row.frame(in: .named(coordinateSpace)).minY)
                }
            }
        } else {
            content
        }
    }

    private func opacity(for distance: CGFloat, height: CGFloat) -> Double {
        // Restore full opacity continuously as the first/last row comes fully into view.
        Double(1 - min(max(distance / height, 0), 1))
    }
}
