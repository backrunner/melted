// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

public extension MeltedMotion {
    /// Page-level moves: settles quickly without a visible bounce.
    static var page: Animation { .spring(response: pageTransition, dampingFraction: 0.88) }
    /// Disclosure, insertion and other content-level changes.
    static var content: Animation { .spring(response: transition + 0.06, dampingFraction: 0.86) }
    static var hover: Animation { .easeOut(duration: feedback) }
}

public extension AnyTransition {
    /// A page that lives on one side of a flow: it enters from and leaves toward that side.
    static func meltedPage(_ edge: HorizontalEdge) -> AnyTransition {
        .opacity.combined(with: .offset(x: edge == .leading ? -28 : 28))
    }

    /// A newly delivered row: unfolds downward and lifts into place, so rows below move with it.
    static var meltedArrival: AnyTransition {
        .opacity.combined(with: .move(edge: .top))
    }
}

/// Draws the eye to content that just arrived, then settles back to normal.
/// Reliable where a view transition is not: the row stays in place while its highlight fades.
struct MeltedArrivalHighlight: ViewModifier {
    let active: Bool
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var strong = true

    func body(content: Content) -> some View {
        let palette = MeltedPalette(scheme)
        content
            .background {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(palette.accent.opacity(active && strong ? 0.14 : 0))
            }
            .onAppear {
                guard active, !reduceMotion else { strong = false; return }
                withAnimation(MeltedMotion.content.delay(0.5)) { strong = false }
            }
    }
}

/// Fades and lifts content into place when it appears, staggered by `order`.
struct MeltedEntrance: ViewModifier {
    let order: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var visible = false

    func body(content: Content) -> some View {
        content
            .opacity(visible ? 1 : 0)
            .offset(y: visible || reduceMotion ? 0 : 10)
            .onAppear {
                guard !visible else { return }
                if reduceMotion { visible = true; return }
                withAnimation(MeltedMotion.content.delay(Double(order) * MeltedMotion.stagger)) { visible = true }
            }
    }
}

public extension View {
    func meltedEntrance(_ order: Int = 0) -> some View { modifier(MeltedEntrance(order: order)) }

    /// Highlight for a row that just arrived. `active` marks it until the news has settled.
    func meltedArrivalHighlight(_ active: Bool) -> some View { modifier(MeltedArrivalHighlight(active: active)) }
}
