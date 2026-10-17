// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

public struct MeltedWordmark: View {
    public enum Style {
        case connection
        case compact
    }

    private let style: Style
    @Environment(\.colorScheme) private var scheme

    public init(style: Style = .connection) { self.style = style }

    public var body: some View {
        let palette = MeltedPalette(scheme)
        let compact = style == .compact
        let markSize = compact ? MeltedLibraryStatus.markSize : MeltedConnection.brandSize
        let titleSize = compact ? MeltedLibraryStatus.brandTitle : MeltedConnection.brandTitle
        HStack(spacing: compact ? MeltedLibraryStatus.brandGap : 10) {
            MeltedMark()
                .fill(palette.accent)
                .frame(width: markSize, height: markSize)
                .accessibilityHidden(true)
            Text("Melted")
                .font(.system(size: titleSize, weight: .semibold, design: .rounded))
                .tracking(-0.4)
                .foregroundStyle(compact ? palette.secondary : palette.text)
        }
        .fixedSize()
        .accessibilityElement(children: .combine)
    }
}
