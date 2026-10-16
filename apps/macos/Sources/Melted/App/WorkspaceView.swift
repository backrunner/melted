// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct WorkspaceView: View {
    @ObservedObject var model: WorkspaceModel
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var width: CGFloat = MeltedLayout.initialWidth
    @State private var searchOpen = false

    private var palette: MeltedPalette { MeltedPalette(scheme) }

    var body: some View {
        Group {
            if model.connected {
                MeltedScreen {
                    VStack(spacing: 0) {
                        // A failure while reading keeps the loaded content and explains itself here.
                        if let banner = model.banner {
                            MeltedNotice(
                                tone: .attention,
                                title: banner,
                                actions: [.init("重新加载", prominent: true) { Task { await model.reload() } },
                                          .init("知道了") { model.dismissBanner() }]
                            )
                            .padding(.horizontal, 16)
                            .padding(.top, 10)
                            .transition(.opacity.combined(with: .offset(y: -8)))
                        }

                        if width >= MeltedLayout.splitMinimum {
                            HSplitView {
                                ContentListView(model: model).frame(minWidth: 280, idealWidth: MeltedLayout.listIdeal, maxWidth: 360)
                                ReaderView(model: model, compact: false).frame(minWidth: 440, maxWidth: .infinity)
                            }
                        } else if model.selectedID != nil {
                            ReaderView(model: model, compact: true)
                        } else { ContentListView(model: model) }
                    }
                }
                .animation(reduceMotion ? nil : MeltedMotion.content, value: model.banner)
            } else { ConnectionView(model: model) }
        }
        .background(GeometryReader { proxy in Color.clear.onAppear { width = proxy.size.width }.onChange(of: proxy.size.width) { _, value in width = value } })
        .toolbar { if model.connected { WorkspaceToolbar(model: model, width: width, searchOpen: $searchOpen) } }
        .toolbarRole(.editor)
        .task(id: model.filter) { if model.connected { await model.reload() } }
        .task(id: model.selectedID) { await model.select() }
        .onChange(of: model.searchRequest) { _, _ in searchOpen = true }
    }

}
