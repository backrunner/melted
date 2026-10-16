// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation
import Markdown
import SwiftUI
import MeltedDesignSystem

public enum SafeLinks {
    public static func url(_ value: String?) -> URL? {
        guard let value, let url = URL(string: value), let scheme = url.scheme?.lowercased(),
              ["http", "https"].contains(scheme), url.host != nil, url.user == nil, url.password == nil else { return nil }
        return url
    }
}

/// Render a parsed Markdown tree using native text. HTML and remote images never execute or load.
public struct ReadingMarkdown: View {
    private let document: Markdown.Document
    private let scale: CGFloat
    @Environment(\.colorScheme) private var scheme
    public init(_ markdown: String, scale: CGFloat = 1) {
        document = Markdown.Document(parsing: markdown)
        self.scale = scale
    }
    public var body: some View {
        blocks(document)
        .font(.system(size: MeltedType.reading * scale))
        .foregroundStyle(MeltedPalette(scheme).text)
        .textSelection(.enabled)
        .tint(MeltedPalette(scheme).accent)
        .lineSpacing(MeltedReading.lineSpacing * scale)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Space belongs to the relationship between blocks, not to every block equally.
    /// A heading stays with its following paragraph; nested lists keep a tighter rhythm.
    private func blocks(_ parent: any Markup, nested: Bool = false) -> some View {
        let nodes = Array(parent.children)
        return VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(nodes.enumerated()), id: \.offset) { index, node in
                block(node).padding(.top, blockSpacing(nodes, index: index, nested: nested))
            }
        }
    }

    private func blockSpacing(_ nodes: [any Markup], index: Int, nested: Bool) -> CGFloat {
        guard index > 0 else { return 0 }
        if nodes[index] is Heading { return MeltedReading.headingSpacing * scale }
        if nodes[index - 1] is Heading { return MeltedReading.headingBodySpacing * scale }
        return (nested ? MeltedReading.headingBodySpacing : MeltedReading.paragraphSpacing) * scale
    }

    private func block(_ node: any Markup) -> AnyView {
        let palette = MeltedPalette(scheme)
        if let heading = node as? Heading {
            let size = heading.level == 1 ? MeltedType.title : heading.level == 2 ? MeltedType.section : MeltedType.reading
            let weight: Font.Weight = heading.level <= 2 ? .semibold : .medium
            return AnyView(SwiftUI.Text(inline(heading, size: size, weight: weight))
                .lineSpacing(heading.level <= 2 ? MeltedReading.titleLineSpacing * scale : MeltedReading.lineSpacing * scale)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader))
        }
        if let paragraph = node as? Paragraph { return AnyView(SwiftUI.Text(inline(paragraph)).fixedSize(horizontal: false, vertical: true)) }
        if let code = node as? CodeBlock {
            return AnyView(ReadingCodeBlock(source: code.code, info: code.language, scale: scale))
        }
        if node is BlockQuote {
            return AnyView(HStack(alignment: .top, spacing: 0) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(palette.accent.opacity(0.5))
                    .frame(width: 3.5)
                Spacer()
                    .frame(width: 14)
                blocks(node, nested: true)
                    .foregroundStyle(palette.secondary)
            }
            .fixedSize(horizontal: false, vertical: true))
        }
        if node is UnorderedList || node is OrderedList {
            let start = (node as? OrderedList).map { Int($0.startIndex) }
            return AnyView(VStack(alignment: .leading, spacing: MeltedReading.listSpacing * scale) {
                ForEach(Array(node.children.enumerated()), id: \.offset) { index, item in
                    HStack(alignment: .firstTextBaseline, spacing: 10 * scale) {
                        if let item = item as? ListItem, let check = item.checkbox {
                            SwiftUI.Text(Image(systemName: check == .checked ? "checkmark.circle.fill" : "circle"))
                                .font(.system(size: 14 * scale, weight: .medium))
                                .foregroundStyle(check == .checked ? palette.accent : palette.secondary)
                                .frame(width: 18 * scale, alignment: .leading)
                                .accessibilityLabel(check == .checked ? "已完成" : "未完成")
                        } else {
                            SwiftUI.Text(start.map { "\($0 + index)." } ?? "•")
                                .font(.system(size: MeltedType.reading * scale, weight: .medium))
                                .foregroundStyle(palette.secondary)
                                .frame(minWidth: 18 * scale, alignment: .leading)
                                .accessibilityHidden(start == nil)
                        }
                        blocks(item, nested: true)
                    }
                    .accessibilityElement(children: .combine)
                }
            })
        }
        if let table = node as? Markdown.Table {
            return AnyView(ScrollView(.horizontal, showsIndicators: true) {
                Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
                    GridRow {
                        ForEach(Array(table.head.children.enumerated()), id: \.offset) { index, cell in
                            tableCell(cell, table: table, column: index, header: true)
                        }
                    }
                    ForEach(Array(table.body.children.enumerated()), id: \.offset) { rowIndex, row in
                        Divider()
                            .background(palette.separator.opacity(0.5))
                            .gridCellUnsizedAxes(.horizontal)
                        GridRow {
                            ForEach(Array(row.children.enumerated()), id: \.offset) { index, cell in
                                tableCell(cell, table: table, column: index, header: false)
                                    .background(rowIndex % 2 == 1 ? palette.selection.opacity(0.3) : .clear)
                            }
                        }
                    }
                }
                .fixedSize(horizontal: true, vertical: true)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(palette.separator.opacity(0.4), lineWidth: 0.5)
                )
            }
            .scrollBounceBehavior(.basedOnSize))
        }
        if node is ThematicBreak {
            return AnyView(
                Rectangle()
                    .fill(palette.separator.opacity(0.4))
                    .frame(height: 1)
                    .frame(maxWidth: 160)
                    .padding(.vertical, 12)
            )
        }
        if node is HTMLBlock { return AnyView(EmptyView()) }
        return AnyView(blocks(node, nested: true))
    }

    private func tableCell(_ cell: any Markup, table: Markdown.Table, column: Int, header: Bool) -> some View {
        let alignment: HorizontalAlignment
        switch column < table.columnAlignments.count ? table.columnAlignments[column] : nil {
        case .center: alignment = .center
        case .right: alignment = .trailing
        default: alignment = .leading
        }
        let palette = MeltedPalette(scheme)
        return SwiftUI.Text(inline(cell, size: 13, weight: header ? .semibold : .regular))
            .fixedSize(horizontal: true, vertical: true)
            .frame(maxWidth: .infinity, alignment: Alignment(horizontal: alignment, vertical: .center))
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(header ? palette.canvas : .clear)
            .gridColumnAlignment(alignment)
            .accessibilityAddTraits(header ? .isHeader : [])
    }

    private func inline(_ node: any Markup, size: CGFloat = MeltedType.reading, weight: Font.Weight = .regular, italic: Bool = false) -> AttributedString {
        if node is InlineHTML { return AttributedString() }
        let weight: Font.Weight = node is Strong ? .semibold : weight
        let italic = italic || node is Emphasis
        var result: AttributedString
        if let text = node as? Markdown.Text { result = AttributedString(text.string) }
        else if let code = node as? InlineCode { result = AttributedString(code.code) }
        else if node is SoftBreak { result = AttributedString(" ") }
        else if node is LineBreak { result = AttributedString("\n") }
        else if let image = node as? Markdown.Image { result = AttributedString("[图片：\(image.plainText)]") }
        else {
            result = node.children.reduce(into: AttributedString()) { $0 += inline($1, size: size, weight: weight, italic: italic) }
        }
        if node.childCount == 0 || node is Markdown.Image {
            let font = Font.system(size: (node is InlineCode ? max(MeltedCode.inlineSize, size * 0.875) : size) * scale, weight: weight, design: node is InlineCode ? .monospaced : .default)
            result.font = italic ? font.italic() : font
            if node is InlineCode {
                result.foregroundColor = MeltedPalette(scheme).accent
                result.backgroundColor = MeltedPalette(scheme).selection
            }
        }
        if node is Strikethrough { result.strikethroughStyle = .single }
        if let link = node as? Markdown.Link, let url = SafeLinks.url(link.destination) {
            result.link = url
            result.underlineStyle = .single
        }
        return result
    }
}
