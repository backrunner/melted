// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct SearchPalette: View {
    @ObservedObject var model: WorkspaceModel
    let close: () -> Void
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var input: String
    @State private var highlighted: Int?
    @State private var focusRequest = 0

    init(model: WorkspaceModel, close: @escaping () -> Void) {
        self.model = model; self.close = close
        _input = State(initialValue: model.filter.q)
    }
    private var palette: MeltedPalette { MeltedPalette(scheme) }
    private let kinds = [("category", "分类"), ("tag", "标签"), ("subject", "关注")]
    private var query: (kind: String?, text: String) {
        let parts = input.replacingOccurrences(of: "：", with: ":").split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
        if parts.count == 2, let kind = kinds.first(where: { $0.1 == parts[0].trimmingCharacters(in: .whitespaces) }) {
            return (kind.0, parts[1].trimmingCharacters(in: .whitespaces))
        }
        return (nil, input.trimmingCharacters(in: .whitespacesAndNewlines))
    }
    private var suggestions: [Term] {
        kinds.flatMap { kind, _ in model.terms.filter {
            $0.kind == kind && (query.kind == nil || query.kind == kind) && (query.text.isEmpty || $0.name.localizedCaseInsensitiveContains(query.text))
        } }
    }
    private var selected: [Term] { model.terms.filter { model.selectedTerms($0.kind).contains($0.id) } }
    private var hasCriteria: Bool { !input.isEmpty || !selected.isEmpty }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(palette.secondary)
                    .accessibilityHidden(true)
                NativeSearchField(
                    text: $input,
                    focusRequest: focusRequest,
                    focusOnAppear: true,
                    prominent: true,
                    onSubmit: submit,
                    onCancel: close,
                    onMove: move
                )
                .frame(height: 34)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)

            if !selected.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(selected) { term in chip(term) }
                    }
                    .padding(.horizontal, 18)
                }
                .padding(.bottom, 12)
                .transition(.opacity)
            }

            if !suggestions.isEmpty {
                Rectangle().fill(palette.separator).frame(height: 1)
                ScrollViewReader { proxy in
                    MeltedScrollView {
                        VStack(alignment: .leading, spacing: 1) {
                            ForEach(Array(suggestions.enumerated()), id: \.element.id) { index, term in
                                // A group heading names the kind once instead of repeating it on every row.
                                if index == 0 || suggestions[index - 1].kind != term.kind {
                                    Text(kindName(term.kind))
                                        .font(.system(size: MeltedType.metadata, weight: .semibold))
                                        .foregroundStyle(palette.secondary)
                                        .padding(.horizontal, 10)
                                        .padding(.top, index == 0 ? 4 : 12)
                                        .padding(.bottom, 4)
                                        .accessibilityAddTraits(.isHeader)
                                }
                                suggestionRow(term, index: index).id(term.id)
                            }
                        }
                        .padding(8)
                    }
                    .frame(maxHeight: 280)
                    .fixedSize(horizontal: false, vertical: true)
                    .onChange(of: highlighted) { _, value in
                        if let value, suggestions.indices.contains(value) { proxy.scrollTo(suggestions[value].id) }
                    }
                }
            } else if let kind = query.kind {
                Rectangle().fill(palette.separator).frame(height: 1)
                Text("没有匹配的\(kindName(kind))")
                    .font(.system(size: MeltedType.control))
                    .foregroundStyle(palette.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
            }

            Rectangle().fill(palette.separator).frame(height: 1)
            HStack(spacing: 12) {
                if model.loading {
                    ProgressView().controlSize(.small)
                }
                Text(model.loading ? "正在搜索…" : "\(model.total) 条结果")
                    .font(.system(size: MeltedType.metadata))
                    .foregroundStyle(palette.secondary)
                    .monospacedDigit()
                if hasCriteria {
                    Button("清除") {
                        withAnimation(reduceMotion ? nil : MeltedMotion.content) {
                            model.filter.q = ""; model.filter.categoryIds = []; model.filter.tagIds = []; model.filter.subjectIds = []
                            input = ""
                        }
                        focusRequest += 1
                    }
                    .buttonStyle(.plain)
                    .font(.system(size: MeltedType.metadata, weight: .medium))
                    .foregroundStyle(palette.accent)
                }
                Spacer()
                Button("完成", action: close)
                    .buttonStyle(MeltedPrimaryButtonStyle())
                    .frame(height: 28)
                    .keyboardShortcut(.return, modifiers: [])
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 10)
        }
        .foregroundStyle(palette.text)
        .background(.regularMaterial, in: shape)
        .overlay { shape.strokeBorder(palette.separator, lineWidth: 1) }
        .shadow(color: .black.opacity(scheme == .dark ? 0.45 : 0.10), radius: 24, y: 12)
        .animation(reduceMotion ? nil : MeltedMotion.content, value: selected.map(\.id))
        .onChange(of: input) { _, value in model.filter.q = query.kind == nil ? value : ""; highlighted = nil }
        .onExitCommand(perform: close)
        .accessibilityAddTraits(.isModal)
    }

    private func chip(_ term: Term) -> some View {
        Button {
            withAnimation(reduceMotion ? nil : MeltedMotion.content) { model.toggle(term.id, kind: term.kind) }
            focusRequest += 1
        } label: {
            HStack(spacing: 5) {
                Text(term.name)
                Image(systemName: "xmark")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(palette.secondary)
            }
            .font(.system(size: MeltedType.metadata, weight: .medium))
            .foregroundStyle(palette.text)
            .padding(.leading, 10)
            .padding(.trailing, 8)
            .frame(height: 24)
            .background(palette.selection, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .help("移除\(kindName(term.kind))：\(term.name)")
        .accessibilityLabel("移除\(kindName(term.kind))：\(term.name)")
    }

    private func suggestionRow(_ term: Term, index: Int) -> some View {
        let isOn = model.selectedTerms(term.kind).contains(term.id)
        return Button { choose(term) } label: {
            HStack(spacing: 10) {
                Text(term.name)
                    .font(.system(size: MeltedType.control, weight: isOn ? .semibold : .regular))
                    .foregroundStyle(palette.text)
                Spacer(minLength: 8)
                if isOn {
                    Image(systemName: "checkmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(palette.accent)
                }
            }
            .padding(.horizontal, 10)
            .frame(height: 32)
            .background(highlighted == index ? palette.selection : .clear, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { if $0 { highlighted = index } }
        .accessibilityLabel("\(kindName(term.kind))：\(term.name)")
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }

    private func kindName(_ kind: String) -> String { kinds.first { $0.0 == kind }?.1 ?? "筛选" }
    private func choose(_ term: Term) {
        withAnimation(reduceMotion ? nil : MeltedMotion.content) {
            model.toggle(term.id, kind: term.kind)
        }
        input = ""; model.filter.q = ""; highlighted = nil; focusRequest += 1
    }
    private func submit() {
        if let highlighted, suggestions.indices.contains(highlighted) { choose(suggestions[highlighted]) }
        else if query.kind != nil, suggestions.count == 1 { choose(suggestions[0]) }
        else { close() }
    }
    private func move(_ amount: Int) {
        guard !suggestions.isEmpty else { return }
        highlighted = max(0, min(suggestions.count - 1, (highlighted ?? (amount > 0 ? -1 : suggestions.count)) + amount))
    }
}
