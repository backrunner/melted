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
                field("账号") {
                    TextField("服务器账号", text: $username)
                        .textContentType(.username)
                        .focused($focus, equals: .username)
                        .onSubmit { focus = .secret }
                }
            }
            if method == .password || method == .apiKey {
                field(method == .password ? "密码" : "API Key") {
                    SecureField(method == .password ? "输入密码" : "粘贴服务器签发的 API Key", text: $secret)
                        .textContentType(method == .password ? .password : nil)
                        .focused($focus, equals: .secret)
                        .onSubmit(submit)
                }
            }
            Button(action: submit) {
                Text(method == .browser ? "在浏览器中继续" : "登录")
                    .frame(maxWidth: .infinity)
                    .frame(height: MeltedConnection.controlHeight)
            }
            .buttonStyle(MeltedPrimaryButtonStyle(palette: palette))
            .disabled(!ready)
        }
        .onChange(of: model.acceptedServer) { _, accepted in
            if accepted { focus = method == .password ? .username : .secret }
            else { secret = ""; focus = nil }
        }
        .onDisappear { secret = ""; username = "" }
    }
    private func field<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).foregroundStyle(palette.secondary)
            content()
                .textFieldStyle(.plain)
                .padding(.horizontal, MeltedReading.blockInset)
                .frame(height: MeltedConnection.controlHeight)
                .background(palette.surface, in: RoundedRectangle(cornerRadius: MeltedReading.cornerRadius))
                .overlay {
                    RoundedRectangle(cornerRadius: MeltedReading.cornerRadius)
                        .strokeBorder(palette.separator, lineWidth: 1)
                }
                .disabled(!model.acceptedServer || model.connecting)
                .accessibilityLabel(label)
        }
        .font(.system(size: MeltedType.control))
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
