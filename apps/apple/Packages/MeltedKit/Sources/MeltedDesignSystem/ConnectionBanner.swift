// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

public struct ConnectionBanner: View {
    let message: String
    let retry: () -> Void
    @Environment(\.colorScheme) private var scheme

    public init(message: String, retry: @escaping () -> Void) {
        self.message = message
        self.retry = retry
    }

    public var body: some View {
        let palette = MeltedPalette(scheme)
        HStack(spacing: MeltedReading.actionGap) {
            Image(systemName: "exclamationmark.triangle")
                .foregroundStyle(palette.warning)
            Text(message)
                .font(.system(size: MeltedType.control))
                .foregroundStyle(palette.text)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
            Spacer()
            Button("重试", action: retry)
                .tint(palette.accent)
        }
        .padding(MeltedReading.blockInset)
        .background(palette.warning.opacity(0.08))
        .overlay(alignment: .bottom) { Divider() }
    }
}
