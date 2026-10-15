// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct ContentRowActions: View {
    @ObservedObject var model: WorkspaceModel
    let item: Briefing
    @ViewBuilder
    var body: some View {
        Button {
            Task { await model.updateState(for: item, read: !item.state.read) }
        } label: {
            Label(item.state.read ? "标为未读" : "标为已读", systemImage: item.state.read ? "circle" : "checkmark.circle.fill")
        }

        Button {
            Task { await model.updateState(for: item, saved: !item.state.saved) }
        } label: {
            Label(item.state.saved ? "取消收藏" : "收藏", systemImage: item.state.saved ? "bookmark.slash" : "bookmark.fill")
        }

        Divider()

        Button {
            model.selectedID = item.id
        } label: {
            Label("打开", systemImage: "arrow.right.circle")
        }

        if let url = URL(string: "\(model.serverAddress)/briefings/\(item.id)") {
            Button {
                NSWorkspace.shared.open(url)
            } label: {
                Label("在浏览器中打开", systemImage: "safari")
            }
        }

        Divider()

        Button {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(item.title, forType: .string)
        } label: {
            Label("复制标题", systemImage: "doc.on.doc")
        }
    }

}
