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
                    MeltedSegmentedPicker(
                        "登录方式",
                        selection: Binding(get: { method }, set: model.selectAuthenticationMethod),
                        options: methods.map { .init($0, title: $0.title) }
                    )
                    .disabled(model.connecting)
                }
                ZStack(alignment: .topLeading) {
                    CredentialForm(model: model, method: method)
                        .id(method)
                        .transition(.opacity)
                }
                if method == .key {
                    Text("身份密钥保存在系统钥匙串，不代表 Apple 账号")
                        .font(.system(size: MeltedType.metadata))
                        .foregroundStyle(palette.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    if discovery.registration == "closed" {
                        Text("当前服务器仅允许已有身份密钥登录")
                            .font(.system(size: MeltedType.metadata))
                            .foregroundStyle(palette.warning)
                    }
                    if model.localCredentialOption {
                        Button("使用本机凭据继续") { Task { await model.login(localOnly: true) } }
                            .buttonStyle(MeltedSecondaryButtonStyle())
                            .frame(height: 32)
                            .disabled(!model.acceptedServer || model.connecting)
                    }
                }
            } else {
                Text("当前版本暂不支持这台服务器的登录方式")
                    .font(.system(size: MeltedType.control))
                    .foregroundStyle(palette.warning)
                    .fixedSize(horizontal: false, vertical: true)
                Button("重新获取登录方式") { Task { await model.discover() } }
                    .buttonStyle(MeltedSecondaryButtonStyle())
                    .frame(height: 32)
                    .disabled(model.connecting)
            }
        }
        .transaction { $0.animation = nil }
    }
}
