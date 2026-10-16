// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// Checkbox with an animated check; VoiceOver still sees a native toggle.
public struct MeltedCheckboxStyle: ToggleStyle {
    public init() {}
    public func makeBody(configuration: Configuration) -> some View {
        MeltedCheckbox(configuration: configuration)
    }
}

private struct MeltedCheckbox: View {
    let configuration: ToggleStyleConfiguration
    @State private var isHovered = false
    @Environment(\.colorScheme) private var scheme
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let palette = MeltedPalette(scheme)
        let isOn = configuration.isOn
        let shape = RoundedRectangle(cornerRadius: 5, style: .continuous)
        Button { configuration.isOn.toggle() } label: {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                ZStack {
                    shape.fill(isOn ? palette.accent : palette.surface)
                    shape.strokeBorder(
                        isOn ? palette.accent : palette.secondary.opacity(isHovered && isEnabled ? 0.6 : 0.4),
                        lineWidth: 1.25
                    )
                    Image(systemName: "checkmark")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(palette.accentText)
                        .scaleEffect(isOn ? 1 : 0.4)
                        .opacity(isOn ? 1 : 0)
                }
                .frame(width: 18, height: 18)
                .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 4.5 }
                configuration.label
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { isHovered = $0 }
        .opacity(isEnabled ? 1 : 0.55)
        .animation(reduceMotion ? nil : .spring(response: 0.25, dampingFraction: 0.7), value: isOn)
        .animation(reduceMotion ? nil : MeltedMotion.hover, value: isHovered)
        .accessibilityRepresentation {
            Toggle(isOn: configuration.$isOn) { configuration.label }
        }
    }
}
