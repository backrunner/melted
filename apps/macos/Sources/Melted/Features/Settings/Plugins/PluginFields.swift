// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore

/// A finite native control vocabulary. Descriptors cannot provide URLs, code or HTML.
struct PluginFields: View {
    let form: PluginForm
    @Binding var values: PluginConfiguration
    var body: some View {
        ForEach(form.fields) { field in
            VStack(alignment: .leading, spacing: 6) {
                control(field)
                if let help = field.help { Text(help).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true) }
            }
        }
    }
    @ViewBuilder private func control(_ field: PluginField) -> some View {
        switch field.type {
        case "text":
            TextField(field.label, text: Binding(get: { values[field.id]?.text ?? "" }, set: { values[field.id] = .string($0) }), prompt: Text(field.placeholder ?? ""))
        case "integer":
            LabeledContent(field.label) {
                HStack {
                    TextField(field.label, text: Binding(get: { values[field.id]?.text ?? "" }, set: { values[field.id] = Double($0).map(SettingValue.number) ?? .string($0) }))
                        .labelsHidden()
                        .multilineTextAlignment(.trailing).frame(minWidth: 90, maxWidth: 140)
                        .accessibilityLabel(field.label)
                    if let unit = field.unit { Text(unit).foregroundStyle(.secondary) }
                }
            }
        case "boolean":
            Toggle(field.label, isOn: Binding(get: { values[field.id]?.bool ?? false }, set: { values[field.id] = .boolean($0) }))
        case "select":
            Picker(field.label, selection: Binding(get: { values[field.id]?.text ?? "" }, set: { values[field.id] = .string($0) })) {
                Text("请选择").tag("")
                ForEach(field.options ?? [], id: \.value) { Text($0.label).tag($0.value) }
            }
        default:
            Text("此字段需要更新客户端").foregroundStyle(.secondary)
        }
    }
}
