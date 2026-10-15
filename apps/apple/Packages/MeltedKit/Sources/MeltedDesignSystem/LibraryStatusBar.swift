// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

public struct LibraryStatusBar: View {
    let total: Int
    let loading: Bool
    public init(total: Int, loading: Bool) { self.total = total; self.loading = loading }
    @Environment(\.colorScheme) private var scheme

    public var body: some View {
        let palette = MeltedPalette(scheme)
        HStack(spacing: MeltedReading.actionGap) {
            HStack(spacing: 6) {
                MeltedMark()
                    .fill(palette.accent)
                    .frame(width: MeltedLibraryStatus.markSize, height: MeltedLibraryStatus.markSize)
                    .accessibilityHidden(true)
                Text("Melted")
                    .fontWeight(.medium)
            }
            .accessibilityElement(children: .combine)
            Spacer()
            if loading {
                ProgressView().controlSize(.mini).accessibilityLabel("正在载入")
            }
            Text("\(total) 条")
                .monospacedDigit()
                .accessibilityLabel("共 \(total) 条内容")
        }
        .font(.system(size: MeltedType.metadata))
        .foregroundStyle(palette.secondary)
        .padding(.horizontal, MeltedLibraryStatus.horizontalInset)
        .padding(.vertical, MeltedLibraryStatus.verticalInset)
        .background(palette.canvas)
        .overlay(alignment: .top) {
            Rectangle().fill(palette.separator).frame(height: 0.5)
        }
    }
}
