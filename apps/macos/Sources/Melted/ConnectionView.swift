import SwiftUI
import MeltedDesignSystem

struct ConnectionView: View {
    @ObservedObject var model: WorkspaceModel
    @Environment(\.colorScheme) private var scheme
    @State private var showLanding = true

    var body: some View {
        let palette = MeltedPalette(scheme)

        Group {
            if showLanding && model.discovery == nil {
                LandingView(model: model)
                    .transition(.opacity.combined(with: .scale(scale: 0.95)))
            } else {
                detailedConnectionView(palette: palette)
                    .transition(.opacity.combined(with: .move(edge: .trailing)))
            }
        }
        .animation(.easeInOut(duration: 0.4), value: showLanding)
        .onChange(of: model.discovery != nil) { _, hasDiscovery in
            if hasDiscovery {
                showLanding = false
            }
        }
    }

    private func detailedConnectionView(palette: MeltedPalette) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                // Back button with improved styling
                HStack {
                    Button {
                        model.discovery = nil
                        model.manifest = nil
                        model.acceptedServer = false
                        showLanding = true
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 14, weight: .semibold))
                            Text("返回")
                                .font(.system(size: 14, weight: .medium))
                        }
                        .foregroundStyle(palette.accent)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(palette.accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                    Spacer()
                }
                .padding(.top, 16)
                VStack(alignment: .leading, spacing: 20) {
                    Text("服务器详情")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(palette.text)

                    HStack(spacing: 14) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 10)
                                .fill(palette.accent.opacity(0.12))
                            Image(systemName: "server.rack")
                                .font(.system(size: 18, weight: .medium))
                                .foregroundStyle(palette.accent)
                        }
                        .frame(width: 44, height: 44)

                        Text(model.serverAddress)
                            .font(.system(size: MeltedType.row, weight: .semibold))
                            .foregroundStyle(palette.text)
                    }
                }
                if let discovery = model.discovery, let manifest = model.manifest {
                    VStack(alignment: .leading, spacing: 24) {
                        // Operator information card with visual effect
                        VStack(alignment: .leading, spacing: 18) {
                            HStack(spacing: 14) {
                                ZStack {
                                    Circle()
                                        .fill(palette.accent.opacity(0.12))
                                    Image(systemName: "building.2")
                                        .font(.system(size: 22, weight: .medium))
                                        .foregroundStyle(palette.accent)
                                }
                                .frame(width: 52, height: 52)

                                VStack(alignment: .leading, spacing: 5) {
                                    Text("运营者")
                                        .font(.system(size: MeltedType.metadata, weight: .medium))
                                        .foregroundStyle(palette.secondary)
                                    Text(discovery.operator.name)
                                        .font(.system(size: MeltedType.section, weight: .bold))
                                        .foregroundStyle(palette.text)
                                }
                            }

                            Text(manifest.description)
                                .font(.system(size: MeltedType.control))
                                .foregroundStyle(palette.secondary)
                                .lineSpacing(5)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(28)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .strokeBorder(palette.separator.opacity(0.3), lineWidth: 1)
                        )
                        .shadow(color: .black.opacity(0.04), radius: 8, y: 2)

                        // Trust confirmation with enhanced visual feedback
                        HStack(alignment: .top, spacing: 14) {
                            Toggle("", isOn: $model.acceptedServer)
                                .toggleStyle(.checkbox)
                                .labelsHidden()
                                .scaleEffect(1.15)

                            VStack(alignment: .leading, spacing: 6) {
                                Text("我信任这台服务器")
                                    .font(.system(size: MeltedType.control, weight: .semibold))
                                    .foregroundStyle(palette.text)
                                Text("继续后，你的账户信息将发送到这台服务器进行处理")
                                    .font(.system(size: MeltedType.metadata))
                                    .foregroundStyle(palette.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .padding(20)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(model.acceptedServer ? palette.accent.opacity(0.08) : palette.canvas.opacity(0.5))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .strokeBorder(
                                    model.acceptedServer ? palette.accent.opacity(0.4) : palette.separator.opacity(0.3),
                                    lineWidth: model.acceptedServer ? 1.5 : 1
                                )
                        )
                        .animation(.spring(response: 0.3, dampingFraction: 0.75), value: model.acceptedServer)
                    }
                    VStack(alignment: .leading, spacing: 20) {
                        // Action buttons with improved styling
                        HStack(spacing: 14) {
                            Button {
                                Task { await model.login() }
                            } label: {
                                HStack(spacing: 10) {
                                    if !model.connecting {
                                        Image(systemName: "key.fill")
                                            .font(.system(size: 15, weight: .semibold))
                                    }
                                    Text("使用密钥登录")
                                }
                                .frame(height: 44)
                                .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(PrimaryButtonStyle(palette: palette))
                            .disabled(!model.acceptedServer || model.connecting)

                            if discovery.auth?.methods.contains("browser") == true {
                                Button {
                                    Task { await model.login(browser: true) }
                                } label: {
                                    HStack(spacing: 10) {
                                        Image(systemName: "safari")
                                            .font(.system(size: 15, weight: .semibold))
                                        Text("浏览器登录")
                                    }
                                    .frame(height: 44)
                                    .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(SecondaryButtonStyle(palette: palette))
                                .disabled(!model.acceptedServer || model.connecting)
                            }
                        }

                        if model.connecting {
                            HStack(spacing: 12) {
                                ProgressView()
                                    .controlSize(.small)
                                    .tint(palette.accent)
                                Text("正在连接服务器…")
                                    .font(.system(size: MeltedType.control))
                                    .foregroundStyle(palette.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.vertical, 10)
                        }

                        // Additional info with visual effect
                        VStack(alignment: .leading, spacing: 14) {
                            HStack(spacing: 10) {
                                Image(systemName: "lock.shield.fill")
                                    .font(.system(size: 13, weight: .medium))
                                Text("凭据保存在系统钥匙串；启用 iCloud 钥匙串后可随设备同步")
                            }

                            HStack(spacing: 10) {
                                Image(systemName: "person.badge.shield.checkmark.fill")
                                    .font(.system(size: 13, weight: .medium))
                                Text("服务器不会获得你的 Apple 账号信息")
                            }

                            if discovery.registration == "closed" {
                                HStack(spacing: 10) {
                                    Image(systemName: "exclamationmark.triangle.fill")
                                        .font(.system(size: 13, weight: .medium))
                                    Text("当前服务器仅允许已有身份登录")
                                }
                                .foregroundStyle(palette.warning)
                            }
                        }
                        .font(.system(size: MeltedType.metadata))
                        .foregroundStyle(palette.secondary)
                        .padding(18)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .strokeBorder(palette.separator.opacity(0.2), lineWidth: 0.5)
                        )

                        if model.localCredentialOption {
                            Button {
                                Task { await model.login(localOnly: true) }
                            } label: {
                                Text("使用本机凭据继续")
                                    .font(.system(size: MeltedType.metadata, weight: .medium))
                                    .underline()
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(palette.accent)
                            .disabled(!model.acceptedServer || model.connecting)
                        }
                    }
                } else {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 12) {
                            Button("连接服务器") {
                                Task { await model.discover() }
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(model.connecting || model.serverAddress.isEmpty)

                            if model.connecting {
                                ProgressView()
                                    .controlSize(.small)
                            }
                        }

                        Text("选择自己的 Melted 服务器。连接后可以先查看运营者和信息处理去向，再登录账户。")
                            .font(.system(size: MeltedType.control))
                            .foregroundStyle(palette.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                if let error = model.error {
                    HStack(spacing: 14) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(palette.danger)
                        VStack(alignment: .leading, spacing: 6) {
                            Text("连接失败")
                                .font(.system(size: MeltedType.control, weight: .bold))
                                .foregroundStyle(palette.danger)
                            Text(error)
                                .font(.system(size: MeltedType.control))
                                .foregroundStyle(palette.danger.opacity(0.9))
                                .textSelection(.enabled)
                        }
                        Spacer()
                    }
                    .padding(24)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(palette.danger.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .strokeBorder(palette.danger.opacity(0.4), lineWidth: 1)
                    )
                    .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: 580, alignment: .leading)
            .padding(48)
            .frame(maxWidth: .infinity)
        }
        .background(palette.surface)
        .foregroundStyle(palette.text)
    }
}

// MARK: - Button Styles

private struct PrimaryButtonStyle: ButtonStyle {
    let palette: MeltedPalette

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: MeltedType.control, weight: .semibold))
            .foregroundStyle(palette.accentText)
            .padding(.horizontal, 24)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(palette.accent)
            )
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .opacity(configuration.isPressed ? 0.85 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.75), value: configuration.isPressed)
    }
}

private struct SecondaryButtonStyle: ButtonStyle {
    let palette: MeltedPalette

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: MeltedType.control, weight: .semibold))
            .foregroundStyle(palette.text)
            .padding(.horizontal, 24)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(.regularMaterial)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(palette.separator.opacity(0.5), lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.75), value: configuration.isPressed)
    }
}
