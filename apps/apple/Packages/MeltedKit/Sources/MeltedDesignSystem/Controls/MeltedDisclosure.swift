// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// One disclosure interaction for plugin sections, forms and inline reading details.
/// The binding keeps expansion local to each section and preserves it across refreshes.
public struct MeltedDisclosureToggle<Label: View>: View {
    @Binding private var isExpanded: Bool
    private let label: Label
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(isExpanded: Binding<Bool>, @ViewBuilder label: () -> Label) {
        _isExpanded = isExpanded; self.label = label()
    }

    public var body: some View {
        Button {
            withAnimation(reduceMotion ? nil : .easeInOut(duration: MeltedMotion.transition)) {
                isExpanded.toggle()
            }
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: MeltedNoticeMetrics.iconGap) {
                Image(systemName: "chevron.right")
                    .font(.system(size: MeltedType.metadata, weight: .semibold))
                    .frame(width: MeltedNoticeMetrics.iconWidth)
                    .rotationEffect(.degrees(isExpanded ? 90 : 0))
                    .accessibilityHidden(true)
                label
            }
            .frame(minHeight: MeltedNoticeMetrics.disclosureHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(MeltedPalette(scheme).secondary)
        .accessibilityValue(isExpanded ? "已展开" : "已收起")
    }
}

public struct MeltedDisclosure<Label: View, Content: View>: View {
    public enum Presentation { case plain, card }
    private let presentation: Presentation
    @Binding private var isExpanded: Bool
    private let label: Label
    private let content: Content

    public init(isExpanded: Binding<Bool>, presentation: Presentation = .plain,
                @ViewBuilder label: () -> Label, @ViewBuilder content: () -> Content) {
        _isExpanded = isExpanded; self.presentation = presentation
        self.label = label(); self.content = content()
    }

    public var body: some View {
        if presentation == .card { InfoCard { disclosure } }
        else { disclosure }
    }

    private var disclosure: some View {
        VStack(alignment: .leading, spacing: MeltedReading.actionGap) {
            MeltedDisclosureToggle(isExpanded: $isExpanded) {
                HStack { label; Spacer(minLength: 0) }
            }
            if isExpanded { content.transition(.opacity) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
