// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

// MARK: - Button Styles

public struct MeltedPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let palette: MeltedPalette
    public init(palette: MeltedPalette) { self.palette = palette }

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: MeltedType.control, weight: .semibold))
            .foregroundStyle(palette.accentText)
            .padding(.horizontal, 24)
            .background(
                RoundedRectangle(cornerRadius: MeltedReading.cornerRadius)
                    .fill(palette.accent)
            )
            .opacity(isEnabled ? 1 : 0.5)
            .opacity(configuration.isPressed ? 0.85 : 1.0)
            .animation(reduceMotion ? nil : .easeOut(duration: MeltedMotion.feedback), value: configuration.isPressed)
    }
}

public struct MeltedSecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let palette: MeltedPalette
    public init(palette: MeltedPalette) { self.palette = palette }

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: MeltedType.control, weight: .semibold))
            .foregroundStyle(palette.text)
            .padding(.horizontal, 24)
            .background(
                RoundedRectangle(cornerRadius: MeltedReading.cornerRadius)
                    .fill(palette.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: MeltedReading.cornerRadius)
                    .strokeBorder(palette.separator.opacity(0.5), lineWidth: 1)
            )
            .opacity(isEnabled ? 1 : 0.5)
            .animation(reduceMotion ? nil : .easeOut(duration: MeltedMotion.feedback), value: configuration.isPressed)
    }
}
