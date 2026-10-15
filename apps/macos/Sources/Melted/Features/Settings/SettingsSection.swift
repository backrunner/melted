// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct SettingsSection<Content: View>: View {
    let icon: String
    let title: String
    let description: String?
    @ViewBuilder let content: Content
    @Environment(\.colorScheme) private var scheme
    private var palette: MeltedPalette { MeltedPalette(scheme) }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(palette.accent)
                    .frame(width: 28, height: 28)
                    .background(palette.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 6))

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(palette.text)

                    if let description {
                        Text(description)
                            .font(.system(size: 12))
                            .foregroundStyle(palette.secondary)
                    }
                }
            }

            content
                .padding(18)
                .background(palette.surface, in: RoundedRectangle(cornerRadius: 10))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(palette.separator.opacity(0.5), lineWidth: 0.5)
                )
        }
    }

}
