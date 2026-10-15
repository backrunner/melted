// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedDesignSystem

/// Shared reading width and spacing for connection and server confirmation.
struct ConnectionPage<Content: View>: View {
    @ViewBuilder let content: Content
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: MeltedConnection.sectionSpacing) {
                    content
                }
                .frame(maxWidth: MeltedConnection.contentMaximum, alignment: .leading)
                .padding(MeltedConnection.pageInset)
                .frame(maxWidth: .infinity, minHeight: geometry.size.height, alignment: .center)
            }
        }
        .background(MeltedPalette(scheme).canvas)
        .foregroundStyle(MeltedPalette(scheme).text)
        .tint(MeltedPalette(scheme).accent)
    }
}
