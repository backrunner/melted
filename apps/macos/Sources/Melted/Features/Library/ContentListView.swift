// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct ContentListView: View {
    @ObservedObject var model: WorkspaceModel
    @Environment(\.colorScheme) private var scheme
    private var palette: MeltedPalette { MeltedPalette(scheme) }
    var body: some View {
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
                                    } label: {
                                        ContentRowView(
                                            item: item,
                                            category: model.termName(item.categoryId),
                                            isSelected: model.selectedID == item.id
                                        )
                                    }
                                    .buttonStyle(ContentRowButtonStyle())
                                    .contextMenu {
                                        ContentRowActions(model: model, item: item)
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

                LibraryStatusBar(total: model.total, loading: model.loading)
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

}
