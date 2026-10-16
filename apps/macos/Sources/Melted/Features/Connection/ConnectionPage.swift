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
                ScrollView {
                    VStack(alignment: .leading, spacing: MeltedConnection.sectionSpacing) {
                        MeltedWordmark()
                        content
                    }
                    .frame(maxWidth: MeltedConnection.contentMaximum, alignment: .leading)
                    .padding(MeltedConnection.pageInset)
                    // Extra bottom room lifts the column to the optical center instead of the geometric one.
                    .padding(.bottom, geometry.size.height * 0.1)
                    .frame(maxWidth: .infinity, minHeight: geometry.size.height, alignment: .center)
                }
                .scrollBounceBehavior(.basedOnSize)
            }
        }
    }
}
