// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct SourceSuggestionSelection: View {
    let choices: [SettingSuggestion]
    let maximum: Int
    let existing: Set<SettingValue>
    @Binding var selected: Set<SettingValue>
    let drafts: [SettingValue: SourceBatchDraft]
    let saved: Set<String>
    let errors: [String: String]
    @State private var query = ""
    @FocusState private var searchFocused: Bool
    @Environment(\.colorScheme) private var scheme
    private var palette: MeltedPalette { MeltedPalette(scheme) }
    private var visible: [SettingSuggestion] { choices.filter { $0.matches(query) } }

    var body: some View {
        VStack(alignment: .leading, spacing: MeltedReading.actionGap) {
            MeltedField("查找来源", isFocused: searchFocused, height: MeltedConnection.controlHeight) {
                HStack(spacing: MeltedReading.actionGap) {
                    Image(systemName: "magnifyingglass").foregroundStyle(palette.secondary)
                    TextField("搜索名称、类别或路径", text: $query)
                        .font(.system(size: MeltedType.control)).focused($searchFocused)
                        .accessibilityLabel("搜索可添加订阅")
                }
            }
            if visible.isEmpty { Text("没有匹配的来源").foregroundStyle(palette.secondary) }
            ForEach(Array(visible.enumerated()), id: \.element.id) { index, choice in
                if index == 0 || visible[index - 1].group != choice.group {
                    Text(choice.group ?? "来源").font(.system(size: MeltedType.metadata, weight: .medium))
                        .foregroundStyle(palette.secondary).padding(.top, MeltedReading.actionGap)
                }
                let draft = drafts[choice.value]
                let added = draft.map { saved.contains($0.id) } ?? false
                VStack(alignment: .leading, spacing: MeltedPanelMetrics.detailGap) {
                    HStack(alignment: .top) {
                        Toggle(isOn: Binding(get: { selected.contains(choice.value) }, set: { value in
                            if value { selected.insert(choice.value) } else { selected.remove(choice.value) }
                        })) {
                            VStack(alignment: .leading, spacing: MeltedPanelMetrics.detailGap) {
                                Text(choice.label).font(.system(size: MeltedType.control, weight: .medium))
                                Text(choice.value.text).font(.system(size: MeltedType.metadata))
                                    .foregroundStyle(palette.secondary).lineLimit(1).help(choice.value.text)
                            }
                        }.toggleStyle(MeltedCheckboxStyle())
                            .disabled(!drafts.isEmpty || existing.contains(choice.value) || (!selected.contains(choice.value) && selected.count >= maximum))
                        Spacer(minLength: 0)
                        if added { Text("已添加").foregroundStyle(palette.secondary) }
                        else if existing.contains(choice.value) { Text("已订阅").foregroundStyle(palette.secondary) }
                    }
                    if let draft, let error = errors[draft.id] { Text(error).foregroundStyle(palette.warning) }
                }.font(.system(size: MeltedType.metadata)).padding(.vertical, MeltedReading.actionGap)
                Rectangle().fill(palette.separator).frame(height: MeltedPanelMetrics.ruleWidth)
            }
        }
    }
}
