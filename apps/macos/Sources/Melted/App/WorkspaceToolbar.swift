// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct WorkspaceToolbar: ToolbarContent {
    @ObservedObject var model: WorkspaceModel
    let width: CGFloat
    @Binding var searchOpen: Bool
    @Environment(\.openSettings) private var openSettings
    @Environment(\.colorScheme) private var scheme
    private var palette: MeltedPalette { MeltedPalette(scheme) }
    @ToolbarContentBuilder var body: some ToolbarContent {
        ToolbarItem(id: "reading-view", placement: .navigation) {
            Picker("资讯视图", selection: $model.filter.view) {
                Label("全部", systemImage: "doc.text").tag("all")
                Label("未读", systemImage: "circle").tag("unread")
                Label("收藏", systemImage: "bookmark").tag("saved")
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(width: width >= 1000 ? 240 : 200)
            .frame(height: 32)
        }

        if #available(macOS 26.0, *) {
            ToolbarSpacer(.flexible, placement: .primaryAction)
        } else {
            ToolbarItem(id: "reading-space", placement: .automatic) { Spacer() }
        }

        ToolbarItem(id: "reading-search", placement: .primaryAction) {
            Button {
                searchOpen.toggle()
            } label: {
                Label(searchTitle, systemImage: "magnifyingglass")
                    .labelStyle(.titleAndIcon)
                    .lineLimit(1)
            }
            .help("搜索内容、分类、标签或关注主题（⌘F）")
            .accessibilityLabel("搜索与筛选")
        }

        ToolbarItem(id: "reading-settings", placement: .primaryAction) {
            Button {
                openSettings()
            } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(palette.secondary)
                    .frame(width: 28, height: 28)
                    .background(palette.canvas.opacity(0.4), in: Circle())
                    .overlay(
                        Circle()
                            .strokeBorder(palette.separator.opacity(0.3), lineWidth: 0.5)
                    )
            }
            .buttonStyle(.plain)
            .keyboardShortcut(",", modifiers: .command)
            .accessibilityLabel("设置")
            .help("设置（⌘,）")
        }
    }

    private var searchTitle: String {
        if !model.filter.q.isEmpty { return model.filter.q }
        let count = model.filter.categoryIds.count + model.filter.tagIds.count + model.filter.subjectIds.count
        return count > 0 ? "\(count) 个筛选" : "搜索"
    }

}
