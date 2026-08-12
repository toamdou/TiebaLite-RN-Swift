// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "TiebaNativePrototype",
    platforms: [
        .iOS(.v17),
    ],
    products: [
        .library(
            name: "TiebaNativePrototype",
            targets: ["TiebaNativePrototype"]
        ),
        .executable(
            name: "TiebaNativePrototypeApp",
            targets: ["TiebaNativePrototypeApp"]
        ),
    ],
    targets: [
        .target(
            name: "TiebaNativePrototype",
            path: "Sources/TiebaNativePrototype"
        ),
        .executableTarget(
            name: "TiebaNativePrototypeApp",
            dependencies: ["TiebaNativePrototype"],
            path: "App"
        ),
    ]
)
