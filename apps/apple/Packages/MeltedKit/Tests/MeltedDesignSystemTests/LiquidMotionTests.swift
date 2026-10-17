// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import Testing
@testable import MeltedDesignSystem

@Test func splashStartsWhereTheFallingDropActuallyTouchesTheSurface() {
    for radius in [5.0, 6.2, 17.0] {
        for distance in [100.0, 300.0, 700.0] {
            for seed in 0..<12 {
                let drip = MeltedLiquid.Drip(x: 0, source: { _ in 0 }, pool: { _ in distance }, reach: radius * 3, radius: radius)
                let plan = drip.plan(time: 0, period: 8.8, offset: 0, seed: Double(seed))
                let falling = MeltedLiquid.Falling(cut: plan.cut, radius: plan.dropRadius, age: plan.flight)
                #expect(abs(distance - falling.center - falling.ry) < 0.001)
                #expect(plan.release + plan.flight + MeltedLiquid.settling < 8.8)
            }
        }
    }
}

@Test func contactPreservesTheApproachingContour() {
    for radius in [5.0, 6.2, 17.0] {
        let drip = MeltedLiquid.Drip(x: 0, source: { _ in 0 }, pool: { _ in 300 }, reach: radius * 3, radius: radius)
        let plan = drip.plan(time: 0, period: 8.8, offset: 0, seed: 42)
        let falling = MeltedLiquid.Falling(cut: plan.cut, radius: plan.dropRadius, age: plan.flight)
        let splash = MeltedLiquid.Splash(radius: plan.dropRadius, velocity: falling.velocity, contact: falling,
                                        asymmetry: plan.cycle.asymmetry, time: 0)
        let before = splash.outlines(approach: falling.ry, falling: falling).flatMap { $0 }
        let after = splash.outlines(approach: nil, falling: falling).flatMap { $0 }
        #expect(!before.isEmpty && before.count == after.count)
        for (a, b) in zip(before, after) {
            #expect(hypot(a.x - b.x, a.y - b.y) < 0.001)
        }
    }
}

@Test func eachCycleStartsAndEndsWithAFlatEdge() {
    for seed in 0..<20 {
        let drip = MeltedLiquid.Drip(x: 0, source: { _ in 0 }, pool: { _ in 700 }, reach: 90, radius: 17)
        let plan = drip.plan(time: 0, period: 8.8, offset: 0, seed: Double(seed))
        #expect(plan.pendant.attached(progress: 0).isEmpty)
        #expect(MeltedLiquid.Remnant(pendant: plan.pendant, cut: plan.cut).outlines(age: MeltedLiquid.Remnant.duration).isEmpty)
        let last = MeltedLiquid.Cycle(time: 8.799, period: 8.8, seed: Double(seed))
        #expect(plan.cycle.drift == last.drift && plan.cycle.size == last.size && plan.cycle.length == last.length)
    }
}

@Test func waterMarkFadesCompletelyBeforeItsGeometryIsRemoved() {
    let drip = MeltedLiquid.Drip(x: 0, source: { _ in 0 }, pool: { _ in 300 }, reach: 19, radius: 6.2)
    let plan = drip.plan(time: 0, period: 7.6, offset: 0, seed: 42)
    let falling = MeltedLiquid.Falling(cut: plan.cut, radius: plan.dropRadius, age: plan.flight)
    func splash(at time: Double) -> MeltedLiquid.Splash {
        MeltedLiquid.Splash(radius: plan.dropRadius, velocity: falling.velocity, contact: falling,
                            asymmetry: plan.cycle.asymmetry, time: time)
    }
    #expect(splash(at: -0.1).opacity == 1)
    #expect(splash(at: 0.3).opacity == 1)
    var previous = 1.0
    for frame in 0...120 {
        let mark = splash(at: MeltedLiquid.settling * Double(frame) / 120)
        #expect(mark.opacity >= 0 && mark.opacity <= previous)
        previous = mark.opacity
    }
    let lastVisible = splash(at: MeltedLiquid.settling - 1.0 / 60)
    #expect(lastVisible.height(0) > plan.dropRadius * 0.17)
    #expect(lastVisible.opacity < 0.001)
    #expect(splash(at: MeltedLiquid.settling).opacity == 0)
    #expect(splash(at: MeltedLiquid.settling + 0.1).opacity == 0)
}
