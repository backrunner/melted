// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// A refined refresh/sync button with rotation animation.
public struct RefreshButton: View {
    private let action: () async -> Void
    private let isLoading: Bool

    @Environment(\.colorScheme) private var scheme
    @State private var rotation: Double = 0

    public init(isLoading: Bool, action: @escaping () async -> Void) {
        self.isLoading = isLoading
        self.action = action
    }

    public var body: some View {
        let palette = MeltedPalette(scheme)
        Button {
            Task { await action() }
        } label: {
            Image(systemName: "arrow.clockwise")
                .font(.system(size: 14, weight: .medium))
                .rotationEffect(.degrees(rotation))
                .frame(width: 32, height: 32)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(isLoading ? palette.accent : palette.secondary)
        .disabled(isLoading)
        .onChange(of: isLoading) { _, loading in
            if loading {
                withAnimation(.linear(duration: 1.0).repeatForever(autoreverses: false)) {
                    rotation = 360
                }
            } else {
                withAnimation(.easeOut(duration: 0.3)) {
                    rotation = 0
                }
            }
        }
        .accessibilityLabel("刷新")
        .help("刷新内容")
    }
}
