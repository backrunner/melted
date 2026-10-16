// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// Shared themed surface. Branding belongs to the connection content, not the window chrome.
public struct MeltedScreen<Content: View>: View {
    private let backdrop: Bool
    private let content: Content
    @Environment(\.colorScheme) private var scheme

    public init(backdrop: Bool = false, @ViewBuilder content: () -> Content) {
        self.backdrop = backdrop
        self.content = content()
    }

    public var body: some View {
        let palette = MeltedPalette(scheme)
        content
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background {
            // Canvas first: the backdrop is the liquid that sits on top of it.
            ZStack {
                palette.canvas
                if backdrop { MeltedBackdrop() }
            }
            .ignoresSafeArea()
        }
        .foregroundStyle(palette.text)
    }
}
