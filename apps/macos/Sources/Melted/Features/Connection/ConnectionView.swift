// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

/// Branding is shared by both steps. Only opacity changes during a page swap;
/// form height and button positions must not inherit a spring animation.
struct ConnectionView: View {
    @ObservedObject var model: WorkspaceModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var confirming: Bool { model.discovery != nil }

    var body: some View {
        ConnectionPage {
            ZStack(alignment: .topLeading) {
                if confirming {
                    ServerConfirmationView(model: model)
                        .transition(.opacity.animation(pageAnimation))
                } else {
                    LandingView(model: model)
                        .transition(.opacity.animation(pageAnimation))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var pageAnimation: Animation? {
        reduceMotion ? nil : .easeOut(duration: MeltedMotion.transition)
    }
}
