// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedDesignSystem

struct ConnectionError: View {
    let message: String
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        Label {
            Text(message)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
        } icon: {
            Image(systemName: "exclamationmark.circle")
        }
        .font(.system(size: MeltedType.control))
        .foregroundStyle(MeltedPalette(scheme).danger)
    }
}
