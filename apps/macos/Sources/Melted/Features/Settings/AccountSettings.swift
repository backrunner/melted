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
        // Account Section
        SettingsSection(
            icon: "person.fill",
            title: "账户与数据",
            description: "管理连接和凭据"
        ) {
            VStack(alignment: .leading, spacing: 14) {
                SettingsInfoRow(label: "服务器", value: model.serverAddress, selectable: true)

                if let d = model.discovery {
                    SettingsInfoRow(label: "运营者", value: d.operator.name)
                }

                SettingsInfoRow(
                    label: "身份凭据",
                    value: model.identityStorage == "password" ? "账号密码" :
                           model.identityStorage == "api_key" ? "API Key" :
                           model.identityStorage == "browser" ? "浏览器登录" :
                           model.identityStorage == "local" ? "仅此 Mac" :
                           model.identityStorage == "keychain" ? "可同步钥匙串" : "本机会话"
                )

                Divider()
                    .background(palette.separator)

                VStack(alignment: .leading, spacing: 8) {
                    Label {
                        Text("登录会话保存在本机钥匙串，密码和 API Key 不在应用中保存。正文暂存在内存。")
                            .font(.system(size: 12))
                            .foregroundStyle(palette.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    } icon: {
                        Image(systemName: "info.circle.fill")
                            .font(.system(size: 12))
                            .foregroundStyle(palette.accent.opacity(0.7))
                    }
                }

                if model.discovery?.capabilities?.developmentSamples == true {
                    Divider()
                        .background(palette.separator)

                    Button {
                        Task { await model.seedDevelopmentSamples() }
                    } label: {
                        Label("载入开发样例", systemImage: "tray.and.arrow.down.fill")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(palette.accent)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(palette.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                }

                if model.connected {
                    Divider()
                        .background(palette.separator)

                    Button {
                        Task { await model.logout() }
                    } label: {
                        Label("退出登录", systemImage: "rectangle.portrait.and.arrow.right")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(palette.danger)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(palette.danger.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                }

                if let error = model.error {
                    Divider()
                        .background(palette.separator)

                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(palette.danger)
                        Text(error)
                            .font(.system(size: 12))
                            .foregroundStyle(palette.danger)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(palette.danger.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                }
            }
        }

    }
}
