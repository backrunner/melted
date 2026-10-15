// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedDesignSystem

/// macOS-native landing view with Liquid Glass design
struct LandingView: View {
    @ObservedObject var model: WorkspaceModel
    @Environment(\.colorScheme) private var scheme
    @FocusState private var serverAddressFocused: Bool

    private var palette: MeltedPalette { MeltedPalette(scheme) }

    var body: some View {
        ZStack {
            // Clean background
            palette.canvas
                .ignoresSafeArea()

            // Centered content
            VStack(spacing: 0) {
                Spacer()

                appIdentity

                connectionForm
                    .frame(width: 340)

                Spacer()

                footerHint
            }
        }
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                serverAddressFocused = true
            }
        }
    }

    private var appIdentity: some View {
        VStack(spacing: 20) {
            // App icon with Liquid Glass effect
            ZStack {
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 96, height: 96)

                Circle()
                    .fill(palette.accent.opacity(0.1))
                    .frame(width: 96, height: 96)

                MeltedMark()
                    .foregroundStyle(palette.accent)
                    .frame(width: 64, height: 64)
                    .accessibilityHidden(true)
            }

            VStack(spacing: 6) {
                Text("Melted")
                    .font(.system(size: 32, weight: .medium))
                    .foregroundStyle(palette.text)

                Text("智能资讯整理服务")
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(palette.secondary)
            }
        }
        .padding(.bottom, 44)
    }

    private var connectionForm: some View {
        VStack(spacing: 16) {
            serverAddressField
            connectButton

            if let error = model.error {
                errorDisplay(error)
            }

            helpLink
        }
        .padding(20)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
        .shadow(color: .black.opacity(0.1), radius: 10, y: 4)
    }

    private var serverAddressField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("服务器地址")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(palette.secondary)

            TextField("http://127.0.0.1:8421", text: $model.serverAddress)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .foregroundStyle(palette.text)
                .focused($serverAddressFocused)
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 6))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .strokeBorder(
                            serverAddressFocused ? palette.accent : Color.clear,
                            lineWidth: 2
                        )
                )
        }
    }

    private var connectButton: some View {
        Button {
            Task {
                await model.discover()
            }
        } label: {
            HStack(spacing: 6) {
                if model.connecting {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                }
                Text(model.connecting ? "连接中..." : "连接")
                    .font(.system(size: 13, weight: .medium))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: 28)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(canConnect ? palette.accent : palette.secondary.opacity(0.4))
            )
        }
        .buttonStyle(.plain)
        .disabled(!canConnect || model.connecting)
    }

    private func errorDisplay(_ error: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 11))
            Text(error)
                .font(.system(size: 11))
                .lineLimit(2)
        }
        .foregroundStyle(.red)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var helpLink: some View {
        Button {
            if let url = URL(string: "https://github.com/VibeKit/melted") {
                NSWorkspace.shared.open(url)
            }
        } label: {
            Text("需要帮助？")
                .font(.system(size: 11))
                .foregroundStyle(palette.accent)
        }
        .buttonStyle(.plain)
    }

    private var footerHint: some View {
        Text("需要先启动 Melted 服务器才能继续")
            .font(.system(size: 11))
            .foregroundStyle(palette.secondary.opacity(0.7))
            .padding(.bottom, 24)
    }

    private var canConnect: Bool {
        !model.serverAddress.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
