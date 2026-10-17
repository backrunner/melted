// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

/// Suggestions are server data; every field remains an ordinary native control.
struct PluginFields: View {
    let form: PluginForm
    @Binding var values: PluginConfiguration
    var onSuggestion: (SettingSuggestion) -> Void = { _ in }
    var body: some View {
        VStack(alignment: .leading, spacing: MeltedPanelMetrics.fieldGap) {
            ForEach(form.fields) { field in
                PluginFieldControl(field: field, value: Binding(get: { values[field.id] }, set: { values[field.id] = $0 }), onSuggestion: onSuggestion)
            }
        }
    }
}
private struct PluginFieldControl: View {
    let field: PluginField
    @Binding var value: SettingValue?
    let onSuggestion: (SettingSuggestion) -> Void
    @FocusState private var focused: Bool
    @State private var choosing = false
    @State private var customNumber = false
    @Environment(\.colorScheme) private var scheme
    private var palette: MeltedPalette { MeltedPalette(scheme) }
    private var suggestions: [SettingSuggestion] { field.suggestions ?? [] }
    var body: some View {
        VStack(alignment: .leading, spacing: MeltedPanelMetrics.detailGap) {
            control
            if let help = field.help {
                Text(help).font(.system(size: MeltedType.metadata)).foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
    @ViewBuilder private var control: some View {
        switch field.type {
        case "text":
            MeltedField(field.label, isFocused: focused, height: MeltedConnection.controlHeight) {
                HStack(spacing: MeltedReading.actionGap) {
                    TextField(field.placeholder ?? "", text: Binding(get: { value?.text ?? "" }, set: { value = .string($0) }))
                        .font(.system(size: MeltedType.control, design: field.monospaced == true ? .monospaced : .default))
                        .autocorrectionDisabled(field.format == "url")
                        .focused($focused).accessibilityLabel(field.label)
                    if !suggestions.isEmpty {
                        Button { choosing = true } label: { Label("选择", systemImage: "list.bullet") }
                            .buttonStyle(.plain).foregroundStyle(palette.accent).fixedSize().accessibilityLabel("选择\(field.label)")
                    }
                }
            }.popover(isPresented: $choosing, arrowEdge: .top) {
                PluginSuggestions(title: field.label, suggestions: suggestions, selected: value) { suggestion in
                    value = suggestion.value; onSuggestion(suggestion); choosing = false
                }
            }
        case "integer":
            VStack(alignment: .leading, spacing: MeltedPanelMetrics.detailGap) {
                if !suggestions.isEmpty {
                    Text(field.label).font(.system(size: MeltedType.control, weight: .medium)).foregroundStyle(palette.secondary)
                    Menu {
                        ForEach(suggestions) { suggestion in
                            Button(suggestion.label) { value = suggestion.value; customNumber = false }
                        }
                        Divider()
                        Button("自定义") { customNumber = true }
                    } label: {
                        Text(customNumber ? "自定义" : suggestions.first(where: { $0.value == value })?.label ?? "自定义")
                    }.menuStyle(.borderlessButton).modifier(MeltedMenuChrome()).accessibilityLabel(field.label)
                }
                if customNumber || !suggestions.contains(where: { $0.value == value }) {
                    MeltedField(suggestions.isEmpty ? field.label : "自定义\(field.label)", isFocused: focused, height: MeltedConnection.controlHeight) {
                        HStack {
                            TextField("", text: Binding(get: { value?.text ?? "" }, set: { value = Double($0).map(SettingValue.number) ?? .string($0) })).focused($focused).accessibilityLabel(field.label)
                            if let unit = field.unit { Text(unit).foregroundStyle(palette.secondary) }
                        }
                    }
                }
            }
        case "boolean":
            Toggle(field.label, isOn: Binding(get: { value?.bool ?? false }, set: { value = .boolean($0) }))
                .toggleStyle(MeltedCheckboxStyle()).font(.system(size: MeltedType.control))
        case "select":
            VStack(alignment: .leading, spacing: MeltedPanelMetrics.detailGap) {
                Text(field.label).font(.system(size: MeltedType.control, weight: .medium)).foregroundStyle(palette.secondary)
                Menu {
                    ForEach(field.options ?? [], id: \.value) { option in
                        Button(option.label) { value = .string(option.value) }
                    }
                } label: {
                    Text(field.options?.first(where: { $0.value == value?.text })?.label ?? "请选择")
                }.menuStyle(.borderlessButton).modifier(MeltedMenuChrome()).accessibilityLabel(field.label)
            }
        default: Text("此字段需要更新客户端").foregroundStyle(palette.secondary)
        }
    }
}
