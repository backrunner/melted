// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedDesignSystem

struct ServerConfirmationView: View {
    @ObservedObject var model: WorkspaceModel
    @Environment(\.colorScheme) private var scheme
    private var palette: MeltedPalette { MeltedPalette(scheme) }

    var body: some View {
        VStack(alignment: .leading, spacing: MeltedConnection.sectionSpacing) {
            VStack(alignment: .leading, spacing: MeltedReading.headingBodySpacing) {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(model.failure?.kind == .sessionExpired ? "重新登录" : "确认服务器")
                        .font(.system(size: MeltedType.title, weight: .semibold))
                        .accessibilityAddTraits(.isHeader)
                    Spacer(minLength: 8)
                    Button { model.resetConnection() } label: {
                        Label("更换服务器", systemImage: "chevron.left")
                    }
                    .buttonStyle(.plain)
                    .font(.system(size: MeltedType.control))
                    .foregroundStyle(palette.secondary)
                    .disabled(model.connecting)
                }
                Text(model.serverAddress)
                    .font(.system(size: MeltedType.row))
                    .foregroundStyle(palette.secondary)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let discovery = model.discovery, let manifest = model.manifest {
                InfoCard {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("运营者")
                            .font(.system(size: MeltedType.metadata))
                            .foregroundStyle(palette.secondary)
                        Text(discovery.operator.name)
                            .font(.system(size: MeltedType.row, weight: .semibold))
                    }
                    Text(manifest.description)
                        .font(.system(size: MeltedType.control))
                        .foregroundStyle(palette.secondary)
                        .lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if let failure = model.failure {
                    FailureNotice(failure: failure, model: model)
                }

                if model.authenticationMethod != nil {
                    Toggle(isOn: $model.acceptedServer) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("我信任这台服务器")
                                .font(.system(size: MeltedType.control, weight: .medium))
                            Text("账户信息将由此服务器处理")
                                .font(.system(size: MeltedType.metadata))
                                .foregroundStyle(palette.secondary)
                        }
                    }
                    .toggleStyle(MeltedCheckboxStyle())
                    .disabled(model.connecting)
                }

                ConnectionActions(model: model, discovery: discovery)
            }
        }
    }
}
