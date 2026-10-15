// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MeltedKit",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [
        .library(name: "MeltedCore", targets: ["MeltedCore"]),
        .library(name: "MeltedDesignSystem", targets: ["MeltedDesignSystem"]),
        .library(name: "MeltedRendering", targets: ["MeltedRendering"])
    ],
    dependencies: [.package(url: "https://github.com/swiftlang/swift-markdown.git", exact: "0.7.3")],
    targets: [
        .target(name: "MeltedCore"),
        .target(name: "MeltedDesignSystem", dependencies: ["MeltedCore"]),
        .target(name: "MeltedRendering", dependencies: ["MeltedCore", "MeltedDesignSystem", .product(name: "Markdown", package: "swift-markdown")]),
        .testTarget(name: "MeltedCoreTests", dependencies: ["MeltedCore", "MeltedRendering"])
    ]
)
