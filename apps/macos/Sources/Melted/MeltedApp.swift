import AppKit
import SwiftUI
import MeltedDesignSystem

@main
struct MeltedApp: App {
    @StateObject private var model = WorkspaceModel()
    @AppStorage("appearance") private var appearance = "system"
    @AppStorage("readingScale") private var readingScale = 1.0
    var body: some Scene {
        Window("资讯", id: "main") {
            WorkspaceView(model: model)
                .frame(minWidth: MeltedLayout.minimumWidth, minHeight: MeltedLayout.minimumHeight)
                .preferredColorScheme(appearance == "system" ? nil : appearance == "dark" ? .dark : .light)
                .task { await model.bootstrap() }
        }
        .defaultSize(width: MeltedLayout.initialWidth, height: MeltedLayout.initialHeight)
        .windowResizability(.contentMinSize)
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(after: .textEditing) {
                Button("搜索资讯") { model.searchRequest += 1 }.keyboardShortcut("f").disabled(!model.connected)
                Button("刷新资讯") { Task { await model.reload() } }.keyboardShortcut("r").disabled(!model.connected)
            }
            CommandGroup(after: .toolbar) {
                Button("紧凑阅读窗口") { resizeReader(width: MeltedLayout.minimumWidth, height: MeltedLayout.minimumHeight) }
                Button("标准阅读窗口") { resizeReader(width: MeltedLayout.initialWidth, height: MeltedLayout.initialHeight) }
                Divider()
                Button("放大阅读文字") { readingScale = min(2, readingScale + 0.1) }.keyboardShortcut("+")
                Button("缩小阅读文字") { readingScale = max(1, readingScale - 0.1) }.keyboardShortcut("-")
                Button("还原阅读文字") { readingScale = 1 }.keyboardShortcut("0")
            }
        }
        Settings {
            SettingsView(model: model)
                .preferredColorScheme(appearance == "system" ? nil : appearance == "dark" ? .dark : .light)
        }
    }
    private func resizeReader(width: CGFloat, height: CGFloat) {
        guard let window = NSApp.windows.first(where: { $0.identifier?.rawValue == "main" || $0.title == "资讯" }) else { return }
        window.setContentSize(NSSize(width: width, height: height))
        window.makeKeyAndOrderFront(nil)
    }
}
