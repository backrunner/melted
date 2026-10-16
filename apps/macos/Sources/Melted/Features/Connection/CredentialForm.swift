// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct CredentialForm: View {
    @ObservedObject var model: WorkspaceModel
    let method: AuthenticationMethod
    @State private var username = ""
    @State private var secret = ""
    @FocusState private var focus: Field?
    @Environment(\.colorScheme) private var scheme
    private enum Field { case username, secret }
    private var palette: MeltedPalette { MeltedPalette(scheme) }
    private var ready: Bool {
        guard model.acceptedServer, !model.connecting else { return false }
        switch method {
        case .password: return !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !secret.isEmpty
        case .apiKey: return !secret.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        default: return true
        }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: MeltedReading.blockInset) {
            if method == .password {
                MeltedField("账号", isFocused: focus == .username) {
                    TextField("", text: $username)
                        .textContentType(.username)
                        .focused($focus, equals: .username)
                        .onSubmit { focus = .secret }
                }
            }
            if method == .password || method == .apiKey {
                MeltedField(method == .password ? "密码" : "API Key", isFocused: focus == .secret) {
                    SecureField("", text: $secret)
                        .textContentType(method == .password ? .password : nil)
                        .focused($focus, equals: .secret)
                        .onSubmit(submit)
                }
            }
            Button(action: submit) {
                HStack(spacing: 8) {
                    if model.connecting {
                        ProgressView().controlSize(.small).tint(palette.accentText)
                    }
                    Text(model.connecting ? "正在登录…" : method == .browser ? "在浏览器中继续" : "登录")
                }
                .frame(maxWidth: .infinity)
                .frame(height: MeltedConnection.controlHeight)
            }
            .buttonStyle(MeltedPrimaryButtonStyle())
            .disabled(!ready)
        }
        .disabled(!model.acceptedServer || model.connecting)
        .onChange(of: model.acceptedServer) { _, accepted in
            if accepted { focus = method == .password ? .username : .secret }
            else { secret = ""; focus = nil }
        }
        .onDisappear { secret = ""; username = "" }
    }
    private func submit() {
        guard ready else { return }
        let credential: LoginCredential?
        switch method {
        case .password: credential = .password(username: username, password: secret)
        case .apiKey: credential = .apiKey(secret)
        default: credential = nil
        }
        secret = ""
        Task { await model.login(credential: credential) }
    }
}
