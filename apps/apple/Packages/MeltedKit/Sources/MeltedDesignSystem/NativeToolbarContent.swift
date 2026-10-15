import SwiftUI

/// Wrapper for native toolbar content styling
public struct NativeToolbarContent<Content: View>: View {
    let content: Content

    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    public var body: some View {
        content
    }
}
