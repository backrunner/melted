// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI
import MeltedCore
import MeltedDesignSystem

/// Branding is shared by both steps. Fade in the new form after removing the old
/// one, without letting the transition animate form layout or button positions.
struct ConnectionView: View {
    @ObservedObject var model: WorkspaceModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var confirming: Bool { model.discovery != nil }

    var body: some View {
        ConnectionPage {
            ZStack(alignment: .topLeading) {
                if confirming {
                    ServerConfirmationView(model: model)
                        .transaction { $0.animation = nil }
                        .transition(pageTransition)
                } else {
                    LandingView(model: model)
                        .transaction { $0.animation = nil }
                        .transition(pageTransition)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var pageAnimation: Animation? {
        reduceMotion ? nil : .easeOut(duration: MeltedMotion.transition)
    }

    private var pageTransition: AnyTransition {
        .asymmetric(insertion: .opacity.animation(pageAnimation), removal: .identity)
    }
}
