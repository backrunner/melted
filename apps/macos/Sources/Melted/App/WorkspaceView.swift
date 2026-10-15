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
                VStack(spacing: 0) {
                    // Improved error banner
                    if let error = model.error {
                        ConnectionBanner(message: error) { Task { await model.reload() } }
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
            } else { ConnectionView(model: model) }
        }
        .background(palette.surface)
        .foregroundStyle(palette.text)
        .overlay(alignment: .top) {
            if searchOpen {
                ZStack(alignment: .top) {
                    Color.black.opacity(scheme == .dark ? 0.25 : 0.04)
                        .contentShape(Rectangle())
                        .onTapGesture { searchOpen = false }
                        .ignoresSafeArea()
                    SearchPalette(model: model) { searchOpen = false }
                        .frame(width: min(width - 64, 580))
                        .padding(.top, 32)
                        .transition(reduceMotion ? .identity : .opacity)
                }
                .animation(reduceMotion ? nil : .easeOut(duration: MeltedMotion.transition), value: searchOpen)
            }
        }
        .background(GeometryReader { proxy in Color.clear.onAppear { width = proxy.size.width }.onChange(of: proxy.size.width) { _, value in width = value } })
        .toolbar { if model.connected { WorkspaceToolbar(model: model, width: width, searchOpen: $searchOpen) } }
        .toolbarRole(.editor)
        .task(id: model.filter) { if model.connected { await model.reload() } }
        .task(id: model.selectedID) { await model.select() }
        .onChange(of: model.searchRequest) { _, _ in searchOpen = true }
    }

}
