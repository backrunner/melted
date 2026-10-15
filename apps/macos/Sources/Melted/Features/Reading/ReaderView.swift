// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import AppKit
import SwiftUI
import MeltedCore
import MeltedDesignSystem
import MeltedRendering

struct ReaderView: View {
    @ObservedObject var model: WorkspaceModel
    let compact: Bool
    @Environment(\.colorScheme) private var scheme
    @AppStorage("readingScale") private var scale = 1.0
    @State private var externalURL: URL?
    private var palette: MeltedPalette { MeltedPalette(scheme) }
    var body: some View {
        VStack(spacing: 0) {
            if compact {
                HStack(spacing: 8) {
                    Button {
                        model.selectedID = nil
                    } label: {
                        Label("返回", systemImage: "chevron.left")
                            .labelStyle(.titleAndIcon)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(palette.accent)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                    Spacer()
                }
                .padding(.horizontal, MeltedReading.compactInset)
                .padding(.top, 16)
                .padding(.bottom, 12)
            }
            if model.loadingDetail {
                LoadingState("正在载入正文…")
            } else if let item = model.detail {
                ReadingDocumentView(
                    item: item, compact: compact, scale: scale, mutating: model.mutating,
                    termName: model.termName,
                    toggleSaved: { Task { await model.updateState(for: item, saved: !item.state.saved) } },
                    openSource: { externalURL = $0 }
                )
                .id(item.id)
            } else {
                EmptyState(
                    icon: "doc.text",
                    title: "选择一条内容开始阅读",
                    description: "整理后的信息会在这里展开"
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(palette.surface)
        .foregroundStyle(palette.text)
        .environment(\.openURL, OpenURLAction { url in
            guard let safe = SafeLinks.url(url.absoluteString) else { return .discarded }
            externalURL = safe; return .handled
        })
        .confirmationDialog("在浏览器中打开来源？", isPresented: Binding(get: { externalURL != nil }, set: { if !$0 { externalURL = nil } })) {
            if let url = externalURL { Button("打开链接") { NSWorkspace.shared.open(url); externalURL = nil } }
            Button("取消", role: .cancel) { externalURL = nil }
        } message: { Text(externalURL?.absoluteString ?? "") }
    }

}
