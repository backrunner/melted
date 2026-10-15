// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedDesignSystem

struct ServerConfirmationView: View {
    @ObservedObject var model: WorkspaceModel
    @Environment(\.colorScheme) private var scheme
    private var palette: MeltedPalette { MeltedPalette(scheme) }

    var body: some View {
        ConnectionPage {
            HStack {
                MeltedWordmark()
                Spacer()
                Button { model.resetConnection() } label: {
                    Label("更换服务器", systemImage: "chevron.left")
                }
                .buttonStyle(.plain)
                .font(.system(size: MeltedType.control))
                .foregroundStyle(palette.secondary)
                .disabled(model.connecting)
            }

            VStack(alignment: .leading, spacing: MeltedReading.headingBodySpacing) {
                Text("确认服务器")
                    .font(.system(size: MeltedType.title, weight: .semibold))
                    .accessibilityAddTraits(.isHeader)
                Text(model.serverAddress)
                    .font(.system(size: MeltedType.row))
                    .foregroundStyle(palette.secondary)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let discovery = model.discovery, let manifest = model.manifest {
                VStack(alignment: .leading, spacing: MeltedReading.blockInset) {
                    VStack(alignment: .leading, spacing: 6) {
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
                .padding(MeltedReading.blockInset)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(palette.surface, in: RoundedRectangle(cornerRadius: MeltedReading.cornerRadius))
                .overlay {
                    RoundedRectangle(cornerRadius: MeltedReading.cornerRadius)
                        .strokeBorder(palette.separator, lineWidth: 1)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Toggle("我信任这台服务器", isOn: $model.acceptedServer)
                        .toggleStyle(.checkbox)
                        .font(.system(size: MeltedType.control, weight: .medium))
                        .disabled(model.connecting)
                    Text("继续后，你的账户信息将由这台服务器处理。")
                        .font(.system(size: MeltedType.metadata))
                        .foregroundStyle(palette.secondary)
                }
                ConnectionActions(model: model, discovery: discovery)
            }
            if let error = model.error { ConnectionError(message: error) }
        }
    }
}
