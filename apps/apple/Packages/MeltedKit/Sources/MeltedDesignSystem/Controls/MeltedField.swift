// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// Labeled text input chrome shared by every form. The caller owns the field and its focus,
/// so `TextField`, `SecureField` and existing `@FocusState` enums keep working unchanged.
public struct MeltedField<Content: View>: View {
    private let label: String
    private let isFocused: Bool
    private let height: CGFloat
    private let expandsVertically: Bool
    private let content: Content
    @Environment(\.colorScheme) private var scheme
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isHovered = false

    public init(_ label: String, isFocused: Bool, height: CGFloat = MeltedConnection.controlHeight, expandsVertically: Bool = false, @ViewBuilder content: () -> Content) {
        self.label = label
        self.isFocused = isFocused
        self.height = height
        self.expandsVertically = expandsVertically
        self.content = content()
    }

    public var body: some View {
        let palette = MeltedPalette(scheme)
        let shape = RoundedRectangle(cornerRadius: 10, style: .continuous)
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: MeltedType.control, weight: .medium))
                .foregroundStyle(palette.secondary)
            content
                .textFieldStyle(.plain)
                .font(.system(size: MeltedType.row))
                .accessibilityElement(children: .contain)
                .accessibilityLabel(label)
                .padding(.horizontal, 12)
                .padding(.vertical, expandsVertically ? MeltedReading.actionGap : 0)
                .frame(height: expandsVertically ? nil : height)
                .frame(minHeight: height)
                .background(palette.surface, in: shape)
                .overlay {
                    shape.strokeBorder(
                        isFocused ? palette.accent : palette.secondary.opacity(isHovered && isEnabled ? 0.45 : 0.28),
                        lineWidth: isFocused ? 1.5 : 1
                    )
                }
                .background {
                    // Soft halo outside the border marks keyboard focus without shifting layout.
                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .fill(palette.accent.opacity(isFocused ? 0.14 : 0))
                        .padding(-3)
                }
                .onHover { isHovered = $0 }
        }
        .opacity(isEnabled ? 1 : 0.55)
        .animation(reduceMotion ? nil : MeltedMotion.hover, value: isFocused)
        .animation(reduceMotion ? nil : MeltedMotion.hover, value: isHovered)
        .animation(reduceMotion ? nil : MeltedMotion.hover, value: isEnabled)
    }
}
