// Historical Contour-era fixture; not compatible with the current liquid API.
// Use ../animation-audit/build-preview.py and MeltedDesignSystemTests instead.
import SwiftUI

struct PreviewRoot: View {
    @State private var mode = 0
    @State private var dark = false
    @State private var compact = false
    var body: some View {
        Group {
            if mode == 0 {
                MeltedScreen(backdrop: true) {
                    VStack(spacing: 28) {
                        MeltedWordmark()
                        Text("连接服务器").font(.title2.bold())
                        Text("原生融化背景验证").foregroundStyle(.secondary)
                    }
                }
            } else if mode == 1 {
                HStack(spacing: 1) {
                    EmptyState(icon: "checkmark", title: "没有未读内容", description: "切换到“全部”查看已读内容")
                        .frame(width: compact ? 280 : 320)
                        .background(MeltedPalette(dark ? .dark : .light).canvas)
                    EmptyState(icon: "book", title: "选择一条内容", description: "点击左侧内容，查看全文")
                        .background(MeltedPalette(dark ? .dark : .light).surface)
                }
            } else {
                HStack(spacing: 24) {
                    ForEach(0..<4) { stage in
                        VStack {
                            Text(["积聚", "下落", "触底溅开", "回落"][stage])
                            Canvas { context, size in
                                let cycle = Self.samples[stage]
                                let tint = MeltedPalette(dark ? .dark : .light).accent
                                context.fill(Path(roundedRect: CGRect(x: size.width / 2 - 32, y: 6, width: 64, height: 64), cornerRadius: 18), with: .color(tint))
                                MeltedLiquid.Drip(x: size.width / 2 + 11.52, sourceY: 69, reach: 18, radius: 5.2, poolY: size.height - 1)
                                    .draw(in: &context, cycle: cycle, tint: tint)
                            }.opacity(dark ? 0.2 : 0.13)
                        }
                    }
                }.padding(24).background(MeltedPalette(dark ? .dark : .light).surface)
            }
        }
        .preferredColorScheme(dark ? .dark : .light)
        .frame(width: compact ? 680 : 1000, height: compact ? 520 : 720)
        .toolbar {
            ToolbarItemGroup {
                Picker("场景", selection: $mode) {
                    Text("连接背景").tag(0)
                    Text("内页空状态").tag(1)
                    Text("阶段采样").tag(2)
                }
                Toggle("深色", isOn: $dark)
                Toggle("紧凑", isOn: $compact)
            }
        }
    }
    static let samples: [MeltedLiquid.Cycle] = [0, 1, 2, 3].map { stage in
        let candidates = stride(from: 0.0, to: 6.2, by: 0.001).map {
            MeltedLiquid.Cycle(time: $0, period: 6.2, fallDuration: 1.05, seed: 42)
        }
        return candidates.first { cycle in
            switch stage {
            case 0: return cycle.formation > 0.97
            case 1: return (cycle.fall ?? -1) > 0.63
            case 2: return (cycle.impact ?? -1) > 0.23
            default: return (cycle.impact ?? -1) > 0.55
            }
        }!
    }
}
@main struct PreviewApp: App {
    var body: some Scene {
        Window("液滴动效 · 原生组件验证", id: "liquid-preview") { PreviewRoot() }
            .windowResizability(.contentSize)
    }
}
