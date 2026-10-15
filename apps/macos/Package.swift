// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Melted",
    platforms: [.macOS(.v14)],
    dependencies: [.package(path: "../apple/Packages/MeltedKit")],
    targets: [.executableTarget(name: "Melted", dependencies: [
        .product(name: "MeltedCore", package: "MeltedKit"),
        .product(name: "MeltedDesignSystem", package: "MeltedKit"),
        .product(name: "MeltedRendering", package: "MeltedKit")
    ]), .testTarget(name: "MeltedTests", dependencies: ["Melted"])]
)
