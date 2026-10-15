// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

// Remove the private ContentRow as it's replaced by ContentRowView
private struct ContentRow_Deprecated: View {
    let item: Briefing
    let category: String
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let palette = MeltedPalette(scheme)
        VStack(alignment: .leading, spacing: 8) {
            Text(item.title).font(.system(size: MeltedType.row, weight: item.state.read ? .regular : .semibold)).lineLimit(2).foregroundStyle(palette.text)
            Text(item.summary).font(.system(size: MeltedType.control)).foregroundStyle(palette.secondary).lineLimit(2).lineSpacing(3)
            HStack { if !category.isEmpty { CategoryLabel(category) }; Spacer(minLength: 12); Text(item.updatedAt, format: .dateTime.month().day()) }
                .font(.system(size: MeltedType.metadata)).foregroundStyle(palette.secondary)
        }.padding(.vertical, 4).frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityValue(item.state.read ? "已读" : "未读")
    }
}

struct WorkspaceView: View {
    @ObservedObject var model: WorkspaceModel
    @Environment(\.colorScheme) private var scheme
    @Environment(\.openSettings) private var openSettings
    @State private var width: CGFloat = MeltedLayout.initialWidth
    @State private var searchOpen = false
    @State private var contextMenuItem: Briefing?

    private var palette: MeltedPalette { MeltedPalette(scheme) }

    var body: some View {
        Group {
            if model.connected {
                VStack(spacing: 0) {
                    // Improved error banner
                    if let error = model.error {
                        errorBanner(error)
                    }

                    if width >= MeltedLayout.splitMinimum {
                        HSplitView {
                            contentList.frame(minWidth: 280, idealWidth: MeltedLayout.listIdeal, maxWidth: 360)
                            ReaderView(model: model, compact: false).frame(minWidth: 440, maxWidth: .infinity)
                        }
                    } else if model.selectedID != nil {
                        ReaderView(model: model, compact: true)
                    } else { contentList }
                }
            } else { ConnectionView(model: model) }
        }
        .background(palette.surface)
        .foregroundStyle(palette.text)
        .overlay(alignment: .top) {
            if searchOpen {
                ZStack(alignment: .top) {
                    Color.black.opacity(scheme == .dark ? 0.25 : 0.04)
                        .contentShape(Rectangle())
                        .onTapGesture { searchOpen = false }
                        .ignoresSafeArea()
                    SearchPalette(model: model) { searchOpen = false }
                        .frame(width: min(width - 64, 580))
                        .padding(.top, 32)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
                .animation(.spring(response: 0.3, dampingFraction: 0.85), value: searchOpen)
            }
        }
        .background(GeometryReader { proxy in Color.clear.onAppear { width = proxy.size.width }.onChange(of: proxy.size.width) { _, value in width = value } })
        .toolbar { if model.connected { toolbarContent } }
        .toolbarRole(.editor)
        .task(id: model.filter) { if model.connected { await model.reload() } }
        .task(id: model.selectedID) { await model.select() }
        .onChange(of: model.searchRequest) { _, _ in searchOpen = true }
    }

    @ViewBuilder
    private func errorBanner(_ error: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.orange)

            VStack(alignment: .leading, spacing: 2) {
                Text(userFriendlyError(error))
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(palette.text)

                if shouldShowRetry(error) {
                    Text("点击重试以重新连接")
                        .font(.system(size: 11))
                        .foregroundStyle(palette.secondary)
                }
            }

            Spacer()

            if shouldShowRetry(error) {
                Button("重试") {
                    Task { await model.reload() }
                }
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(palette.accent, in: Capsule())
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.orange.opacity(0.08))
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(palette.separator)
                .frame(height: 1)
        }
        .transition(.move(edge: .top).combined(with: .opacity))
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: error)
    }

    private func userFriendlyError(_ error: String) -> String {
        // 将技术性错误转换为用户友好的提示
        if error.contains("同步") || error.contains("钥匙串") {
            return "凭据仅保存在此设备，可继续使用"
        } else if error.contains("连接") || error.contains("网络") {
            return "无法连接服务器"
        } else if error.contains("格式") || error.contains("数据") {
            return "服务器数据格式异常"
        } else {
            return error
        }
    }

    private func shouldShowRetry(_ error: String) -> Bool {
        error.contains("连接") || error.contains("网络") || error.contains("中断")
    }

    private var contentList: some View {
        VStack(spacing: 0) {
            if model.loading && model.items.isEmpty {
                LoadingState("正在载入资讯…")
            } else if model.items.isEmpty {
                EmptyState(
                    icon: model.filter.isFiltered || !model.filter.q.isEmpty ? "magnifyingglass" : "tray",
                    title: model.filter.isFiltered || !model.filter.q.isEmpty ? "没有匹配的内容" : "还没有资讯",
                    description: model.filter.isFiltered || !model.filter.q.isEmpty ? "试试其他搜索词，或调整筛选条件" : "服务器尚未提供整理后的内容"
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders]) {
                        ForEach(groupedItems, id: \.section) { group in
                            Section {
                                ForEach(group.items) { item in
                                    Button {
                                        guard model.selectedID != item.id else { return }
                                        model.selectedID = item.id
                                        if !item.state.read {
                                            Task {
                                                try? await Task.sleep(nanoseconds: 300_000_000)
                                                guard model.selectedID == item.id,
                                                      model.detail?.id == item.id else { return }
                                                await model.updateState(read: true)
                                            }
                                        }
                                    } label: {
                                        ContentRowView(
                                            item: item,
                                            category: model.termName(item.categoryId),
                                            isSelected: model.selectedID == item.id
                                        )
                                    }
                                    .buttonStyle(ContentRowButtonStyle())
                                    .contextMenu {
                                        contextMenuItems(for: item)
                                    }
                                }
                            } header: {
                                sectionHeader(group.section)
                            }
                        }

                        if model.nextCursor != nil {
                            Button {
                                Task { await model.loadMore() }
                            } label: {
                                HStack(spacing: 8) {
                                    if model.loading {
                                        ProgressView()
                                            .controlSize(.small)
                                            .tint(palette.accent)
                                    }
                                    Text("载入更多")
                                        .font(.system(size: 13, weight: .medium))
                                }
                                .foregroundStyle(palette.accent)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                            }
                            .buttonStyle(.plain)
                            .disabled(model.loading)
                            .padding(.top, 12)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 8)
                    .padding(.bottom, 12)
                }

                // Native status bar with visual effect and branding
                HStack(spacing: 12) {
                    // Melted branding
                    HStack(spacing: 6) {
                        MeltedMark()
                            .foregroundStyle(palette.accent)
                            .frame(width: 18, height: 18)
                            .accessibilityHidden(true)
                        Text("Melted")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(palette.text)
                    }

                    Divider()
                        .frame(height: 12)

                    Text("\(model.total) 条")
                        .foregroundStyle(palette.secondary)

                    Spacer()

                    if model.loading {
                        HStack(spacing: 6) {
                            ProgressView()
                                .controlSize(.small)
                            Text("载入中")
                        }
                        .foregroundStyle(palette.secondary)
                        .accessibilityLabel("正在载入")
                    }
                }
                .font(.system(size: 11))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(.regularMaterial)
                .overlay(alignment: .top) {
                    Divider()
                }
            }
        }
        .background(palette.canvas)
    }

    @ViewBuilder
    private func sectionHeader(_ section: TimeSection) -> some View {
        HStack(spacing: 0) {
            Text(section.title)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(palette.text)
                .textCase(.uppercase)
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .background(
                    Capsule()
                        .fill(palette.accent.opacity(0.1))
                )
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(palette.canvas.opacity(0.9))
    }

    private enum TimeSection: String, CaseIterable {
        case today = "今日"
        case yesterday = "昨日"
        case thisWeek = "本周"
        case earlier = "更早"

        var title: String { rawValue }
    }

    private struct GroupedItems {
        let section: TimeSection
        let items: [Briefing]
    }

    private var groupedItems: [GroupedItems] {
        let calendar = Calendar.current
        var groups: [TimeSection: [Briefing]] = [:]

        for item in model.items {
            let section: TimeSection
            if calendar.isDateInToday(item.updatedAt) {
                section = .today
            } else if calendar.isDateInYesterday(item.updatedAt) {
                section = .yesterday
            } else if calendar.isDate(item.updatedAt, equalTo: .now, toGranularity: .weekOfYear) {
                section = .thisWeek
            } else {
                section = .earlier
            }
            groups[section, default: []].append(item)
        }

        return TimeSection.allCases.compactMap { section in
            guard let items = groups[section], !items.isEmpty else { return nil }
            return GroupedItems(section: section, items: items)
        }
    }

    @ViewBuilder
    private func contextMenuItems(for item: Briefing) -> some View {
        Button {
            Task { await model.updateState(read: !item.state.read) }
        } label: {
            Label(item.state.read ? "标为未读" : "标为已读", systemImage: item.state.read ? "circle" : "checkmark.circle.fill")
        }

        Button {
            Task { await model.updateState(saved: !item.state.saved) }
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

    @ToolbarContentBuilder private var toolbarContent: some ToolbarContent {
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
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14, weight: .medium))
                    Text(searchTitle)
                        .font(.system(size: 13, weight: .medium))
                        .lineLimit(1)
                        .frame(minWidth: 90, maxWidth: 200, alignment: .leading)
                    Spacer()
                    Text("⌘F")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(palette.secondary.opacity(0.7))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(palette.canvas.opacity(0.8), in: RoundedRectangle(cornerRadius: 4))
                }
                .foregroundStyle(palette.secondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .frame(height: 36)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .strokeBorder(palette.separator.opacity(0.4), lineWidth: 0.5)
                )
            }
            .buttonStyle(.plain)
            .keyboardShortcut("f", modifiers: .command)
            .accessibilityLabel("搜索与筛选")
            .help("搜索内容、分类、标签或关注主题（⌘F）")
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
