// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedDesignSystem

struct LandingView: View {
    @ObservedObject var model: WorkspaceModel
    @Environment(\.colorScheme) private var scheme
    @FocusState private var serverAddressFocused: Bool
    private var palette: MeltedPalette { MeltedPalette(scheme) }

    var body: some View {
        ConnectionPage {
            MeltedWordmark()
            VStack(alignment: .leading, spacing: MeltedReading.headingBodySpacing) {
                Text("从这里开始阅读")
                    .font(.system(size: MeltedType.title, weight: .semibold))
                    .accessibilityAddTraits(.isHeader)
                Text("连接你的服务器，浏览为你整理的内容。")
                    .font(.system(size: MeltedType.row))
                    .foregroundStyle(palette.secondary)
            }

            VStack(alignment: .leading, spacing: MeltedReading.blockInset) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("服务器地址")
                        .font(.system(size: MeltedType.control, weight: .medium))
                    TextField("https://melted.example.com", text: $model.serverAddress)
                        .textFieldStyle(.plain)
                        .font(.system(size: MeltedType.row))
                        .focused($serverAddressFocused)
                        .padding(.horizontal, MeltedReading.blockInset)
                        .frame(height: MeltedConnection.controlHeight)
                        .background(palette.surface, in: RoundedRectangle(cornerRadius: MeltedReading.cornerRadius))
                        .overlay {
                            RoundedRectangle(cornerRadius: MeltedReading.cornerRadius)
                                .strokeBorder(serverAddressFocused ? palette.accent : palette.separator, lineWidth: serverAddressFocused ? 1.5 : 1)
                        }
                        .accessibilityLabel("服务器地址")
                        .disabled(model.connecting)
                        .onSubmit(connect)
                }
                Button(action: connect) {
                    HStack(spacing: 8) {
                        if model.connecting { ProgressView().controlSize(.small).tint(palette.accentText) }
                        Text(model.connecting ? "正在连接…" : "连接服务器")
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: MeltedConnection.controlHeight)
                }
                .buttonStyle(MeltedPrimaryButtonStyle(palette: palette))
                .keyboardShortcut(.defaultAction)
                .disabled(!canConnect || model.connecting)

                if let error = model.error { ConnectionError(message: error) }
                Text("连接后，你可以先查看运营者与信息处理说明。")
                    .font(.system(size: MeltedType.metadata))
                    .foregroundStyle(palette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            DisclosureGroup("还没有服务器？") {
                Text("Melted 可以连接你自己部署或受信任的服务器。请向运营者获取服务器地址；本机开发时先启动项目服务，再使用 http://127.0.0.1:8421。")
                    .font(.system(size: MeltedType.metadata))
                    .foregroundStyle(palette.secondary)
                    .lineSpacing(4)
                    .textSelection(.enabled)
                    .padding(.top, 8)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .font(.system(size: MeltedType.control))
            .foregroundStyle(palette.secondary)
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
