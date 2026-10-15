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
    private var methods: [AuthenticationMethod] { discovery.auth?.supportedMethods ?? [] }

    var body: some View {
        VStack(alignment: .leading, spacing: MeltedReading.blockInset) {
            if let method = model.authenticationMethod {
                if methods.count > 1 {
                    Picker("登录方式", selection: Binding(get: { method }, set: model.selectAuthenticationMethod)) {
                        ForEach(methods) { Text($0.title).tag($0) }
                    }
                    .disabled(model.connecting)
                    .font(.system(size: MeltedType.control))
                } else {
                    Text("此服务器使用\(method.title)")
                        .font(.system(size: MeltedType.control, weight: .medium))
                        .foregroundStyle(palette.secondary)
                }
                CredentialForm(model: model, method: method)
                    .id(method)
                if model.connecting {
                    HStack(spacing: 8) {
                        ProgressView().controlSize(.small)
                        Text("正在登录…")
                    }
                    .font(.system(size: MeltedType.control))
                    .foregroundStyle(palette.secondary)
                }
                Text(note(for: method))
                    .font(.system(size: MeltedType.metadata))
                    .foregroundStyle(palette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                if method == .key && discovery.registration == "closed" {
                    Text("当前服务器仅允许已有身份密钥登录")
                        .font(.system(size: MeltedType.metadata))
                        .foregroundStyle(palette.warning)
                }
                if method == .key && model.localCredentialOption {
                    Button("使用本机凭据继续") { Task { await model.login(localOnly: true) } }
                        .disabled(!model.acceptedServer || model.connecting)
                }
            } else {
                Text("这台服务器的登录方式暂不受当前版本支持。请更新应用，或联系服务器运营者。")
                    .font(.system(size: MeltedType.control))
                    .foregroundStyle(palette.warning)
                    .fixedSize(horizontal: false, vertical: true)
                Button("重新获取登录方式") { Task { await model.discover() } }
                    .disabled(model.connecting)
            }
        }
    }
    private func note(for method: AuthenticationMethod) -> String {
        switch method {
        case .password: "使用服务器运营者提供的账户。密码仅用于本次登录。"
        case .apiKey: "使用这台服务器签发的 API Key。验证后仅在本机钥匙串保存登录会话。"
        case .browser: "在浏览器中完成身份验证，然后自动返回 Melted。"
        case .key: "身份密钥保存在系统钥匙串中，不代表 Apple 账号身份。"
        }
    }
}
