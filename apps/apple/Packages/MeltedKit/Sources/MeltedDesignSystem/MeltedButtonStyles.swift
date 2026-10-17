// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

// MARK: - Button Styles

/// Filled accent action. Height comes from the caller's frame so it lines up with fields.
public struct MeltedPrimaryButtonStyle: ButtonStyle {
    public init() {}
    public func makeBody(configuration: Configuration) -> some View {
        MeltedButtonBody(configuration: configuration, prominent: true)
    }
}

public struct MeltedSecondaryButtonStyle: ButtonStyle {
    public init() {}
    public func makeBody(configuration: Configuration) -> some View {
        MeltedButtonBody(configuration: configuration, prominent: false)
    }
}

private struct MeltedButtonBody: View {
    let configuration: ButtonStyleConfiguration
    let prominent: Bool
    @State private var isHovered = false
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let palette = MeltedPalette(scheme)
        let shape = RoundedRectangle(cornerRadius: 10, style: .continuous)
        let active = isHovered && isEnabled
        configuration.label
            .font(.system(size: MeltedType.control, weight: .semibold))
            .foregroundStyle(prominent ? palette.accentText : (configuration.role == .destructive ? palette.danger : palette.text))
            .padding(.horizontal, 20)
            .background {
                if prominent {
                    shape.fill(palette.accent).brightness(active ? (scheme == .dark ? 0.05 : -0.05) : 0)
                } else {
                    shape.fill(active ? palette.selection : palette.surface)
                    shape.strokeBorder(palette.separator, lineWidth: 1)
                }
            }
            .contentShape(shape)
            .scaleEffect(configuration.isPressed && isEnabled && !reduceMotion ? 0.98 : 1)
            .opacity(isEnabled ? (configuration.isPressed ? 0.9 : 1) : 0.45)
            .onHover { isHovered = $0 }
            .animation(reduceMotion ? nil : MeltedMotion.hover, value: configuration.isPressed)
            .animation(reduceMotion ? nil : MeltedMotion.hover, value: isHovered)
            .animation(reduceMotion ? nil : MeltedMotion.hover, value: isEnabled)
    }
}
