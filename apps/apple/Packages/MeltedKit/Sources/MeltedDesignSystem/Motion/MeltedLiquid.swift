// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// One clock owns formation, release and impact, so a splash can only follow its drop.
/// Shared by the connection backdrop and the smaller empty-state illustration.
enum MeltedLiquid {
    /// Visual gravity in points per second squared. Fall time follows the real distance,
    /// so a short pane and a tall window drip with the same weight.
    static let gravity = 1150.0
    static let settling = 1.65

    struct Cycle {
        let local: Double
        let size: Double
        let length: Double
        let drift: Double
        let asymmetry: Double
        let slack: Double

        init(time: Double, period: Double, offset: Double = 0, seed: Double = 0) {
            let clock = time + offset
            let iteration = floor(clock / period)
            local = clock - iteration * period
            func noise(_ channel: Double) -> Double {
                let value = sin(iteration * 127.1 + seed * 311.7 + channel * 74.7) * 43758.5453
                return value - floor(value)
            }
            // Choose a new origin only after the previous remnant is completely flat.
            // Parameters stay fixed for the entire drop, including its impact.
            size = 0.82 + 0.36 * noise(1)
            length = 0.8 + 0.4 * noise(2)
            drift = 2 * noise(3) - 1
            asymmetry = 0.8 + 0.4 * noise(4)
            slack = noise(6)
        }
    }

    struct Drip {
        let x: Double
        /// Screen y of the edge the drip hangs from, at a given x.
        let source: (Double) -> Double
        /// Screen y of the surface the drop lands on, at a given x.
        let pool: (Double) -> Double
        let reach: Double
        let radius: Double
        var positionRange: Double? = nil

        /// Widest point where the pendant meets its edge, relative to `radius`.
        static let rootSpread = 1.95

        /// Everything fixed for one drop: origin, size, release and landing time.
        struct Plan {
            let cycle: Cycle
            let pendant: Pendant
            let cut: Pendant.Shape
            let x0: Double
            let dropX: Double
            let dropRadius: Double
            let flight: Double
            let release: Double
        }

        func plan(time: Double, period: Double, offset: Double, seed: Double) -> Plan {
            let cycle = Cycle(time: time, period: period, offset: offset, seed: seed)
            let r = radius * cycle.size
            let x0 = x + (positionRange ?? radius * 0.9) * cycle.drift
            let pendant = Pendant(radius: r, reach: reach * cycle.length,
                                  lean: r * 1.25 * (cycle.asymmetry - 1))
            let cut = pendant.shape(at: 1)
            let dropX = x0 + cut.bulbX
            let dropRadius = sqrt(cut.rx * cut.ry)
            let surface = pool(dropX) - source(x0)
            // The drop is still changing shape as it falls. A fixed maximum stretch
            // starts the splash above the surface and visibly snaps the drop down.
            var lo = 0.0
            var hi = sqrt(2 * max(0, surface - cut.cy) / MeltedLiquid.gravity)
            for _ in 0..<24 {
                let mid = (lo + hi) / 2
                let falling = Falling(cut: cut, radius: dropRadius, age: mid)
                if falling.center + falling.ry < surface { lo = mid } else { hi = mid }
            }
            let flight = (lo + hi) / 2
            let release = max(period * 0.35, period - flight - MeltedLiquid.settling - 0.25 - 0.5 * cycle.slack)
            return Plan(cycle: cycle, pendant: pendant, cut: cut, x0: x0, dropX: dropX,
                        dropRadius: dropRadius, flight: flight, release: release)
        }

        func draw(in context: inout GraphicsContext, time: Double, period: Double,
                  offset: Double, seed: Double, tint: Color) {
            let plan = plan(time: time, period: period, offset: offset, seed: seed)
            let (cycle, pendant, cut, x0, dropX) = (plan.cycle, plan.pendant, plan.cut, plan.x0, plan.dropX)
            let (dropRadius, flight, release) = (plan.dropRadius, plan.flight, plan.release)
            let top = source(x0)

            let upper = Space(origin: CGPoint(x: x0, y: top), scale: pendant.radius) { source(x0 + $0) - top }
            let lower = Space(origin: CGPoint(x: dropX, y: pool(dropX)), scale: dropRadius, flipped: true) {
                pool(dropX + $0) - pool(dropX)
            }
            func fill(_ outlines: [[CGPoint]], in space: Space) {
                for outline in outlines {
                    context.fill(MeltedLiquidField.path(outline, map: space.map), with: .color(tint))
                }
            }

            guard cycle.local >= release else {
                fill(pendant.attached(progress: cycle.local / release), in: upper)
                return
            }
            let age = cycle.local - release
            if age < Remnant.duration {
                fill(Remnant(pendant: pendant, cut: cut).outlines(age: age), in: upper)
            }

            let falling = Falling(cut: cut, radius: dropRadius, age: age)
            let impact = age - flight
            guard impact < MeltedLiquid.settling else { return }
            let heightAboveSurface = (pool(dropX) - top) - falling.center
            let splash = Splash(radius: dropRadius, velocity: MeltedLiquid.gravity * flight,
                                contact: Falling(cut: cut, radius: dropRadius, age: flight),
                                asymmetry: cycle.asymmetry, time: impact)
            if impact < 0 && heightAboveSurface - falling.ry > splash.blend + 1 {
                fill(falling.outlines(), in: upper)
            } else {
                // Close to the pool, the drop joins the same field as the surface,
                // so contact grows a fillet instead of two shapes overlapping.
                let w = impact < 0 ? heightAboveSurface : nil
                var residue = context
                residue.opacity *= splash.opacity
                // Fade the merged splash once, so overlapping contour/surface fills
                // cannot leave a darker seam as the water mark becomes transparent.
                residue.drawLayer { layer in
                    for outline in splash.outlines(approach: w, falling: falling) {
                        layer.fill(MeltedLiquidField.path(outline, map: lower.map), with: .color(tint))
                    }
                    if impact >= 0 {
                        layer.fill(splash.surface(in: lower, pool: pool), with: .color(tint))
                        splash.drawBeads(in: &layer, space: lower, tint: tint)
                    }
                }
            }
        }
    }

    /// Local frame anchored on an edge: `v` points away from the surface. Points near
    /// the surface follow its curve exactly; deeper points relax to a straight frame.
    struct Space {
        let origin: CGPoint
        let scale: Double
        var flipped = false
        let offset: (Double) -> Double

        func map(_ point: CGPoint) -> CGPoint {
            let depth = max(0, point.y)
            let weight = 1 / (1 + pow(depth / (2 * scale), 2))
            let follow = offset(point.x) * weight
            return CGPoint(x: origin.x + point.x,
                           y: origin.y + follow + (flipped ? -point.y : point.y))
        }
    }

    private static func ease(_ value: Double) -> Double {
        let x = min(max(value, 0), 1)
        return x * x * (3 - 2 * x)
    }

    private static func easeOut(_ value: Double, power: Double = 3) -> Double {
        1 - pow(1 - min(max(value, 0), 1), power)
    }

    private static func mix(_ a: Double, _ b: Double, _ t: Double) -> Double { a + (b - a) * t }

    /// A viscous pendant: a broad soft swell, a thick sag, and only at the end a neck
    /// that thins to a thread. Smooth blending keeps shoulders round at every stage.
    struct Pendant {
        let radius: Double
        let reach: Double
        let lean: Double
        var blend: Double { radius * 0.85 }

        struct Shape {
            let bulbX: Double
            let cy: Double
            let rx: Double
            let ry: Double
            let neck: CGPoint
            let topRadius: Double
            let neckRadius: Double
            let bulbRadius: Double
            let bulbBlend: Double
        }

        func shape(at progress: Double) -> Shape {
            let p = min(max(progress, 0), 1)
            let swell = MeltedLiquid.ease(p / 0.42)
            let sag = MeltedLiquid.ease((p - 0.2) / 0.64)
            let pull = MeltedLiquid.ease((p - 0.78) / 0.22)
            let pinch = pow(min(max((p - 0.86) / 0.14, 0), 1), 1.4)
            // A wide, shallow lens first, so the edge swells as a broad soft dome
            // before it gathers into a rounder, heavier tip.
            let rx = radius * (MeltedLiquid.mix(1.5, 1.0, MeltedLiquid.ease(sag / 0.6)) - 0.06 * pull)
            let ry = radius * (MeltedLiquid.mix(0.6, 1.0, swell) + 0.05 * sag + 0.14 * pull)
            // At rest the lens sits inside the edge, beyond the blend distance,
            // so the surface is exactly flat before a new drop starts to swell.
            let rest = -blend - radius * 0.05
            let bottom = rest + (radius * 1.1 - rest) * swell + reach * (0.7 * sag + 0.3 * pull)
            let cy = bottom - ry
            let bulbX = lean * (0.4 * swell + 0.6 * sag)
            let stem = MeltedLiquid.ease(sag / 0.3)
            let neckDepth = max(0, (cy - ry) * MeltedLiquid.mix(0.5, 0.72, pull))
            let neck = CGPoint(x: bulbX * 0.35, y: neckDepth)
            let tipRadius = min(rx, ry) * 0.8
            let topRadius = MeltedLiquid.mix(-blend, radius * (0.9 - 0.15 * pull), stem)
            // A thick, nearly even finger; the waist appears with the final pull and
            // only the last moments thin it to a thread.
            let finger = MeltedLiquid.mix(topRadius, tipRadius, 0.5) * (1 - 0.3 * pull)
            let neckRadius = finger * (1 - pinch) + radius * 0.045 * pinch
            return Shape(bulbX: bulbX, cy: cy, rx: rx, ry: ry, neck: neck, topRadius: topRadius,
                         neckRadius: neckRadius, bulbRadius: tipRadius, bulbBlend: radius * 0.45 * (1 - 0.65 * pinch))
        }

        func attached(progress: Double) -> [[CGPoint]] {
            let s = shape(at: progress)
            let blend = blend
            let bulb = CGPoint(x: s.bulbX, y: s.cy)
            let field: MeltedLiquidField.Field = { u, v in
                let upper = MeltedLiquidField.column(u, v, from: .zero, to: s.neck, radii: (s.topRadius, s.neckRadius))
                let lower = MeltedLiquidField.column(u, v, from: s.neck, to: bulb, radii: (s.neckRadius, s.bulbRadius))
                let body = MeltedLiquidField.ellipse(u, v, center: bulb, rx: s.rx, ry: s.ry)
                let hanging = MeltedLiquidField.smin(MeltedLiquidField.smin(upper, lower, radius * 0.2), body, s.bulbBlend)
                return MeltedLiquidField.smin(v, hanging, blend)
            }
            let axis = Axis([.zero, s.neck, bulb])
            return MeltedLiquidField.trace(field, axis: axis.at, start: 0.02, end: s.cy + s.ry + 2,
                                           attached: true, resolution: max(0.5, radius * 0.06),
                                           maxHalfWidth: radius * 6, lip: 6)
        }
    }

    /// The part left on the edge after the neck breaks drains back quickly at first,
    /// then slowly, until it is flat again.
    struct Remnant {
        static let duration = 0.9
        let pendant: Pendant
        let cut: Pendant.Shape

        func outlines(age: Double) -> [[CGPoint]] {
            let blend = pendant.blend
            let draining = MeltedLiquid.easeOut(age / 0.82)
            let shrinking = MeltedLiquid.ease(age / 0.82)
            let snapped = min(age / 0.04, 1)
            let tip = CGPoint(x: cut.neck.x * (1 - draining), y: cut.neck.y * (1 - draining))
            let topRadius = MeltedLiquid.mix(cut.topRadius, -blend, shrinking)
            let tipRadius = MeltedLiquid.mix(cut.neckRadius, -0.3, snapped)
            let field: MeltedLiquidField.Field = { u, v in
                MeltedLiquidField.smin(v, MeltedLiquidField.column(u, v, from: .zero, to: tip,
                                                                   radii: (topRadius, tipRadius)), blend)
            }
            return MeltedLiquidField.trace(field, axis: Axis([.zero, tip]).at, start: 0.02, end: tip.y + max(2, topRadius + 2),
                                           attached: true, resolution: max(0.5, pendant.radius * 0.06),
                                           maxHalfWidth: pendant.radius * 6, lip: 6)
        }
    }

    /// A released drop: it peels away slowly, keeps a short tail that is drawn back in,
    /// wobbles once as surface tension rounds it, and stretches with speed.
    struct Falling {
        static let contactStretch = 1.38
        let cut: Pendant.Shape
        let radius: Double
        let age: Double

        var velocity: Double { MeltedLiquid.gravity * age }
        var center: Double { cut.cy + 0.5 * MeltedLiquid.gravity * age * age }
        private var speed: Double { min(1, velocity / 1400) }
        private var stretch: Double { 1 + (Self.contactStretch - 1) * speed }
        private var relax: Double { MeltedLiquid.ease(age / 0.14) }
        private var wobble: Double { 0.09 * exp(-age / 0.2) * cos(2 * .pi * age / 0.15) }
        var ry: Double { MeltedLiquid.mix(cut.ry, radius * stretch * (1 + wobble), relax) }
        var rx: Double { MeltedLiquid.mix(cut.rx, radius / sqrt(stretch) * (1 - 0.5 * wobble), relax) }
        /// Length of the trailing taper above the round body.
        var tail: Double {
            let initial = max(0, cut.cy - cut.ry - cut.neck.y)
            return initial * (1 - MeltedLiquid.ease(age / 0.18)) + radius * 0.8 * speed
        }

        /// Drop field in a frame centred on the drop, `v` pointing down.
        func field(centerV: Double, rx: Double, ry: Double, tail: Double) -> (MeltedLiquidField.Field, Axis, ClosedRange<Double>) {
            let snapped = min(age / 0.04, 1)
            let tailRadius = MeltedLiquid.mix(cut.neckRadius, -0.3, snapped) + radius * 0.08 * speed
            let follow = MeltedLiquid.ease(age / 0.18)
            let center = CGPoint(x: cut.bulbX, y: centerV)
            let tip = CGPoint(x: MeltedLiquid.mix(cut.neck.x, cut.bulbX, follow), y: centerV - ry - tail)
            let blend = MeltedLiquid.mix(cut.bulbBlend, radius * 0.35, relax)
            let field: MeltedLiquidField.Field = { u, v in
                let taper = MeltedLiquidField.column(u, v, from: tip, to: center, radii: (tailRadius, radius * 0.55))
                return MeltedLiquidField.smin(taper, MeltedLiquidField.ellipse(u, v, center: center, rx: rx, ry: ry), blend)
            }
            return (field, Axis([tip, center]), (tip.y - max(0, tailRadius) - 1)...(centerV + ry + 1))
        }

        func outlines() -> [[CGPoint]] {
            let (field, axis, range) = field(centerV: center, rx: rx, ry: ry, tail: tail)
            return MeltedLiquidField.trace(field, axis: axis.at, start: range.lowerBound, end: range.upperBound,
                                           attached: false, resolution: max(0.5, radius * 0.06),
                                           maxHalfWidth: radius * 4, lip: 0)
        }
    }

    /// Impact on the pool: the drop sinks with a soft fillet, squashes, lifts a swell
    /// that spreads outward as two decaying waves, and tosses two small beads.
    /// The shallow water mark keeps its shape while fading completely away.
    struct Splash {
        let radius: Double
        let velocity: Double
        let contact: Falling
        let asymmetry: Double
        let time: Double
        var blend: Double { radius * 0.7 }
        private var entry: Double { min(0.18, max(0.07, 3 * (contact.ry + radius) / max(velocity, 1))) }

        var opacity: Double {
            1 - MeltedLiquid.ease((time - 0.32) / (MeltedLiquid.settling - 0.32))
        }

        func height(_ u: Double) -> Double {
            guard time >= 0 else { return 0 }
            let bias = u < 0 ? asymmetry : 2 - asymmetry
            let rise = MeltedLiquid.ease(time / max(entry * 1.5, 0.12))
            let swell = radius * 0.62 * rise * exp(-max(0, time - 0.18) / 0.24)
            let core = swell * exp(-pow(u / (radius * 1.3), 2))
            let front = radius * (1.3 + 4.6 * MeltedLiquid.easeOut(time / 1.4, power: 2))
            let wave = radius * 0.3 * bias * MeltedLiquid.ease((time - 0.06) / 0.16) * exp(-time / 0.5)
                * exp(-pow((abs(u) - front) / (radius * 0.8), 2))
            let spread = radius * (2 + 3.5 * MeltedLiquid.easeOut(time / 0.6))
            let lens = max(0, 1 - pow(u / spread, 2))
            let residue = radius * 0.18 * MeltedLiquid.ease((time - 0.12) / 0.24) * lens * lens
            return core + wave + residue
        }

        /// Pool field with the drop merged in. `approach` is the drop centre height
        /// before contact; after contact the drop follows the entry motion.
        func outlines(approach: Double?, falling: Falling) -> [[CGPoint]] {
            var parts: (MeltedLiquidField.Field, Axis, ClosedRange<Double>)?
            if let approach {
                let (field, _, range) = falling.field(centerV: -approach, rx: falling.rx, ry: falling.ry, tail: falling.tail)
                parts = flip(field, shift: falling.cut.bulbX, range: range)
            } else {
                let q = MeltedLiquid.easeOut(time / entry)
                let sink = MeltedLiquid.ease((time - entry * 0.6) / 0.2)
                if sink < 1 {
                    let ry0 = contact.ry
                    let centre = ry0 - (ry0 + radius) * q - (blend * 1.6 + radius * 0.6) * sink
                    let rx = MeltedLiquid.mix(contact.rx, radius * 1.5, q)
                    let ry = MeltedLiquid.mix(contact.ry, radius * 0.6, q)
                    let (field, _, range) = falling.field(centerV: -centre, rx: rx, ry: ry,
                                                          tail: contact.tail * (1 - q))
                    parts = flip(field, shift: falling.cut.bulbX, range: range)
                }
            }
            let blend = blend
            let surface: MeltedLiquidField.Field = { u, w in w - height(u) }
            let field: MeltedLiquidField.Field
            var end = height(0) + 2
            if let parts {
                let drop = parts.0
                field = { u, w in MeltedLiquidField.smin(surface(u, w), drop(u, w), blend) }
                end = max(end, parts.2.upperBound)
            } else {
                field = surface
            }
            return MeltedLiquidField.trace(field, axis: { _ in 0 }, start: 0.02, end: end, attached: true,
                                           resolution: max(0.5, radius * 0.06), maxHalfWidth: radius * 8, lip: 6)
        }

        /// Re-expresses a drop field from the hanging frame (v down, x relative to the
        /// pendant origin) in the pool frame (w up), centred on the drop axis.
        private func flip(_ field: @escaping MeltedLiquidField.Field, shift: Double, range: ClosedRange<Double>)
            -> (MeltedLiquidField.Field, Axis, ClosedRange<Double>) {
            ({ u, w in field(u + shift, -w) }, Axis([.zero]), (-range.upperBound)...(-range.lowerBound))
        }

        /// Surface swell and outward waves, drawn on the pool itself so troughs between
        /// waves stay visible.
        func surface(in space: Space, pool: (Double) -> Double) -> Path {
            let span = radius * 8
            var path = Path()
            path.move(to: space.map(CGPoint(x: -span, y: -6)))
            var u = -span
            while u <= span {
                path.addLine(to: CGPoint(x: space.origin.x + u, y: pool(space.origin.x + u) - height(u)))
                u += 1
            }
            path.addLine(to: space.map(CGPoint(x: span, y: -6)))
            path.closeSubpath()
            return path
        }

        func drawBeads(in context: inout GraphicsContext, space: Space, tint: Color) {
            let t = time - 0.04
            guard t > 0 else { return }
            let scale = sqrt(radius / 14)
            for side in [-1.0, 1.0] {
                let bias = side < 0 ? asymmetry : 2 - asymmetry
                let vx = side * 120 * scale * bias
                let vy = 210 * scale * sqrt(bias)
                let u = side * radius * 0.9 + vx * t
                let w = radius * 0.35 + vy * t - 0.5 * MeltedLiquid.gravity * t * t
                let size = radius * 0.2
                let exposed = min(max((w + size - height(u)) / (2 * size), 0), 1)
                guard exposed > 0, t < 2 * vy / MeltedLiquid.gravity + 0.2 else { continue }
                let speedX = vx, speedY = vy - MeltedLiquid.gravity * t
                let speed = hypot(speedX, speedY)
                let along = size * exposed * (1 + min(0.5, speed / 900))
                let across = size * exposed / sqrt(1 + min(0.5, speed / 900))
                let centre = space.map(CGPoint(x: u, y: w))
                var bead = context
                bead.translateBy(x: centre.x, y: centre.y)
                bead.rotate(by: .radians(atan2(-speedY, speedX)))
                bead.fill(Path(ellipseIn: CGRect(x: -along, y: -across, width: along * 2, height: across * 2)),
                          with: .color(tint))
            }
        }
    }

    /// Piecewise-linear centre line used to solve each row of an outline.
    struct Axis {
        let points: [CGPoint]
        init(_ points: [CGPoint]) { self.points = points }

        func at(_ v: Double) -> Double {
            guard let first = points.first else { return 0 }
            if v <= first.y { return first.x }
            for index in 1..<max(points.count, 1) where index < points.count {
                let a = points[index - 1], b = points[index]
                if v <= b.y {
                    let span = b.y - a.y
                    return span > 0 ? a.x + (b.x - a.x) * (v - a.y) / span : b.x
                }
            }
            return points[points.count - 1].x
        }
    }
}
