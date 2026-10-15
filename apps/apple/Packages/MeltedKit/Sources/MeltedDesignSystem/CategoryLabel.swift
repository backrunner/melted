import SwiftUI

/// A category is a single, refined label with subtle styling and hover effect
public struct CategoryLabel: View {
    private let title: String
    private let isSelected: Bool

    @Environment(\.colorScheme) private var scheme
    @State private var isHovered = false
    @State private var isPressed = false

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
                    .fill(backgroundColor(palette))
            )
            .overlay(
                Capsule()
                    .strokeBorder(
                        borderColor(palette),
                        lineWidth: isSelected ? 1 : 0.5
                    )
            )
            .scaleEffect(isPressed ? 0.96 : (isHovered ? 1.04 : 1.0))
            .animation(.spring(response: 0.22, dampingFraction: 0.75), value: isHovered)
            .animation(.spring(response: 0.18, dampingFraction: 0.8), value: isPressed)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: isSelected)
            .onHover { isHovered = $0 }
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in isPressed = true }
                    .onEnded { _ in isPressed = false }
            )
            .accessibilityLabel("分类：\(title)")
            .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    private func backgroundColor(_ palette: MeltedPalette) -> Color {
        if isSelected {
            return palette.accent.opacity(0.15)
        } else if isHovered {
            return palette.selection.opacity(0.95)
        } else {
            return palette.selection
        }
    }

    private func borderColor(_ palette: MeltedPalette) -> Color {
        if isSelected {
            return palette.accent.opacity(0.4)
        } else if isHovered {
            return palette.separator
        } else {
            return palette.separator.opacity(0.5)
        }
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
