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
                    if discovery.registration == "closed" {
                        Text("仅限已有身份密钥登录")
                            .font(.system(size: MeltedType.metadata))
                            .foregroundStyle(palette.warning)
                    }
                    if model.localCredentialOption {
                        Button { Task { await model.login(localOnly: true) } } label: {
                            Text("使用本机凭据继续").frame(minHeight: MeltedNoticeMetrics.actionHeight)
                        }
                        .buttonStyle(MeltedSecondaryButtonStyle())
                        .disabled(!model.acceptedServer || model.connecting)
                    }
                }
            } else if model.failure == nil {
                MeltedNotice(
                    tone: .attention,
                    title: "暂时无法登录",
                    guidance: "服务器没有提供此版本支持的登录方式",
                    actions: [.init("重新获取登录方式") { Task { await model.discover() } }]
                )
                .disabled(model.connecting)
            }
        }
        .transaction { $0.animation = nil }
    }
}
