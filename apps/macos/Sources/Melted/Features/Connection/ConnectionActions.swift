// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct ConnectionActions: View {
    @ObservedObject var model: WorkspaceModel
    let discovery: Discovery
    @Environment(\.colorScheme) private var scheme
    private var palette: MeltedPalette { MeltedPalette(scheme) }

    var body: some View {
        VStack(alignment: .leading, spacing: MeltedReading.blockInset) {
            if discovery.auth?.methods.contains("key") == true {
                Button { Task { await model.login() } } label: {
                    Text("使用密钥登录")
                        .frame(maxWidth: .infinity)
                        .frame(height: MeltedConnection.controlHeight)
                }
                .buttonStyle(MeltedPrimaryButtonStyle(palette: palette))
                .disabled(!model.acceptedServer || model.connecting)
            }
            if discovery.auth?.methods.contains("browser") == true {
                Button { Task { await model.login(browser: true) } } label: {
                    Text("浏览器登录")
                        .frame(maxWidth: .infinity)
                        .frame(height: MeltedConnection.controlHeight)
                }
                .buttonStyle(MeltedSecondaryButtonStyle(palette: palette))
                .disabled(!model.acceptedServer || model.connecting)
            }
            if model.connecting {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text("正在恢复或建立登录…")
                }
                .font(.system(size: MeltedType.control))
                .foregroundStyle(palette.secondary)
            }
            Text(model.identityStorage == "local"
                 ? "身份密钥保存在此 Mac 的钥匙串中。"
                 : "身份密钥保存在系统钥匙串中，服务器不会获得你的 Apple 账号。")
                .font(.system(size: MeltedType.metadata))
                .foregroundStyle(palette.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if discovery.registration == "closed" {
                Text("当前服务器仅允许已有身份登录")
                    .font(.system(size: MeltedType.metadata))
                    .foregroundStyle(palette.warning)
            }
            if model.localCredentialOption {
                Button("使用本机凭据继续") { Task { await model.login(localOnly: true) } }
                    .disabled(!model.acceptedServer || model.connecting)
            }
        }
    }
}
