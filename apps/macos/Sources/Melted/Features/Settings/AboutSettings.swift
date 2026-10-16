// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem
import MeltedRendering

struct AboutSettings: View {
    @State private var legalDocument: LegalDocument?

    var body: some View {
        Section {
            LabeledContent("版本", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—")
            LabeledContent("构建", value: Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "—")
            LabeledContent("许可协议", value: "GPL-3.0-or-later")
            Button("查看许可协议") { legalDocument = .license }
            Button("第三方声明") { legalDocument = .thirdParty }
        } header: {
            Text("关于")
        } footer: {
            Text("© 2026 Melted contributors。你可以依照 GPL-3.0-or-later 再分发和修改本软件；本软件不提供任何担保。")
        }
        .sheet(item: $legalDocument) { document in
            LegalDocumentView(document: document)
        }
    }
}

enum LegalDocument: String, Identifiable {
    case license, thirdParty
    var id: String { rawValue }
    var title: String { self == .license ? "许可协议" : "第三方声明" }
    var filename: String { self == .license ? "Melted-GPL-3.0.txt" : "THIRD_PARTY.md" }
}

private struct LegalDocumentView: View {
    let document: LegalDocument
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var text: String?
    @State private var failed = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(document.title).font(.headline)
                Spacer()
                Button("完成") { dismiss() }.keyboardShortcut(.cancelAction)
            }
            .padding()
            Divider()
            ScrollView {
                if let text {
                    Group {
                        if document == .thirdParty {
                            ReadingMarkdown(text)
                        } else {
                            Text(text)
                                .font(.system(.body, design: .monospaced))
                                .textSelection(.enabled)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(24)
                } else if failed {
                    Text("当前应用包缺少许可文件，请重新构建应用。")
                        .padding(24)
                } else {
                    ProgressView().padding(24)
                }
            }
        }
        .frame(width: 640, height: 520)
        .background(MeltedPalette(scheme).canvas)
        .foregroundStyle(MeltedPalette(scheme).text)
        .task {
            guard let resources = Bundle.main.resourceURL else { failed = true; return }
            do {
                text = try String(contentsOf: resources.appendingPathComponent("Licenses/\(document.filename)"), encoding: .utf8)
            } catch { failed = true }
        }
    }
}
