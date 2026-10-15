// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// A polished empty state with icon, title, description, and subtle animation
public struct EmptyState: View {
    private let icon: String
    private let title: String
    private let description: String
    private let action: (() -> Void)?
    private let actionLabel: String?

    @Environment(\.colorScheme) private var scheme
    @State private var animationPhase = false

    public init(
        icon: String,
        title: String,
        description: String,
        action: (() -> Void)? = nil,
        actionLabel: String? = nil
    ) {
        self.icon = icon
        self.title = title
        self.description = description
        self.action = action
        self.actionLabel = actionLabel
    }

    public var body: some View {
        let palette = MeltedPalette(scheme)
        VStack(spacing: 24) {
            // Animated icon with glow effect
            ZStack {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [
                                palette.accent.opacity(0.1),
                                palette.accent.opacity(0.03),
                                Color.clear
                            ],
                            center: .center,
                            startRadius: 0,
                            endRadius: 70
                        )
                    )
                    .frame(width: 140, height: 140)
                    .scaleEffect(animationPhase ? 1.08 : 1.0)
                    .opacity(animationPhase ? 0.6 : 0.8)

                Image(systemName: icon)
                    .font(.system(size: 48, weight: .light))
                    .foregroundStyle(palette.accent.opacity(0.6))
                    .accessibilityHidden(true)
            }

            VStack(spacing: 10) {
                Text(title)
                    .font(.system(size: MeltedType.section, weight: .semibold))
                    .foregroundStyle(palette.text)

                Text(description)
                    .font(.system(size: MeltedType.control))
                    .foregroundStyle(palette.secondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let action, let actionLabel {
                Button(action: action) {
                    Text(actionLabel)
                        .font(.system(size: MeltedType.control, weight: .medium))
                        .foregroundStyle(palette.accentText)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(palette.accent, in: RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
                .padding(.top, 8)
            }
        }
        .frame(maxWidth: 380)
        .padding(32)
        .accessibilityElement(children: .combine)
        .onAppear {
            withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true)) {
                animationPhase = true
            }
        }
    }
}
