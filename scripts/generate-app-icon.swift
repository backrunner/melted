#!/usr/bin/env swift
// SPDX-FileCopyrightText: 2026 Melted contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// macOS AppKit renders the original vector at every required icon size.
import AppKit
import Foundation

let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let destination = root.appendingPathComponent("assets/app-icon")
let checking = CommandLine.arguments.contains("--check")

func color(_ hex: String) -> CGColor {
    let number = UInt32(hex.dropFirst(), radix: 16)!
    return CGColor(colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!, components: [
        CGFloat((number >> 16) & 255) / 255, CGFloat((number >> 8) & 255) / 255,
        CGFloat(number & 255) / 255, 1
    ])!
}

func raster(_ side: Int, mark: CGPath, paper: CGColor, ink: CGColor) throws -> Data {
    let context = CGContext(data: nil, width: side, height: side, bitsPerComponent: 8,
                            bytesPerRow: side * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let scale = CGFloat(side) / 1024
    context.scaleBy(x: scale, y: scale)
    context.translateBy(x: 0, y: 1024)
    context.scaleBy(x: 1, y: -1)
    context.saveGState()
    context.setShadow(offset: CGSize(width: 0, height: 8), blur: 16,
                      color: CGColor(gray: 0, alpha: 0.14))
    context.setFillColor(paper)
    context.addPath(CGPath(roundedRect: CGRect(x: 80, y: 80, width: 864, height: 864),
                           cornerWidth: 196, cornerHeight: 196, transform: nil))
    context.fillPath()
    context.restoreGState()
    context.setFillColor(ink)
    context.addPath(mark)
    context.fillPath()
    let bitmap = NSBitmapImageRep(cgImage: context.makeImage()!)
    guard let png = bitmap.representation(using: .png, properties: [:]) else { throw CocoaError(.fileWriteUnknown) }
    return png
}

do {
    let source = try String(contentsOf: root.appendingPathComponent("assets/brand/mark.svg"), encoding: .utf8)
    let expression = try NSRegularExpression(pattern: #"<path d="([^"]+)""#)
    guard let match = expression.firstMatch(in: source, range: NSRange(source.startIndex..., in: source)),
          let range = Range(match.range(at: 1), in: source) else { throw CocoaError(.fileReadCorruptFile) }
    let geometry = String(source[range])
    let commands = try NSRegularExpression(pattern: #"([MLCZ])\s*([^MLCZ]*)"#)
    let mark = CGMutablePath()
    for match in commands.matches(in: geometry, range: NSRange(geometry.startIndex..., in: geometry)) {
        let command = String(geometry[Range(match.range(at: 1), in: geometry)!])
        let numbers = geometry[Range(match.range(at: 2), in: geometry)!].split(whereSeparator: { $0.isWhitespace }).compactMap { Double($0) }
        func point(_ index: Int) -> CGPoint { CGPoint(x: 160 + numbers[index] * 22, y: 148 + numbers[index + 1] * 22) }
        switch command {
        case "M": mark.move(to: point(0))
        case "L": mark.addLine(to: point(0))
        case "C": mark.addCurve(to: point(4), control1: point(0), control2: point(2))
        case "Z": mark.closeSubpath()
        default: throw CocoaError(.fileReadCorruptFile)
        }
    }
    let data = try Data(contentsOf: root.appendingPathComponent(".agents/design/tokens.json"))
    let tokens = try JSONSerialization.jsonObject(with: data) as! [String: Any]
    let themes = tokens["themes"] as! [String: [String: String]]
    let paper = themes["light"]!["surface"]!, ink = themes["light"]!["accent"]!
    let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("melted-icon-\(UUID().uuidString)")
    let iconset = temporary.appendingPathComponent("Melted.iconset")
    try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: temporary) }
    for logical in [16, 32, 128, 256, 512] {
        for factor in [1, 2] {
            let png = try raster(logical * factor, mark: mark, paper: color(paper), ink: color(ink))
            let filename = "icon_\(logical)x\(logical)\(factor == 2 ? "@2x" : "").png"
            try png.write(to: iconset.appendingPathComponent(filename))
        }
    }
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
    let icns = temporary.appendingPathComponent("AppIcon.icns")
    process.arguments = ["-c", "icns", iconset.path, "-o", icns.path]
    try process.run()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else { throw CocoaError(.fileWriteUnknown) }
    let svg = """
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-label="Melted App icon">
      <title>Melted</title>
      <defs><filter id="shadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-opacity="0.14"/></filter></defs>
      <rect x="80" y="80" width="864" height="864" rx="196" fill="\(paper)" filter="url(#shadow)"/>
      <path d="\(geometry)" transform="translate(160 148) scale(22)" fill="\(ink)"/>
    </svg>

    """
    let outputs = ["AppIcon.svg": Data(svg.utf8), "AppIcon.png": try Data(contentsOf: iconset.appendingPathComponent("icon_512x512@2x.png")),
                   "AppIcon.icns": try Data(contentsOf: icns)]
    if !checking { try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true) }
    for (filename, content) in outputs {
        let target = destination.appendingPathComponent(filename)
        if checking {
            guard try Data(contentsOf: target) == content else {
                fputs("App icon drift: \(target.path)\n", stderr)
                exit(1)
            }
        } else { try content.write(to: target) }
    }
    print(checking ? "PASS: app icon matches brand geometry and palette." : "Generated SVG, 1024 PNG and multi-resolution ICNS in assets/app-icon.")
} catch {
    fputs("App icon generation failed: \(error)\n", stderr)
    exit(1)
}
