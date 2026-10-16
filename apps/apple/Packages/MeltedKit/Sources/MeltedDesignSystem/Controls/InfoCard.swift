// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// A quiet grouped surface for read-only facts, such as a server's operator and processing notice.
public struct InfoCard<Content: View>: View {
    private let content: Content
    @Environment(\.colorScheme) private var scheme

    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    public var body: some View {
        let palette = MeltedPalette(scheme)
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        VStack(alignment: .leading, spacing: 12) {
            content
        }
        .padding(MeltedReading.blockInset)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(palette.surface.opacity(0.85), in: shape)
        .overlay { shape.strokeBorder(palette.separator, lineWidth: 1) }
    }
}
