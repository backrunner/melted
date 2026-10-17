// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// Preserve native menu tracking while sharing the form controls' surface and border.
public struct MeltedMenuChrome: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.isEnabled) private var enabled
    public init() {}
    public func body(content: Content) -> some View {
        let palette = MeltedPalette(scheme)
        let shape = RoundedRectangle(cornerRadius: 10, style: .continuous)
        content
            .font(.system(size: MeltedType.control, weight: .medium))
            .foregroundStyle(palette.text).tint(palette.text)
            .padding(.horizontal, MeltedReading.actionGap)
            .frame(height: MeltedPanelMetrics.controlHeight)
            .background(palette.surface, in: shape)
            .overlay { shape.strokeBorder(palette.secondary.opacity(0.28), lineWidth: 1) }
            .opacity(enabled ? 1 : 0.55)
    }
}
