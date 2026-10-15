// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

struct ConnectionView: View {
    @ObservedObject var model: WorkspaceModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if model.discovery == nil {
                LandingView(model: model)
            } else {
                ServerConfirmationView(model: model)
            }
        }
        .animation(reduceMotion ? nil : .easeOut(duration: MeltedMotion.transition), value: model.discovery != nil)
    }
}
