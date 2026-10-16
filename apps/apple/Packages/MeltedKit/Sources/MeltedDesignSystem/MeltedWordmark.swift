// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

public struct MeltedWordmark: View {
    @Environment(\.colorScheme) private var scheme
    public init() {}
    public var body: some View {
        let palette = MeltedPalette(scheme)
        HStack(spacing: 10) {
            MeltedMark()
                .fill(palette.accent)
                .frame(width: MeltedConnection.brandSize, height: MeltedConnection.brandSize)
                .accessibilityHidden(true)
            Text("Melted")
                .font(.system(size: MeltedConnection.brandTitle, weight: .semibold, design: .rounded))
                .tracking(-0.4)
                .foregroundStyle(palette.text)
        }
        .accessibilityElement(children: .combine)
    }
}
