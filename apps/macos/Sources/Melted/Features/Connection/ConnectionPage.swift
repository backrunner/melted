// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedDesignSystem

/// Shared reading width and spacing for connection and server confirmation.
struct ConnectionPage<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        MeltedScreen(backdrop: true) {
            GeometryReader { geometry in
                let safeArea = geometry.safeAreaInsets
                let backdropHeight = geometry.size.height + safeArea.top + safeArea.bottom
                let insets = MeltedConnectionLayout.contentInsets(height: backdropHeight)
                let top = max(0, insets.top - safeArea.top)
                let bottom = max(0, insets.bottom - safeArea.bottom)
                let viewportHeight = max(0, geometry.size.height - top - bottom)

                MeltedScrollView {
                    VStack(alignment: .leading, spacing: MeltedConnection.sectionSpacing) {
                        MeltedWordmark()
                        content
                    }
                    .frame(maxWidth: MeltedConnection.contentMaximum, alignment: .leading)
                    .padding(MeltedConnection.pageInset)
                    // Extra bottom room lifts the column to the optical center instead of the geometric one.
                    .padding(.bottom, viewportHeight * 0.1)
                    .frame(maxWidth: .infinity, minHeight: viewportHeight, alignment: .center)
                }
                .scrollBounceBehavior(.basedOnSize)
                // Keep the clipped viewport inside the quiet center, even after scrolling.
                .padding(.top, top)
                .padding(.bottom, bottom)
            }
        }
    }
}
