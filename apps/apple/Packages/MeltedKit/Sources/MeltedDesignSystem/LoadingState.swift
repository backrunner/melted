import SwiftUI

/// A centered loading indicator with optional message and elegant animation
public struct LoadingState: View {
    private let message: String?

    @Environment(\.colorScheme) private var scheme
    @State private var rotation: Double = 0

    public init(_ message: String? = nil) {
        self.message = message
    }

    public var body: some View {
        let palette = MeltedPalette(scheme)
        VStack(spacing: 20) {
            // Custom animated loader with gradient
            ZStack {
                Circle()
                    .stroke(palette.accent.opacity(0.12), lineWidth: 3)
                    .frame(width: 44, height: 44)

                Circle()
                    .trim(from: 0, to: 0.7)
                    .stroke(
                        AngularGradient(
                            colors: [
                                palette.accent,
                                palette.accent.opacity(0.3)
                            ],
                            center: .center
                        ),
                        style: StrokeStyle(lineWidth: 3, lineCap: .round)
                    )
                    .frame(width: 44, height: 44)
                    .rotationEffect(.degrees(rotation))
            }

            if let message {
                Text(message)
                    .font(.system(size: MeltedType.control))
                    .foregroundStyle(palette.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
        .onAppear {
            withAnimation(.linear(duration: 1.0).repeatForever(autoreverses: false)) {
                rotation = 360
            }
        }
    }
}
