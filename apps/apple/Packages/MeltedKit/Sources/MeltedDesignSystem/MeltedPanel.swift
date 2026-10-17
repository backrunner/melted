// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// Sheet chrome shares the workspace's canvas, reading surface and quiet rules.
public struct MeltedPanel<Actions: View, Content: View, Footer: View>: View {
    private let title: String
    private let subtitle: String?
    private let actions: Actions
    private let content: Content
    private let footer: Footer
    @Environment(\.colorScheme) private var scheme
    public init(_ title: String, subtitle: String? = nil, @ViewBuilder actions: () -> Actions,
                @ViewBuilder content: () -> Content, @ViewBuilder footer: () -> Footer) {
        self.title = title; self.subtitle = subtitle
        self.actions = actions(); self.content = content(); self.footer = footer()
    }
    public var body: some View {
        let palette = MeltedPalette(scheme)
        VStack(spacing: 0) {
            HStack(spacing: MeltedReading.actionGap) {
                VStack(alignment: .leading, spacing: MeltedPanelMetrics.detailGap) {
                    Text(title).font(.system(size: MeltedType.section, weight: .semibold))
                    if let subtitle { Text(subtitle).font(.system(size: MeltedType.metadata)).foregroundStyle(palette.secondary) }
                }
                Spacer(minLength: MeltedReading.actionGap)
                actions
            }
            .padding(.horizontal, MeltedPanelMetrics.inset).padding(.vertical, MeltedPanelMetrics.headerInset)
            rule
            content.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).background(palette.surface)
            rule
            footer.padding(.horizontal, MeltedPanelMetrics.inset).padding(.vertical, MeltedReading.actionGap)
        }
        .font(.system(size: MeltedType.control))
        .foregroundStyle(palette.text).tint(palette.accent).background(palette.canvas)
    }
    private var rule: some View { Rectangle().fill(MeltedPalette(scheme).separator).frame(height: MeltedPanelMetrics.ruleWidth) }
}
