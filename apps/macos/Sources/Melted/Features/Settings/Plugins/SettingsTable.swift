// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import AppKit
import SwiftUI
import MeltedDesignSystem

struct SettingsTableColumn: Equatable { let id, title: String; let width: CGFloat }
struct SettingsTableCell: Equatable { let text: String; let monospaced: Bool }
struct SettingsTableRow: Equatable { let id, revision: String; let cells: [SettingsTableCell] }

/// AppKit keeps column resizing, horizontal scrolling and keyboard selection native.
/// A row view supplies the same warm selection surface used by the main window.
struct SettingsTable<Actions: View>: NSViewRepresentable {
    let columns: [SettingsTableColumn]
    let rows: [SettingsTableRow]
    @Binding var selection: String?
    @ViewBuilder let actions: (String) -> Actions
    @Environment(\.colorScheme) private var scheme
    @Environment(\.isEnabled) private var enabled
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSScrollView(), table = NSTableView()
        scroll.hasVerticalScroller = true; scroll.hasHorizontalScroller = true; scroll.autohidesScrollers = true
        scroll.documentView = table; table.delegate = context.coordinator; table.dataSource = context.coordinator
        table.style = .plain
        table.allowsMultipleSelection = false; table.allowsEmptySelection = true
        table.columnAutoresizingStyle = .uniformColumnAutoresizingStyle
        table.autoresizingMask = [.width]
        table.rowHeight = MeltedPanelMetrics.tableRow
        table.intercellSpacing = NSSize(width: 0, height: 0)
        table.gridStyleMask = [.solidHorizontalGridLineMask]
        table.headerView = NSTableHeaderView(frame: NSRect(x: 0, y: 0, width: 0, height: MeltedPanelMetrics.controlHeight))
        return scroll
    }
    func updateNSView(_ scroll: NSScrollView, context: Context) {
        guard let table = scroll.documentView as? NSTableView else { return }
        context.coordinator.updating = true
        defer { context.coordinator.updating = false }
        context.coordinator.parent = self
        let palette = MeltedPalette(scheme)
        scroll.appearance = NSAppearance(named: scheme == .dark ? .darkAqua : .aqua)
        table.backgroundColor = NSColor(palette.surface); scroll.backgroundColor = table.backgroundColor
        table.gridColor = NSColor(palette.separator)
        let definitions = columns + [SettingsTableColumn(id: "__actions", title: "操作", width: MeltedPanelMetrics.columnActions)]
        if table.tableColumns.map({ $0.identifier.rawValue }) != definitions.map(\.id) {
            for column in table.tableColumns { table.removeTableColumn(column) }
            for definition in definitions {
                let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier(definition.id))
                column.minWidth = definition.width; column.width = definition.width
                column.headerCell = SettingsHeaderCell(textCell: definition.title)
                table.addTableColumn(column)
            }
            table.sizeToFit()
        }
        for (column, definition) in zip(table.tableColumns, definitions) {
            if let header = column.headerCell as? SettingsHeaderCell {
                header.title = definition.title; header.palette = palette
            }
        }
        table.headerView?.needsDisplay = true
        table.isEnabled = enabled
        if context.coordinator.lastRows != rows || context.coordinator.lastColumns != columns || context.coordinator.lastScheme != scheme || context.coordinator.lastEnabled != enabled {
            table.reloadData()
            context.coordinator.lastRows = rows; context.coordinator.lastColumns = columns
            context.coordinator.lastScheme = scheme; context.coordinator.lastEnabled = enabled
        }
        if let index = rows.firstIndex(where: { $0.id == selection }) { table.selectRowIndexes(IndexSet(integer: index), byExtendingSelection: false) }
        else { table.deselectAll(nil) }
    }
    @MainActor final class Coordinator: NSObject, NSTableViewDataSource, NSTableViewDelegate {
        var parent: SettingsTable
        var updating = false
        var lastRows: [SettingsTableRow] = []
        var lastColumns: [SettingsTableColumn] = []
        var lastScheme: ColorScheme?
        var lastEnabled: Bool?

        init(_ parent: SettingsTable) { self.parent = parent }
        func numberOfRows(in tableView: NSTableView) -> Int { parent.rows.count }
        func tableViewSelectionDidChange(_ notification: Notification) {
            guard !updating, let table = notification.object as? NSTableView else { return }
            parent.selection = parent.rows.indices.contains(table.selectedRow) ? parent.rows[table.selectedRow].id : nil
        }
        func tableView(_ tableView: NSTableView, rowViewForRow row: Int) -> NSTableRowView? {
            let view = SettingsTableRowView(); view.selectionColor = NSColor(MeltedPalette(parent.scheme).selection)
            return view
        }
        func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
            guard parent.rows.indices.contains(row), let tableColumn else { return nil }
            let item = parent.rows[row], palette = MeltedPalette(parent.scheme)
            if tableColumn.identifier.rawValue == "__actions" {
                return NSHostingView(rootView: parent.actions(item.id).disabled(!parent.enabled).font(.system(size: MeltedType.metadata)).foregroundStyle(palette.text).tint(palette.accent).environment(\.colorScheme, parent.scheme))
            }
            guard let index = parent.columns.firstIndex(where: { $0.id == tableColumn.identifier.rawValue }), item.cells.indices.contains(index) else { return nil }
            let value = item.cells[index], cell = NSTableCellView(), label = NSTextField(labelWithString: value.text)
            label.font = value.monospaced ? .monospacedSystemFont(ofSize: MeltedType.metadata, weight: .regular) : .systemFont(ofSize: MeltedType.metadata)
            label.textColor = NSColor(palette.text); label.lineBreakMode = .byTruncatingTail; label.toolTip = value.text
            label.translatesAutoresizingMaskIntoConstraints = false; cell.addSubview(label); cell.textField = label
            NSLayoutConstraint.activate([label.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: MeltedReading.actionGap), label.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -MeltedReading.actionGap), label.centerYAnchor.constraint(equalTo: cell.centerYAnchor)])
            return cell
        }
    }
}
private final class SettingsTableRowView: NSTableRowView {
    var selectionColor = NSColor.clear
    override var interiorBackgroundStyle: NSView.BackgroundStyle { .normal }
    override func drawSelection(in dirtyRect: NSRect) {
        selectionColor.setFill(); NSBezierPath(rect: bounds).fill()
    }
}
private final class SettingsHeaderCell: NSTableHeaderCell {
    var palette = MeltedPalette(.light)
    override func draw(withFrame cellFrame: NSRect, in controlView: NSView) {
        NSColor(palette.surface).setFill(); cellFrame.fill()
        let text = NSAttributedString(string: title, attributes: [.foregroundColor: NSColor(palette.secondary), .font: NSFont.systemFont(ofSize: MeltedType.metadata, weight: .medium)])
        text.draw(at: NSPoint(x: cellFrame.minX + MeltedReading.actionGap, y: cellFrame.midY - text.size().height / 2))
    }
}
