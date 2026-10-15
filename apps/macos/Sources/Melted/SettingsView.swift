// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedDesignSystem

struct SettingsView: View {
    @ObservedObject var model: WorkspaceModel
    @AppStorage("appearance") private var appearance = "system"
    @AppStorage("readingScale") private var scale = 1.0
    @Environment(\.colorScheme) private var scheme

    private var palette: MeltedPalette { MeltedPalette(scheme) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Appearance Section
                settingsSection(
                    icon: "paintbrush.fill",
                    title: "外观",
                    description: "自定义应用的视觉效果"
                ) {
                    VStack(alignment: .leading, spacing: 16) {
                        // Theme picker with icons
                        VStack(alignment: .leading, spacing: 10) {
                            Text("主题")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(palette.text)

                            HStack(spacing: 8) {
                                themeButton("跟随系统", icon: "circle.lefthalf.filled", tag: "system")
                                themeButton("浅色", icon: "sun.max.fill", tag: "light")
                                themeButton("深色", icon: "moon.fill", tag: "dark")
                            }
                        }

                        Divider()
                            .background(palette.separator)

                        // Reading scale slider
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text("阅读字号")
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(palette.text)
                                Spacer()
                                Text("\(Int((scale * 100).rounded()))%")
                                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                                    .foregroundStyle(palette.accent)
                                    .frame(width: 52, alignment: .trailing)
                                    .accessibilityHidden(true)
                            }

                            Slider(value: $scale, in: 0.85...1.5, step: 0.05)
                                .tint(palette.accent)
                                .accessibilityLabel("阅读字号")
                                .accessibilityValue("\(Int((scale * 100).rounded()))%")

                            HStack {
                                Text("较小")
                                    .font(.system(size: 11))
                                    .foregroundStyle(palette.secondary)
                                Spacer()
                                Text("较大")
                                    .font(.system(size: 11))
                                    .foregroundStyle(palette.secondary)
                            }
                        }
                    }
                }

                // Account Section
                settingsSection(
                    icon: "person.fill",
                    title: "账户与数据",
                    description: "管理连接和凭据"
                ) {
                    VStack(alignment: .leading, spacing: 14) {
                        infoRow(label: "服务器", value: model.serverAddress, selectable: true)

                        if let d = model.discovery {
                            infoRow(label: "运营者", value: d.operator.name)
                        }

                        infoRow(
                            label: "身份凭据",
                            value: model.identityStorage == "browser" ? "浏览器登录" :
                                   model.identityStorage == "local" ? "仅此 Mac" :
                                   model.identityStorage == "keychain" ? "可同步钥匙串" : "本机会话"
                        )

                        Divider()
                            .background(palette.separator)

                        VStack(alignment: .leading, spacing: 8) {
                            Label {
                                Text("数据存储在本地，退出后正文需重新获取")
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
                                    .foregroundStyle(.red)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 10)
                                    .background(Color.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                            }
                            .buttonStyle(.plain)
                        }

                        if let error = model.error {
                            Divider()
                                .background(palette.separator)

                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .font(.system(size: 14))
                                    .foregroundStyle(.red)
                                Text(error)
                                    .font(.system(size: 12))
                                    .foregroundStyle(.red)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                        }
                    }
                }

                // About Section
                settingsSection(
                    icon: "info.circle.fill",
                    title: "关于",
                    description: nil
                ) {
                    VStack(alignment: .leading, spacing: 10) {
                        infoRow(label: "版本", value: "1.0.0")
                        infoRow(label: "构建", value: Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "—")
                    }
                }
            }
            .padding(28)
        }
        .background(palette.canvas)
        .frame(width: 640, height: 580)
        .navigationTitle("设置")
    }

    @ViewBuilder
    private func settingsSection<Content: View>(
        icon: String,
        title: String,
        description: String?,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(palette.accent)
                    .frame(width: 28, height: 28)
                    .background(palette.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 6))

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(palette.text)

                    if let description {
                        Text(description)
                            .font(.system(size: 12))
                            .foregroundStyle(palette.secondary)
                    }
                }
            }

            content()
                .padding(18)
                .background(palette.surface, in: RoundedRectangle(cornerRadius: 10))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(palette.separator.opacity(0.5), lineWidth: 0.5)
                )
        }
    }

    @ViewBuilder
    private func themeButton(_ title: String, icon: String, tag: String) -> some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                appearance = tag
            }
        } label: {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundStyle(appearance == tag ? palette.accent : palette.secondary)
                Text(title)
                    .font(.system(size: 12, weight: appearance == tag ? .semibold : .regular))
                    .foregroundStyle(appearance == tag ? palette.accent : palette.text)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(appearance == tag ? palette.accent.opacity(0.12) : palette.canvas)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(
                        appearance == tag ? palette.accent.opacity(0.4) : palette.separator.opacity(0.3),
                        lineWidth: appearance == tag ? 1.5 : 0.5
                    )
            )
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func infoRow(label: String, value: String, selectable: Bool = false) -> some View {
        HStack(alignment: .top) {
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(palette.secondary)
                .frame(width: 80, alignment: .leading)

            if selectable {
                Text(value)
                    .font(.system(size: 13))
                    .foregroundStyle(palette.text)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Text(value)
                    .font(.system(size: 13))
                    .foregroundStyle(palette.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}
