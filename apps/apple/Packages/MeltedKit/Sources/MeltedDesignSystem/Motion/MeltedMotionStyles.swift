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
    let sequence: Int?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var strong = false

    private var trigger: Int? { reduceMotion ? nil : sequence }

    func body(content: Content) -> some View {
        let palette = MeltedPalette(scheme)
        content
            .background {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(palette.accent)
                    .opacity(strong && trigger != nil ? 0.14 : 0)
                    .animation(.easeOut(duration: MeltedMotion.transition * 3), value: strong)
            }
            .task(id: trigger) {
                var transaction = Transaction(animation: nil)
                transaction.disablesAnimations = true
                withTransaction(transaction) { strong = trigger != nil }
                guard trigger != nil else { return }
                do { try await Task.sleep(for: .milliseconds(500)) }
                catch { return }
                strong = false
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

    /// A new server sequence restarts feedback; nil means there is no delivery to show.
    func meltedArrivalHighlight(_ sequence: Int?) -> some View { modifier(MeltedArrivalHighlight(sequence: sequence)) }
}
