// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// Segmented choice with a sliding knob, used wherever a short exclusive option set is shown inline.
public struct MeltedSegmentedPicker<Value: Hashable>: View {
    public struct Option {
        let value: Value
        let title: String
        let systemImage: String?
        public init(_ value: Value, title: String, systemImage: String? = nil) {
            self.value = value
            self.title = title
            self.systemImage = systemImage
        }
    }

    private let label: String
    private let options: [Option]
    @Binding private var selection: Value
    @Namespace private var knob
    @State private var hovered: Value?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(_ label: String, selection: Binding<Value>, options: [Option]) {
        self.label = label
        self._selection = selection
        self.options = options
    }

    public var body: some View {
        let palette = MeltedPalette(scheme)
        let dark = scheme == .dark
        HStack(spacing: 2) {
            ForEach(options, id: \.value) { option in
                let selected = option.value == selection
                Button {
                    withAnimation(reduceMotion ? nil : MeltedMotion.content) { selection = option.value }
                } label: {
                    HStack(spacing: 6) {
                        if let systemImage = option.systemImage {
                            Image(systemName: systemImage).font(.system(size: MeltedType.metadata, weight: .medium))
                        }
                        Text(option.title).lineLimit(1)
                    }
                    .font(.system(size: MeltedType.control, weight: selected ? .semibold : .medium))
                    .foregroundStyle(selected ? palette.text : palette.secondary)
                    .frame(maxWidth: .infinity)
                    .frame(height: 30)
                    .background {
                        if selected {
                            RoundedRectangle(cornerRadius: 7, style: .continuous)
                                .fill(dark ? palette.selection : palette.surface)
                                .shadow(color: .black.opacity(dark ? 0.25 : 0.07), radius: 1.5, y: 0.5)
                                .matchedGeometryEffect(id: "knob", in: knob)
                        } else if hovered == option.value && isEnabled {
                            RoundedRectangle(cornerRadius: 7, style: .continuous)
                                .fill(palette.text.opacity(0.05))
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .onHover { inside in
                    if inside { hovered = option.value } else if hovered == option.value { hovered = nil }
                }
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .padding(3)
        .background(dark ? palette.canvas : palette.selection, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .opacity(isEnabled ? 1 : 0.55)
        .animation(reduceMotion ? nil : MeltedMotion.hover, value: hovered)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
    }
}
