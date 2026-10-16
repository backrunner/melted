// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// Inline message for connection failures, arranged so the user sees what happened,
/// what to do about it, and can act or ask for the technical detail.
public struct MeltedNotice: View {
    public enum Tone { case critical, attention }
    public struct Action: Identifiable {
        public let id = UUID()
        public let title: String
        public let prominent: Bool
        public let perform: () -> Void
        public init(_ title: String, prominent: Bool = false, perform: @escaping () -> Void) {
            self.title = title
            self.prominent = prominent
            self.perform = perform
        }
    }

    private let tone: Tone
    private let title: String
    private let guidance: String?
    private let detail: String?
    private let actions: [Action]
    @State private var detailOpen = false
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(
        tone: Tone = .critical,
        title: String,
        guidance: String? = nil,
        detail: String? = nil,
        actions: [Action] = []
    ) {
        self.tone = tone
        self.title = title
        self.guidance = guidance
        self.detail = detail
        self.actions = actions
    }

    public var body: some View {
        let palette = MeltedPalette(scheme)
        let tint = tone == .critical ? palette.danger : palette.warning
        let shape = RoundedRectangle(cornerRadius: 10, style: .continuous)
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: tone == .critical ? "exclamationmark.triangle.fill" : "info.circle.fill")
                    .font(.system(size: MeltedType.metadata, weight: .semibold))
                    .foregroundStyle(tint)
                    .accessibilityHidden(true)
                Text(title)
                    .font(.system(size: MeltedType.control, weight: .medium))
                    .foregroundStyle(palette.text)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let guidance {
                Text(guidance)
                    .font(.system(size: MeltedType.metadata))
                    .foregroundStyle(palette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let detail {
                // Raw server text stays behind a disclosure so the guidance reads first.
                Text(detail)
                    .font(.system(size: MeltedType.metadata, design: .monospaced))
                    .foregroundStyle(palette.secondary)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.leading, 8)
                    .overlay(alignment: .leading) {
                        Rectangle().fill(palette.separator).frame(width: 2)
                    }
                    .opacity(detailOpen ? 1 : 0)
                    .frame(height: detailOpen ? nil : 0, alignment: .top)
                    .clipped()

                Button(detailOpen ? "隐藏详情" : "查看详情") {
                    withAnimation(reduceMotion ? nil : MeltedMotion.content) { detailOpen.toggle() }
                }
                .buttonStyle(.plain)
                .font(.system(size: MeltedType.metadata, weight: .medium))
                .foregroundStyle(palette.accent)
            }

            if !actions.isEmpty {
                HStack(spacing: 8) {
                    ForEach(actions) { action in
                        if action.prominent {
                            Button(action.title, action: action.perform)
                                .buttonStyle(MeltedPrimaryButtonStyle())
                                .frame(height: 26)
                        } else {
                            Button(action.title, action: action.perform)
                                .buttonStyle(MeltedSecondaryButtonStyle())
                                .frame(height: 26)
                        }
                    }
                }
                .padding(.top, 2)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(scheme == .dark ? 0.14 : 0.08), in: shape)
        .overlay { shape.strokeBorder(tint.opacity(0.3), lineWidth: 1) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
        .accessibilityAddTraits(tone == .critical ? .isModal : [])
    }
}
