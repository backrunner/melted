import AppKit
import SwiftUI

/// Preserve the search control's full layout instead of toolbar label adaptation.
struct NativeToolbarContent<Content: View>: NSViewRepresentable {
    var content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    func makeNSView(context: Context) -> NSHostingView<Content> {
        let view = NSHostingView(rootView: content)
        view.sizingOptions = [.intrinsicContentSize]
        return view
    }
    func updateNSView(_ view: NSHostingView<Content>, context: Context) { view.rootView = content }
}

/// Toolbar-hosted SwiftUI fields do not reliably receive programmatic focus.
struct NativeSearchField: NSViewRepresentable {
    @Binding var text: String
    let focusRequest: Int
    var focusOnAppear = false
    var prominent = false
    var onSubmit: () -> Void = {}
    var onCancel: () -> Void = {}
    var onMove: (Int) -> Void = { _ in }

    func makeCoordinator() -> Coordinator { Coordinator(text: $text, request: focusRequest) }
    func makeNSView(context: Context) -> NSSearchField {
        let field = FocusedSearchField()
        field.focusOnAttach = focusOnAppear
        field.placeholderString = prominent ? "搜索内容、分类、标签或关注主题" : "搜索资讯"
        field.setAccessibilityLabel(prominent ? "搜索与筛选" : "搜索资讯")
        if prominent {
            field.font = .systemFont(ofSize: 20)
            field.isBezeled = false; field.drawsBackground = false
            field.focusRingType = .none
            (field.cell as? NSSearchFieldCell)?.searchButtonCell = nil
        }
        field.delegate = context.coordinator
        field.sendsSearchStringImmediately = true
        return field
    }
    func updateNSView(_ field: NSSearchField, context: Context) {
        context.coordinator.text = $text
        context.coordinator.onSubmit = onSubmit
        context.coordinator.onCancel = onCancel
        context.coordinator.onMove = onMove
        if field.stringValue != text { field.stringValue = text }
        if context.coordinator.request != focusRequest {
            context.coordinator.request = focusRequest
            DispatchQueue.main.async { field.window?.makeFirstResponder(field) }
        }
    }
    @MainActor final class Coordinator: NSObject, NSSearchFieldDelegate {
        var text: Binding<String>
        var request: Int
        var onSubmit: () -> Void = {}
        var onCancel: () -> Void = {}
        var onMove: (Int) -> Void = { _ in }
        init(text: Binding<String>, request: Int) { self.text = text; self.request = request }
        func controlTextDidChange(_ notification: Notification) {
            guard let field = notification.object as? NSSearchField else { return }
            text.wrappedValue = field.stringValue
        }
        func control(_ control: NSControl, textView: NSTextView, doCommandBy selector: Selector) -> Bool {
            switch selector {
            case #selector(NSResponder.insertNewline(_:)): onSubmit(); return true
            case #selector(NSResponder.cancelOperation(_:)): onCancel(); return true
            case #selector(NSResponder.moveDown(_:)): onMove(1); return true
            case #selector(NSResponder.moveUp(_:)): onMove(-1); return true
            default: return false
            }
        }
    }
}

private final class FocusedSearchField: NSSearchField {
    var focusOnAttach = false
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        guard window != nil, focusOnAttach else { return }
        focusOnAttach = false
        DispatchQueue.main.async { [weak self] in
            guard let self, let window = self.window else { return }
            window.makeFirstResponder(self)
        }
    }
}
