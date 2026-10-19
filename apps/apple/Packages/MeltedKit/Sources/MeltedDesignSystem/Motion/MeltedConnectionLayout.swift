// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import SwiftUI

/// Shared liquid geometry keeps the scrolling form clear of the animated edges.
public enum MeltedConnectionLayout {
    static func ceilingDepth(height: CGFloat) -> CGFloat { height * 0.035 }

    static func poolDepth(height: CGFloat) -> CGFloat {
        min(MeltedConnection.poolMaximumDepth, height * 0.065)
    }

    public static func contentInsets(height: CGFloat) -> EdgeInsets {
        let clearance = MeltedConnection.waveAmplitude + MeltedConnection.animationClearance
        return EdgeInsets(top: ceilingDepth(height: height) + clearance, leading: 0,
                          bottom: poolDepth(height: height) + clearance, trailing: 0)
    }
}
