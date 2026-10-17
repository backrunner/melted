// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct PluginSuggestions: View {
    let title: String
    let suggestions: [SettingSuggestion]
    let selected: SettingValue?
    let choose: (SettingSuggestion) -> Void
    @State private var query = ""
    @State private var highlighted: SettingValue?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    private var palette: MeltedPalette { MeltedPalette(scheme) }
    private var filtered: [SettingSuggestion] { suggestions.filter { $0.matches(query) } }
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: MeltedReading.actionGap) {
                Image(systemName: "magnifyingglass").foregroundStyle(palette.secondary).accessibilityHidden(true)
                NativeSearchField(text: $query, focusRequest: 0, focusOnAppear: true, prominent: true,
                                  prompt: "搜索名称、类别或路径", accessibilityTitle: "搜索" + title,
                                  fontSize: MeltedType.control,
                                  onSubmit: { if let match = filtered.first(where: { $0.id == highlighted }) ?? filtered.first { choose(match) } },
                                  onCancel: { dismiss() }, onMove: move)
                    .frame(height: MeltedPanelMetrics.controlHeight)
            }.padding(MeltedPanelMetrics.headerInset)
            Rectangle().fill(palette.separator).frame(height: MeltedPanelMetrics.ruleWidth)
            if filtered.isEmpty {
                VStack(spacing: MeltedReading.listSpacing) {
                    Text("没有匹配的建议").fontWeight(.medium)
                    Text("关闭后可填写自定义值").foregroundStyle(palette.secondary)
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollViewReader { proxy in
                    MeltedScrollView {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            ForEach(Array(filtered.enumerated()), id: \.element.id) { index, suggestion in
                                if index == 0 || filtered[index - 1].group != suggestion.group {
                                    Text(suggestion.group ?? "建议").font(.system(size: MeltedType.metadata, weight: .semibold))
                                        .foregroundStyle(palette.secondary).padding(.horizontal, MeltedReading.blockInset).padding(.top, MeltedReading.paragraphSpacing).padding(.bottom, MeltedReading.listSpacing)
                                }
                                Button { choose(suggestion) } label: {
                                    HStack(alignment: .top, spacing: MeltedReading.actionGap) {
                                        VStack(alignment: .leading, spacing: MeltedPanelMetrics.detailGap) {
                                            Text(suggestion.label).font(.system(size: MeltedType.control, weight: .medium))
                                            Text(suggestion.value.text).font(.system(size: MeltedType.metadata, design: .monospaced)).foregroundStyle(palette.secondary).lineLimit(2)
                                            if let description = suggestion.description { Text(description).font(.system(size: MeltedType.metadata)).foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true) }
                                        }
                                        Spacer(minLength: 0)
                                        if selected == suggestion.value { Image(systemName: "checkmark").foregroundStyle(palette.accent) }
                                    }.padding(MeltedReading.blockInset).frame(maxWidth: .infinity, alignment: .leading)
                                        .background(highlighted == suggestion.id ? palette.selection : Color.clear)
                                        .contentShape(Rectangle())
                                }.buttonStyle(.plain).id(suggestion.id).accessibilityLabel(suggestion.label + "，" + suggestion.value.text)
                            }
                        }
                    }
                    .onChange(of: highlighted) { _, value in if let value { proxy.scrollTo(value) } }
                }
            }
            Rectangle().fill(palette.separator).frame(height: MeltedPanelMetrics.ruleWidth)
            HStack { Text("\(filtered.count) 个建议"); Spacer(); Text("↑↓ 选择  ↵ 使用") }
                .font(.system(size: MeltedType.metadata)).foregroundStyle(palette.secondary).padding(MeltedReading.actionGap)
        }
        .foregroundStyle(palette.text).background(palette.canvas)
        .frame(width: MeltedPanelMetrics.suggestionWidth, height: MeltedPanelMetrics.suggestionHeight)
        .onAppear { highlighted = filtered.first(where: { $0.value == selected })?.id ?? filtered.first?.id }
        .onChange(of: query) { _, _ in highlighted = filtered.first?.id }
    }
    private func move(_ offset: Int) {
        guard !filtered.isEmpty else { return }
        let current = filtered.firstIndex(where: { $0.id == highlighted }) ?? 0
        highlighted = filtered[min(max(current + offset, 0), filtered.count - 1)].id
    }
}
