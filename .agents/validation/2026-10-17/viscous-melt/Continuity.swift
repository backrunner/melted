// Historical Contour-era fixture; not compatible with the current liquid API.
// Use ../animation-audit/build-preview.py and MeltedDesignSystemTests instead.
import SwiftUI

@main struct ContinuityCheck {
    static func main() {
        var samples = 0
        var cutDifferences = 0
        var restDifferences = 0
        for radius in [5.0, 6.2, 17.0] {
            for reach in [radius * 2.8, radius * 6] {
                for asymmetry in [0.8, 1.0, 1.2] {
                    let released = MeltedLiquidContour(radius: radius, reach: reach, progress: 1, asymmetry: asymmetry)
                    let attached = released.attached(at: .zero)
                    let remnant = released.remnant(at: .zero, recoil: 1)
                    let falling = released.falling(center: CGPoint(x: released.tipOffset, y: released.centerDepth), age: 0)
                    let rest = released.remnant(at: .zero, recoil: 0)
                    let next = MeltedLiquidContour(radius: radius, reach: reach, progress: 0, asymmetry: asymmetry).attached(at: .zero)
                    for x in stride(from: -radius * 3, through: radius * 3, by: 0.5) {
                        for y in stride(from: 0.25, through: released.centerDepth + radius * 1.5, by: 0.5) {
                            let point = CGPoint(x: x, y: y)
                            if attached.contains(point) != (remnant.contains(point) || falling.contains(point)) { cutDifferences += 1 }
                            if rest.contains(point) != next.contains(point) { restDifferences += 1 }
                            samples += 1
                        }
                    }
                }
            }
        }
        for seed in 0..<20 {
            for period in [7.6, 8.8, 12.2] {
                for iteration in 0..<10 {
                    let first = MeltedLiquid.Cycle(time: Double(iteration) * period + 0.001,
                                                  period: period, fallDuration: 1.1, seed: Double(seed))
                    for local in stride(from: 0.01, to: period - 0.01, by: 0.05) {
                        let sample = MeltedLiquid.Cycle(time: Double(iteration) * period + local,
                                                       period: period, fallDuration: 1.1, seed: Double(seed))
                        precondition(first.drift == sample.drift && first.size == sample.size && first.length == sample.length)
                    }
                    let resting = MeltedLiquidContour(radius: 6.2 * first.size, reach: 19 * first.length,
                                                      progress: 0, asymmetry: first.asymmetry)
                    precondition(resting.attached(at: .zero).boundingRect.height == 0)
                }
            }
        }
        print("600 cycles keep their random origin/size fixed and start from a flat edge")
        print("Sampled \(samples) points across 18 scale/reach/asymmetry combinations")
        print("Release contour differences: \(cutDifferences); cycle wrap differences: \(restDifferences)")
        precondition(cutDifferences == 0 && restDifferences == 0)
    }
}
