// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct AppearanceSettings: View {
    @AppStorage("appearance") private var appearance = "system"
    @AppStorage("readingScale") private var scale = 1.0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var scheme
    private var palette: MeltedPalette { MeltedPalette(scheme) }
    var body: some View {
        // Appearance Section
        SettingsSection(
            icon: "paintbrush.fill",
            title: "外观",
            description: "自定义应用的视觉效果"
        ) {
            VStack(alignment: .leading, spacing: 16) {
                // Theme picker with icons
                VStack(alignment: .leading, spacing: 10) {
                    Text("主题")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(palette.text)

                    HStack(spacing: 8) {
                        themeButton("跟随系统", icon: "circle.lefthalf.filled", tag: "system")
                        themeButton("浅色", icon: "sun.max.fill", tag: "light")
                        themeButton("深色", icon: "moon.fill", tag: "dark")
                    }
                }

                Divider()
                    .background(palette.separator)

                // Reading scale slider
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("阅读字号")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(palette.text)
                        Spacer()
                        Text("\(Int((scale * 100).rounded()))%")
                            .font(.system(size: 13, weight: .semibold, design: .rounded))
                            .foregroundStyle(palette.accent)
                            .frame(width: 52, alignment: .trailing)
                            .accessibilityHidden(true)
                    }

                    Slider(value: $scale, in: 1...2, step: 0.05)
                        .tint(palette.accent)
                        .accessibilityLabel("阅读字号")
                        .accessibilityValue("\(Int((scale * 100).rounded()))%")

                    HStack {
                        Text("较小")
                            .font(.system(size: 11))
                            .foregroundStyle(palette.secondary)
                        Spacer()
                        Text("较大")
                            .font(.system(size: 11))
                            .foregroundStyle(palette.secondary)
                    }
                }
            }
        }

    }
    @ViewBuilder
    private func themeButton(_ title: String, icon: String, tag: String) -> some View {
        Button {
            withAnimation(reduceMotion ? nil : .easeOut(duration: MeltedMotion.feedback)) {
                appearance = tag
            }
        } label: {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundStyle(appearance == tag ? palette.accent : palette.secondary)
                Text(title)
                    .font(.system(size: 12, weight: appearance == tag ? .semibold : .regular))
                    .foregroundStyle(appearance == tag ? palette.accent : palette.text)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(appearance == tag ? palette.accent.opacity(0.12) : palette.canvas)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(
                        appearance == tag ? palette.accent.opacity(0.4) : palette.separator.opacity(0.3),
                        lineWidth: appearance == tag ? 1.5 : 0.5
                    )
            )
        }
        .buttonStyle(.plain)
    }

}
