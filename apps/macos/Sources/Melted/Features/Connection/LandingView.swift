// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct LandingView: View {
    @ObservedObject var model: WorkspaceModel
    @Environment(\.colorScheme) private var scheme
    @FocusState private var serverAddressFocused: Bool
    private var palette: MeltedPalette { MeltedPalette(scheme) }

    var body: some View {
        VStack(alignment: .leading, spacing: MeltedConnection.sectionSpacing) {
            Text("连接服务器")
                .font(.system(size: MeltedType.title, weight: .semibold))
                .accessibilityAddTraits(.isHeader)

            VStack(alignment: .leading, spacing: MeltedReading.blockInset) {
                MeltedField("服务器地址", isFocused: serverAddressFocused) {
                    TextField("https://melted.example.com", text: $model.serverAddress)
                        .focused($serverAddressFocused)
                        .onSubmit(connect)
                }
                .disabled(model.connecting)

                Button(action: connect) {
                    HStack(spacing: 8) {
                        if model.connecting {
                            ProgressView().progressViewStyle(.circular)
                                .controlSize(.small).tint(palette.accentText)
                                .fixedSize()
                        }
                        Text(model.connecting ? "正在连接…" : "连接")
                    }
                    .fixedSize()
                    .frame(maxWidth: .infinity)
                    .frame(height: MeltedConnection.controlHeight)
                }
                .buttonStyle(MeltedPrimaryButtonStyle())
                .keyboardShortcut(.defaultAction)
                .disabled(!canConnect || model.connecting)

                if let failure = model.failure {
                    FailureNotice(failure: failure, model: model)
                        .transition(.opacity)
                }
            }
        }
        .task { serverAddressFocused = true }
    }

    private var canConnect: Bool {
        !model.serverAddress.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    private func connect() {
        guard canConnect, !model.connecting else { return }
        Task { await model.discover() }
    }
}

/// One notice for every connection failure, with the actions that can actually help.
struct FailureNotice: View {
    let failure: WorkspaceFailure
    @ObservedObject var model: WorkspaceModel

    var body: some View {
        var actions: [MeltedNotice.Action] = []
        // The visible connection/login form already owns the primary action.
        // Only add rediscovery when the form cannot recover with its current method.
        if model.discovery != nil,
           failure.offersReverify || (failure.offersRetry && model.authenticationMethod == nil) {
            actions.append(.init("重新获取登录方式") { Task { await model.discover() } })
        }
        return MeltedNotice(
            tone: failure.kind == .sessionExpired ? .attention : .critical,
            title: failure.message,
            guidance: failure.guidance,
            detail: failure.technical,
            actions: actions
        )
        .disabled(model.connecting)
    }
}
