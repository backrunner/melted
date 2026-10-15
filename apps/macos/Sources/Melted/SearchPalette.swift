import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct SearchPalette: View {
    @ObservedObject var model: WorkspaceModel
    let close: () -> Void
    @Environment(\.colorScheme) private var scheme
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
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Search input - larger and more prominent
            HStack(spacing: 12) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 18, weight: .medium))
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
                .frame(height: 36)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 18)

            // Selected filters with improved chip design
            if !selected.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(selected) { term in
                            Button {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) {
                                    model.toggle(term.id, kind: term.kind)
                                }
                                focusRequest += 1
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: iconForKind(term.kind))
                                        .font(.system(size: 10, weight: .semibold))
                                    Text(term.name)
                                        .font(.system(size: 12, weight: .medium))
                                    Image(systemName: "xmark.circle.fill")
                                        .font(.system(size: 13))
                                        .foregroundStyle(palette.accent.opacity(0.7))
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(
                                    Capsule()
                                        .fill(palette.accent.opacity(0.12))
                                )
                                .overlay(
                                    Capsule()
                                        .strokeBorder(palette.accent.opacity(0.3), lineWidth: 1)
                                )
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(palette.accent)
                            .accessibilityLabel("移除\(kindName(term.kind))：\(term.name)")
                        }
                    }
                    .padding(.horizontal, 20)
                }
                .padding(.bottom, 14)
            }

            Divider()
                .background(palette.separator)

            // Suggestions with improved visual hierarchy
            if !suggestions.isEmpty {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(spacing: 2) {
                            ForEach(Array(suggestions.enumerated()), id: \.element.id) { index, term in
                                Button { choose(term) } label: {
                                    HStack(spacing: 12) {
                                        // Icon with background
                                        ZStack {
                                            Circle()
                                                .fill(highlighted == index ? palette.accent.opacity(0.15) : palette.surface)
                                                .frame(width: 28, height: 28)
                                            Image(systemName: iconForKind(term.kind))
                                                .font(.system(size: 13, weight: .medium))
                                                .foregroundStyle(highlighted == index ? palette.accent : palette.secondary)
                                        }

                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(term.name)
                                                .font(.system(size: 13, weight: .medium))
                                                .foregroundStyle(palette.text)

                                            Text(kindName(term.kind))
                                                .font(.system(size: 11))
                                                .foregroundStyle(palette.secondary)
                                        }

                                        Spacer()

                                        if model.selectedTerms(term.kind).contains(term.id) {
                                            Image(systemName: "checkmark.circle.fill")
                                                .font(.system(size: 16))
                                                .foregroundStyle(palette.accent)
                                        }
                                    }
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 10)
                                    .background(
                                        RoundedRectangle(cornerRadius: 8)
                                            .fill(highlighted == index ? palette.surface.opacity(0.5) : .clear)
                                    )
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .id(term.id)
                                .accessibilityLabel("\(kindName(term.kind))：\(term.name)")
                                .accessibilityValue(model.selectedTerms(term.kind).contains(term.id) ? "已选择" : "未选择")
                                .onHover { if $0 { highlighted = index } }
                            }
                        }
                        .padding(8)
                    }
                    .frame(maxHeight: min(CGFloat(suggestions.count) * 50 + 16, 260))
                    .onChange(of: highlighted) { _, value in
                        if let value, suggestions.indices.contains(value) { proxy.scrollTo(suggestions[value].id) }
                    }
                }
            } else if query.kind != nil {
                VStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 32))
                        .foregroundStyle(palette.secondary.opacity(0.4))
                    Text("没有匹配的筛选项")
                        .font(.system(size: 13))
                        .foregroundStyle(palette.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 32)
            }

            Divider()
                .background(palette.separator)

            // Footer with improved actions
            HStack(spacing: 12) {
                HStack(spacing: 6) {
                    if model.loading {
                        ProgressView()
                            .controlSize(.small)
                            .tint(palette.accent)
                    }
                    Text(model.loading ? "正在搜索…" : "\(model.total) 条结果")
                        .font(.system(size: 12))
                        .foregroundStyle(palette.secondary)
                }

                if model.filter.isFiltered || !input.isEmpty {
                    Button("清除") {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) {
                            model.filter = .init()
                            input = ""
                        }
                        focusRequest += 1
                    }
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(palette.accent)
                    .buttonStyle(.plain)
                }

                Spacer()

                Button {
                    close()
                } label: {
                    Text("完成")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 7)
                        .background(palette.accent, in: RoundedRectangle(cornerRadius: 7))
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.return, modifiers: [])
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .foregroundStyle(palette.text)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(palette.separator.opacity(0.4), lineWidth: 0.5)
        )
        .shadow(color: .black.opacity(scheme == .dark ? 0.5 : 0.12), radius: 28, y: 14)
        .onChange(of: input) { _, value in model.filter.q = query.kind == nil ? value : ""; highlighted = nil }
        .onExitCommand(perform: close)
        .accessibilityAddTraits(.isModal)
    }

    private func iconForKind(_ kind: String) -> String {
        switch kind {
        case "category": return "folder"
        case "tag": return "tag"
        case "subject": return "star"
        default: return "circle"
        }
    }
    private func kindName(_ kind: String) -> String { kinds.first { $0.0 == kind }?.1 ?? "筛选" }
    private func choose(_ term: Term) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) {
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
