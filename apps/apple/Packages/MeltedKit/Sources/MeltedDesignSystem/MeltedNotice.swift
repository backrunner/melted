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
        let shape = RoundedRectangle(cornerRadius: MeltedNoticeMetrics.cornerRadius, style: .continuous)
        HStack(alignment: .top, spacing: MeltedNoticeMetrics.iconGap) {
            Image(systemName: tone == .critical ? "exclamationmark.triangle" : "info.circle")
                .font(.system(size: MeltedType.control, weight: .medium))
                .foregroundStyle(tint)
                .frame(width: MeltedNoticeMetrics.iconWidth, height: MeltedNoticeMetrics.iconWidth)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: MeltedNoticeMetrics.detailSpacing) {
                VStack(alignment: .leading, spacing: MeltedNoticeMetrics.footerSpacing) {
                    VStack(alignment: .leading, spacing: MeltedNoticeMetrics.textSpacing) {
                        Text(title)
                            .font(.system(size: MeltedType.control, weight: .semibold))
                            .foregroundStyle(palette.text)
                            .fixedSize(horizontal: false, vertical: true)
                        if let guidance, !guidance.isEmpty {
                            Text(guidance)
                                .font(.system(size: MeltedType.metadata))
                                .foregroundStyle(palette.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }

                    if detail != nil || !actions.isEmpty {
                        ViewThatFits(in: .horizontal) {
                            HStack(spacing: MeltedNoticeMetrics.sectionSpacing) {
                                detailButton
                                Spacer(minLength: 0)
                                actionButtons
                            }
                            VStack(alignment: .leading, spacing: MeltedNoticeMetrics.textSpacing) {
                                detailButton
                                actionButtons.frame(maxWidth: .infinity, alignment: .trailing)
                            }
                        }
                    }
                }

                if detailOpen, let detail {
                    Text(detail)
                        .font(.system(size: MeltedType.metadata, design: .monospaced))
                        .foregroundStyle(palette.secondary)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(MeltedNoticeMetrics.sectionSpacing)
                        .background(palette.canvas, in: RoundedRectangle(cornerRadius: MeltedReading.cornerRadius))
                        .transition(.opacity)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(MeltedNoticeMetrics.inset)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(palette.surface, in: shape)
        .overlay { shape.strokeBorder(palette.separator, lineWidth: MeltedReading.ruleWidth) }
        .accessibilityElement(children: .contain)
        .onChange(of: title) { _, _ in detailOpen = false }
        .onChange(of: detail) { _, _ in detailOpen = false }
    }

    @ViewBuilder
    private var detailButton: some View {
        if detail != nil {
            MeltedDisclosureToggle(isExpanded: $detailOpen) {
                Text("技术详情").font(.system(size: MeltedType.metadata, weight: .medium))
            }
            .fixedSize(horizontal: true, vertical: false)
        }
    }

    private var actionButtons: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: MeltedNoticeMetrics.iconGap) {
                ForEach(actions) { action in actionButton(action) }
            }
            .fixedSize(horizontal: true, vertical: false)
            VStack(alignment: .trailing, spacing: MeltedNoticeMetrics.iconGap) {
                ForEach(actions) { action in actionButton(action) }
            }
        }
    }

    @ViewBuilder
    private func actionButton(_ action: Action) -> some View {
        if action.prominent {
            Button(action: action.perform) {
                Text(action.title).fixedSize().frame(minHeight: MeltedNoticeMetrics.actionHeight)
            }
            .buttonStyle(MeltedPrimaryButtonStyle())
        } else {
            Button(action: action.perform) {
                Text(action.title).fixedSize().frame(minHeight: MeltedNoticeMetrics.actionHeight)
            }
            .buttonStyle(MeltedSecondaryButtonStyle())
        }
    }
}
