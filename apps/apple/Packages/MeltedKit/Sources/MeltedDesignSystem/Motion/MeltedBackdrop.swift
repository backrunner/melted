// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// Slow molten backdrop for the connection flow: a warm glow drifting underneath,
/// and a liquid edge that drips from the top into a pool along the bottom.
/// It sits behind content at low opacity and holds still when Reduce Motion is on.
public struct MeltedBackdrop: View {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var seed = Double.random(in: 0...1000)
    public init() {}

    public var body: some View {
        let tint = MeltedPalette(scheme).accent
        let dark = scheme == .dark
        ZStack {
            // The glow drifts over tens of seconds; a low refresh is indistinguishable.
            TimelineView(.animation(minimumInterval: 1 / 20, paused: reduceMotion)) { timeline in
                let t = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate
                Canvas { context, size in Self.glow(&context, size: size, t: t, tint: tint) }
                    .opacity(dark ? 0.05 : 0.04)
            }
            // Falling drops move fast, so the liquid follows the display refresh rate.
            TimelineView(.animation(paused: reduceMotion)) { timeline in
                let t = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate
                Canvas { context, size in Self.melt(&context, size: size, t: t, tint: tint, still: reduceMotion, seed: seed) }
                    .opacity(dark ? 0.12 : 0.10)
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private static let glows: [(x: Double, y: Double, radius: Double, speed: Double, phase: Double)] = [
        (0.16, 0.18, 0.30, 0.21, 0.0),
        (0.86, 0.26, 0.24, 0.17, 1.7),
        (0.70, 0.90, 0.34, 0.15, 3.1),
        (0.08, 0.82, 0.22, 0.24, 4.4),
    ]

    /// Soft light, drawn as radial gradients rather than a huge blur filter,
    /// which would clamp and leave visible discs.
    private static func glow(_ context: inout GraphicsContext, size: CGSize, t: Double, tint: Color) {
        let unit = max(size.width, size.height)
        for blob in glows {
            let x = blob.x * size.width + sin(t * blob.speed + blob.phase) * unit * 0.06
            let y = blob.y * size.height + cos(t * blob.speed * 0.8 + blob.phase) * unit * 0.05
            let r = blob.radius * unit * (1 + 0.08 * sin(t * blob.speed * 1.3 + blob.phase))
            // The silhouette and gradient must end at the same radius; clipping a
            // circular gradient to a shorter ellipse leaves a visible dark ring.
            let rect = CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)
            context.fill(Path(ellipseIn: rect), with: .radialGradient(
                Gradient(stops: [
                    .init(color: tint.opacity(0.55), location: 0),
                    .init(color: tint.opacity(0.18), location: 0.55),
                    .init(color: tint.opacity(0), location: 1),
                ]),
                center: CGPoint(x: rect.midX, y: rect.midY),
                startRadius: 0,
                endRadius: max(rect.width, rect.height) / 2
            ))
        }
    }

    /// Keep the falling lanes in the gutters, including at the minimum window width.
    private static let drips: [(lane: Double, radius: Double, reach: Double, period: Double, offset: Double)] = [
        (0.22, 0.013, 0.09, 8.8, 0.0),
        (0.55, 0.010, 0.06, 10.4, 4.0),
        (0.86, 0.015, 0.13, 12.2, 7.5),
        (0.22, 0.011, 0.07, 9.6, 5.2),
        (0.55, 0.016, 0.14, 11.5, 2.4),
        (0.86, 0.010, 0.08, 10.8, 8.8),
    ]

    private static func melt(_ context: inout GraphicsContext, size: CGSize, t: Double, tint: Color, still: Bool, seed: Double) {
        let w = size.width, h = size.height
        let unit = min(w, 1100)
        let gutter = max(36, (w - MeltedConnection.contentMaximum) / 2 - 24)
        func ceiling(_ x: Double) -> Double {
            MeltedConnectionLayout.ceilingDepth(height: h) + MeltedConnection.waveAmplitude * sin(x / w * .pi * 5 + t * 0.22)
        }
        func surface(_ x: Double) -> Double {
            h - MeltedConnectionLayout.poolDepth(height: h) + MeltedConnection.waveAmplitude * sin(x / w * .pi * 4 + t * 0.28)
        }

        // Draw the actual liquid surface and use that same height for every impact.
        // Curved silhouettes need no full-canvas blur, which used to erase small drops.
        var top = Path()
        top.move(to: CGPoint(x: -20, y: -20))
        top.addLine(to: CGPoint(x: w + 20, y: -20))
        top.addLine(to: CGPoint(x: w + 20, y: ceiling(w)))
        for step in 0...100 {
            let x = w * (1 - Double(step) / 100)
            top.addLine(to: CGPoint(x: x, y: ceiling(x)))
        }
        top.addLine(to: CGPoint(x: -20, y: ceiling(0)))
        top.closeSubpath()
        context.fill(top, with: .color(tint))

        var pool = Path()
        pool.move(to: CGPoint(x: -20, y: h + 20))
        pool.addLine(to: CGPoint(x: -20, y: surface(0)))
        for step in 0...100 {
            let x = w * Double(step) / 100
            pool.addLine(to: CGPoint(x: x, y: surface(x)))
        }
        pool.addLine(to: CGPoint(x: w + 20, y: surface(w)))
        pool.addLine(to: CGPoint(x: w + 20, y: h + 20))
        pool.closeSubpath()
        context.fill(pool, with: .color(tint))

        for (index, drip) in drips.enumerated() {
            let x = index < 3 ? gutter * drip.lane : w - gutter * drip.lane
            MeltedLiquid.Drip(x: x, source: ceiling, pool: surface, reach: h * drip.reach,
                              radius: max(5, unit * drip.radius))
                .draw(in: &context, time: t, period: drip.period, offset: still ? 0 : drip.offset,
                      seed: seed + Double(index), tint: tint)
        }
    }
}
