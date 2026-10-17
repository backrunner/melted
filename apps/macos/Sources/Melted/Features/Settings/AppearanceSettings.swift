// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct AppearanceSettings: View {
    @AppStorage("appearance") private var appearance = "system"
    @AppStorage("readingScale") private var scale = 1.0
    @AppStorage("showLibraryStatusBar") private var showLibraryStatusBar = true
    @Environment(\.colorScheme) private var scheme
    private var palette: MeltedPalette { MeltedPalette(scheme) }

    var body: some View {
        Section("外观") {
            LabeledContent("主题") {
                MeltedSegmentedPicker("主题", selection: $appearance, options: [
                    .init("system", title: "自动", systemImage: "circle.lefthalf.filled"),
                    .init("light", title: "浅色", systemImage: "sun.max"),
                    .init("dark", title: "深色", systemImage: "moon"),
                ])
                .frame(width: 260)
            }
            LabeledContent("阅读字号") {
                HStack(spacing: 12) {
                    Slider(value: $scale, in: 1...2, step: 0.05)
                        .frame(width: 200)
                        .accessibilityLabel("阅读字号")
                        .accessibilityValue("\(percent)%")
                    Text("\(percent)%")
                        .monospacedDigit()
                        .foregroundStyle(palette.secondary)
                        .frame(width: 44, alignment: .trailing)
                        .accessibilityHidden(true)
                }
            }
            Toggle("显示列表底栏", isOn: $showLibraryStatusBar)
                .help("在列表底部显示 Melted 标识、内容条数和载入状态")
        }
    }

    private var percent: Int { Int((scale * 100).rounded()) }
}
