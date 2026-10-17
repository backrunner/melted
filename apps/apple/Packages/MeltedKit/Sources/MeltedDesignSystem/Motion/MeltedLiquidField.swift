// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// Implicit liquid geometry. Parts are blended with a smooth minimum, so every
/// joint between edge, neck, bulb and pool gets a real fillet instead of a crease.
/// Each outline is then solved row by row and returned as a crisp vector path:
/// no blur or alpha threshold touches the final silhouette.
enum MeltedLiquidField {
    typealias Field = (Double, Double) -> Double

    /// Quadratic smooth minimum; its zero level set stays tangent-continuous.
    static func smin(_ a: Double, _ b: Double, _ k: Double) -> Double {
        guard k > 0 else { return min(a, b) }
        let h = max(k - abs(a - b), 0) / k
        return min(a, b) - h * h * k * 0.25
    }

    /// Tapered capsule between two points. A negative radius hides that end.
    static func column(_ u: Double, _ v: Double, from a: CGPoint, to b: CGPoint,
                       radii: (Double, Double)) -> Double {
        let dx = b.x - a.x, dy = b.y - a.y
        let length = dx * dx + dy * dy
        let t = length > 0 ? min(max(((u - a.x) * dx + (v - a.y) * dy) / length, 0), 1) : 0
        return hypot(u - (a.x + dx * t), v - (a.y + dy * t)) - (radii.0 + (radii.1 - radii.0) * t)
    }

    static func ellipse(_ u: Double, _ v: Double, center: CGPoint, rx: Double, ry: Double) -> Double {
        let rx = max(rx, 0.01), ry = max(ry, 0.01)
        let qx = (u - center.x) / rx, qy = (v - center.y) / ry
        return (sqrt(qx * qx + qy * qy) - 1) * min(rx, ry)
    }

    /// Outlines of `field < 0` around a mostly vertical axis, in local coordinates
    /// where `v` grows away from the surface. A region touching `start` is attached:
    /// it closes `lip` points back inside the surface so it joins without a seam.
    static func trace(_ field: Field, axis: (Double) -> Double, start: Double, end: Double,
                      attached: Bool, resolution: Double, maxHalfWidth: Double, lip: Double) -> [[CGPoint]] {
        guard end > start else { return [] }
        func inside(_ v: Double) -> Bool { field(axis(v), v) < 0 }
        func crossing(_ a: Double, _ b: Double) -> Double {
            var lo = a, hi = b
            let loInside = inside(a)
            for _ in 0..<14 {
                let mid = (lo + hi) / 2
                if inside(mid) == loInside { lo = mid } else { hi = mid }
            }
            return (lo + hi) / 2
        }

        var intervals: [(from: Double, to: Double, attached: Bool)] = []
        var wasInside = inside(start)
        var opened: Double? = wasInside ? start : nil
        var v = start
        while v < end {
            let next = min(v + resolution, end)
            let now = inside(next)
            if now != wasInside {
                let edge = crossing(v, next)
                if now {
                    opened = edge
                } else if let from = opened {
                    intervals.append((from, edge, attached && from == start))
                    opened = nil
                }
                wasInside = now
            }
            v = next
        }
        if let from = opened { intervals.append((from, end, attached && from == start)) }

        return intervals.compactMap { interval in
            guard interval.to - interval.from > 0.05 else { return nil }
            return outline(field, axis: axis, interval: interval, resolution: resolution,
                           maxHalfWidth: maxHalfWidth, lip: lip)
        }
    }

    private static func outline(_ field: Field, axis: (Double) -> Double,
                                interval: (from: Double, to: Double, attached: Bool),
                                resolution: Double, maxHalfWidth: Double, lip: Double) -> [CGPoint] {
        let span = interval.to - interval.from
        let rows = min(84, max(14, Int(span / (resolution * 1.4))))
        // Cosine spacing packs rows at both ends, where round caps and fillets turn fastest.
        let depths = (0...rows).map { interval.from + span * (1 - cos(.pi * Double($0) / Double(rows))) / 2 }

        func edge(_ v: Double, _ side: Double, _ guess: Double) -> Double {
            let center = axis(v)
            func inside(_ d: Double) -> Bool { field(center + side * d, v) < 0 }
            guard inside(0) else { return 0 }
            var lo = 0.0, hi = max(guess, 0.25)
            while inside(hi) {
                lo = hi
                if hi >= maxHalfWidth { return maxHalfWidth }
                hi = min(maxHalfWidth, hi * 1.5 + 0.5)
            }
            for _ in 0..<12 {
                let mid = (lo + hi) / 2
                if inside(mid) { lo = mid } else { hi = mid }
            }
            return (lo + hi) / 2
        }

        var right = [CGPoint](), left = [CGPoint]()
        right.reserveCapacity(rows + 1)
        left.reserveCapacity(rows + 1)
        var guessRight = 0.0, guessLeft = 0.0
        // Solve from the tip toward the root so each search starts near its neighbour.
        for (index, v) in depths.enumerated().reversed() {
            let center = axis(v)
            let isTip = index == rows || (!interval.attached && index == 0)
            let r = isTip ? 0 : edge(v, 1, guessRight)
            let l = isTip ? 0 : edge(v, -1, guessLeft)
            guessRight = r
            guessLeft = l
            right.append(CGPoint(x: center + r, y: v))
            left.append(CGPoint(x: center - l, y: v))
        }
        right.reverse()
        left.reverse()

        var points = [CGPoint]()
        points.reserveCapacity(rows * 2 + 4)
        if interval.attached {
            points.append(CGPoint(x: left[0].x, y: -lip))
            points.append(CGPoint(x: right[0].x, y: -lip))
        }
        points.append(contentsOf: right)
        points.append(contentsOf: left.reversed().dropFirst())
        if !interval.attached { points.removeLast() }
        return points
    }

    /// Smooth closed curve through the midpoints of a dense outline.
    static func path(_ points: [CGPoint], map: (CGPoint) -> CGPoint) -> Path {
        var path = Path()
        guard points.count > 2 else { return path }
        let mapped = points.map(map)
        func mid(_ a: CGPoint, _ b: CGPoint) -> CGPoint { CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2) }
        path.move(to: mid(mapped[mapped.count - 1], mapped[0]))
        for index in mapped.indices {
            path.addQuadCurve(to: mid(mapped[index], mapped[(index + 1) % mapped.count]), control: mapped[index])
        }
        path.closeSubpath()
        return path
    }
}
