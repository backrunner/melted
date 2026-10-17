// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct AccountSettings: View {
    @ObservedObject var model: WorkspaceModel
    @Environment(\.colorScheme) private var scheme
    private var palette: MeltedPalette { MeltedPalette(scheme) }

    var body: some View {
        Section {
            LabeledContent("服务器") {
                Text(model.serverAddress).textSelection(.enabled)
            }
            if let discovery = model.discovery {
                LabeledContent("运营者", value: discovery.operator.name)
            }
            LabeledContent("登录方式", value: credentialTitle)

            if model.connected {
                HStack {
                    Spacer(minLength: 0)
                    Button(role: .destructive) { Task { await model.logout() } } label: {
                        Text("退出登录")
                            .frame(minHeight: 32)
                    }
                    .buttonStyle(MeltedSecondaryButtonStyle())
                }
            }
            if let failure = model.failure {
                Label(failure.message, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(palette.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let banner = model.banner {
                Label(banner, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(palette.warning)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } header: {
            Text("账户")
        }
    }

    private var credentialTitle: String {
        switch model.identityStorage {
        case "password": "账号密码"
        case "api_key": "API Key"
        case "browser": "浏览器登录"
        case "local": "仅此 Mac"
        case "keychain": "可同步钥匙串"
        default: "本机会话"
        }
    }
}
