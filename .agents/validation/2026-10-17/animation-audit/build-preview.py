from pathlib import Path
import shutil, subprocess, plistlib
repo = Path(__file__).resolve().parents[4]
work = repo / ".local/animation-audit-preview"
source = work / "Sources/Preview"
if source.exists(): shutil.rmtree(source)
shutil.copytree(repo / "apps/macos/Sources/Melted", source)
(source / "App/MeltedApp.swift").unlink()
shutil.copy(Path(__file__).with_name("Preview.swift"), source / "Preview.swift")
work.mkdir(parents=True, exist_ok=True)
(work / "Package.swift").write_text('''// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "AnimationAudit", platforms: [.macOS(.v14)], dependencies: [.package(path: "../../apps/apple/Packages/MeltedKit")], targets: [.executableTarget(name: "Preview", dependencies: [.product(name: "MeltedDesignSystem", package: "MeltedKit"), .product(name: "MeltedCore", package: "MeltedKit"), .product(name: "MeltedRendering", package: "MeltedKit")])])
''')
# Reuse the existing dependency checkout/cache; product sources are copied afresh.
subprocess.run(["swift", "build", "--package-path", str(work), "--scratch-path", str(repo / ".local/connection-notice-preview/.build")], check=True)
binpath = subprocess.check_output(["swift", "build", "--package-path", str(work), "--scratch-path", str(repo / ".local/connection-notice-preview/.build"), "--show-bin-path"], text=True).strip()
app = repo / "build/AnimationAudit.app/Contents"
(app / "MacOS").mkdir(parents=True, exist_ok=True)
(app / "Resources").mkdir(exist_ok=True)
shutil.copy(Path(binpath) / "Preview", app / "MacOS/Preview")
shutil.copy(repo / "contracts/fixtures/briefing.json", app / "Resources/briefing.json")
for bundle in Path(binpath).glob("*.bundle"):
 shutil.copytree(bundle, app / "Resources" / bundle.name, dirs_exist_ok=True)
(app / "Info.plist").write_bytes(plistlib.dumps({"CFBundleIdentifier":"org.melted.animation-audit", "CFBundleName":"AnimationAudit", "CFBundleExecutable":"Preview", "CFBundlePackageType":"APPL", "LSMinimumSystemVersion":"14.0", "NSHighResolutionCapable":True}))
subprocess.run(["codesign", "--force", "--sign", "-", str(app.parent)], check=True)
print(app.parent)
