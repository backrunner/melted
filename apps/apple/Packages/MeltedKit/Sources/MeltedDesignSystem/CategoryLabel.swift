// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// A passive label; the enclosing row owns selection and pointer feedback.
public struct CategoryLabel: View {
    private let title: String
    private let isSelected: Bool

    @Environment(\.colorScheme) private var scheme

    public init(_ title: String, isSelected: Bool = false) {
        self.title = title
        self.isSelected = isSelected
    }

    public var body: some View {
        let palette = MeltedPalette(scheme)
        Text(title)
            .font(.system(size: MeltedType.metadata, weight: isSelected ? .semibold : .medium))
            .foregroundStyle(isSelected ? palette.accent : palette.secondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                Capsule()
                    .fill(isSelected ? palette.accent.opacity(0.15) : palette.selection)
            )
            .overlay(
                Capsule()
                    .strokeBorder(
                        isSelected ? palette.accent.opacity(0.4) : palette.separator.opacity(0.5),
                        lineWidth: isSelected ? 1 : 0.5
                    )
            )
            .accessibilityLabel("分类：\(title)")
            .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

}

public struct WrappingLayout: Layout {
    public var spacing: CGFloat
    public init(spacing: CGFloat = 8) { self.spacing = spacing }
    public func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(width: proposal.width ?? .infinity, subviews: subviews).size
    }
    public func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let layout = arrange(width: bounds.width, subviews: subviews)
        for (index, position) in layout.positions.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y), proposal: ProposedViewSize(width: bounds.width, height: nil))
        }
    }
    private func arrange(width: CGFloat, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, widest: CGFloat = 0
        var positions: [CGPoint] = []
        for view in subviews {
            let size = view.sizeThatFits(ProposedViewSize(width: width, height: nil))
            if x > 0 && x + size.width > width { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            positions.append(CGPoint(x: x, y: y))
            widest = max(widest, x + size.width)
            x += size.width + spacing; rowHeight = max(rowHeight, size.height)
        }
        return (CGSize(width: widest, height: y + rowHeight), positions)
    }
}
