// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct ContentListView: View {
    @ObservedObject var model: WorkspaceModel
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var palette: MeltedPalette { MeltedPalette(scheme) }
    var body: some View {
        VStack(spacing: 0) {
            if model.loading && model.items.isEmpty {
                LoadingState("正在载入资讯…")
            } else if model.items.isEmpty {
                emptyState
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 2, pinnedViews: [.sectionHeaders]) {
                        ForEach(groupedItems, id: \.section) { group in
                            Section {
                                ForEach(group.items) { item in
                                    Button {
                                        guard model.selectedID != item.id else { return }
                                        model.selectedID = item.id
                                    } label: {
                                        ContentRowView(
                                            item: item,
                                            category: model.termName(item.categoryId),
                                            isSelected: model.selectedID == item.id
                                        )
                                    }
                                    .buttonStyle(ContentRowButtonStyle())
                                    .focusEffectDisabled()
                                    // A row delivered by the latest sync is highlighted until it settles.
                                    .meltedArrivalHighlight(model.isArrived(item.id))
                                    .contextMenu {
                                        ContentRowActions(model: model, item: item)
                                    }
                                    .padding(.horizontal, 10)
                                    .transition(.meltedArrival)
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
                    .padding(.bottom, 12)
                    // Rows arriving from a refresh slide in from the top instead of popping.
                    .animation(reduceMotion ? nil : MeltedMotion.content, value: model.items.map(\.id))
                }
                // Keep rows from drawing under the transparent title bar; the pinned header is the top edge.
                .clipped()

                LibraryStatusBar(total: model.total, loading: model.loading)
            }
        }
        .background(palette.canvas)
    }

    @ViewBuilder
    private var emptyState: some View {
        let searching = !model.filter.q.isEmpty || !model.filter.categoryIds.isEmpty || !model.filter.tagIds.isEmpty || !model.filter.subjectIds.isEmpty
        switch (searching, model.filter.view) {
        case (true, _):
            EmptyState(icon: "line.3.horizontal.decrease", title: "没有匹配的内容", description: "换个关键词，或减少筛选条件",
                       action: { model.filter.q = ""; model.filter.categoryIds = []; model.filter.tagIds = []; model.filter.subjectIds = [] }, actionLabel: "清除搜索与筛选")
        case (false, "unread"):
            EmptyState(icon: "checkmark", title: "没有未读内容", description: "切换到“全部”查看已读内容")
        case (false, "saved"):
            EmptyState(icon: "bookmark", title: "还没有收藏", description: "打开内容后点击“收藏”")
        default:
            EmptyState(icon: "tray", title: "还没有资讯", description: "按 ⌘R 刷新列表")
        }
    }

    /// Opaque and full-width so rows never show through around or behind it while pinned.
    private func sectionHeader(_ section: TimeSection) -> some View {
        Text(section.title)
            .font(.system(size: MeltedType.metadata, weight: .semibold))
            .foregroundStyle(palette.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 26)
            .padding(.top, 12)
            .padding(.bottom, 6)
            .background(palette.canvas)
            .accessibilityAddTraits(.isHeader)
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

}
