// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct AboutSettings: View {
    var body: some View {
        // About Section
        SettingsSection(
            icon: "info.circle.fill",
            title: "关于",
            description: nil
        ) {
            VStack(alignment: .leading, spacing: 10) {
                SettingsInfoRow(label: "版本", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—")
                SettingsInfoRow(label: "构建", value: Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "—")
            }
        }
    }
}
