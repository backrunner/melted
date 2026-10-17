// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// Shared vertical scrolling with content-only edge fades. Native scrollers remain unmasked.
/// Use ScrollEdgeFade directly for pinned section headers that must remain opaque.
public struct MeltedScrollView<Content: View>: View {
    private let showsIndicators: Bool
    private let content: Content
    @State private var coordinateSpace = UUID().uuidString
    @State private var viewportHeight: CGFloat = 0
    @State private var contentFrame: CGRect = .zero

    public init(showsIndicators: Bool = true, @ViewBuilder content: () -> Content) {
        self.showsIndicators = showsIndicators
        self.content = content()
    }

    public var body: some View {
        let space = coordinateSpace
        ScrollView(.vertical, showsIndicators: showsIndicators) {
            VStack(spacing: 0) { content }
                .onGeometryChange(for: CGRect.self) { geometry in
                    geometry.frame(in: .named(space))
                } action: { contentFrame = $0 }
                .modifier(ScrollEdgeFade(coordinateSpace: space, viewportHeight: viewportHeight,
                    topInset: 0, hiddenAbove: -contentFrame.minY,
                    hiddenBelow: contentFrame.maxY - viewportHeight))
        }
        .coordinateSpace(name: space)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { viewportHeight = $0 }
        .clipped()
    }
}
