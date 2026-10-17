// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// Slow molten backdrop for the connection flow: a warm glow drifting underneath,
/// and a liquid edge that drips from the top into a pool along the bottom.
/// It sits behind content at low opacity and holds still when Reduce Motion is on.
public struct MeltedBackdrop: View {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    public init() {}

    public var body: some View {
        let tint = MeltedPalette(scheme).accent
        let dark = scheme == .dark
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { timeline in
            let t = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 86_400)
            ZStack {
                Canvas { context, size in Self.glow(&context, size: size, t: t, tint: tint) }
                    .opacity(dark ? 0.05 : 0.04)
                Canvas { context, size in Self.melt(&context, size: size, t: t, tint: tint) }
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
            let rect = CGRect(x: x - r * 1.15, y: y - r, width: r * 2.3, height: r * 2)
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

    /// Drips sit beside the centered content column so falling drops rarely cross text.
    private static let drips: [(x: Double, width: Double, base: Double, reach: Double, speed: Double, phase: Double, fall: Double)] = [
        (0.07, 0.020, 0.05, 0.12, 0.35, 0.0, 0.075),
        (0.17, 0.014, 0.03, 0.08, 0.42, 1.3, 0.090),
        (0.28, 0.024, 0.06, 0.15, 0.28, 2.6, 0.065),
        (0.72, 0.018, 0.04, 0.10, 0.38, 3.7, 0.080),
        (0.83, 0.026, 0.07, 0.17, 0.26, 4.9, 0.060),
        (0.94, 0.015, 0.03, 0.09, 0.45, 5.8, 0.100),
    ]

    private static func melt(_ context: inout GraphicsContext, size: CGSize, t: Double, tint: Color) {
        let w = size.width, h = size.height
        let unit = min(w, 1400)
        // Blur joins nearby shapes; the threshold restores a crisp liquid contour.
        // Keep the finished Canvas unblurred so the edge stays sharp at display resolution.
        context.addFilter(.alphaThreshold(min: 0.5, color: tint))
        context.addFilter(.blur(radius: 14))
        context.drawLayer { layer in
            func circle(_ x: Double, _ y: Double, _ r: Double) {
                layer.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)), with: .color(.black))
            }

            let ceiling = h * 0.035
            layer.fill(Path(CGRect(x: -40, y: -60, width: w + 80, height: 60 + ceiling)), with: .color(.black))
            for i in 0...9 {
                circle(w * Double(i) / 9, ceiling * 0.6, ceiling * (1.1 + 0.35 * sin(t * 0.3 + Double(i) * 1.9)))
            }

            let pool = h * 0.045
            layer.fill(Path(CGRect(x: -40, y: h - pool * 0.5, width: w + 80, height: pool + 60)), with: .color(.black))
            for i in 0...7 {
                circle(w * Double(i) / 7, h - pool * 0.4, pool * (0.9 + 0.4 * sin(t * 0.25 + Double(i) * 2.3)))
            }

            for drip in drips {
                let x = w * drip.x
                let width = drip.width * unit
                let stretch = 0.5 + 0.5 * sin(t * drip.speed + drip.phase)
                let length = h * (drip.base + drip.reach * stretch)
                layer.fill(Path(roundedRect: CGRect(x: x - width / 2, y: -10, width: width, height: length + 10), cornerRadius: width / 2), with: .color(.black))
                circle(x, length, width * 0.75)

                // A drop pinches off the bulb, accelerates, and merges into the pool.
                let cycle = (t * drip.fall + drip.phase).truncatingRemainder(dividingBy: 1)
                let dropY = length + cycle * cycle * (h - length)
                circle(x, dropY, width * (0.6 - 0.15 * cycle))
            }
        }
    }
}
