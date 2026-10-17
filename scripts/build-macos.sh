#!/bin/sh
# SPDX-FileCopyrightText: 2026 Melted contributors
# SPDX-License-Identifier: GPL-3.0-or-later
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
identity=$(python3 "$repo/scripts/macos-signing.py")
cd "$repo/apps/macos"
swift build -c debug
bin=$(swift build -c debug --show-bin-path)
app="$repo/build/Melted.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$bin/Melted" "$app/Contents/MacOS/Melted"
cp "$repo/assets/app-icon/AppIcon.icns" "$app/Contents/Resources/AppIcon.icns"
# SwiftPM Bundle.module searches the application Resources directory.
for resource in "$bin/"*.bundle; do
    [ -d "$resource" ] || continue
    rm -rf "$app/Contents/Resources/$(basename "$resource")"
    cp -R "$resource" "$app/Contents/Resources/"
done
mkdir -p "$app/Contents/Resources/Licenses"
cp "$repo/LICENSE" "$app/Contents/Resources/Licenses/Melted-GPL-3.0.txt"
cp "$repo/COPYRIGHT" "$app/Contents/Resources/Licenses/Melted-COPYRIGHT.txt"
cp "$repo/THIRD_PARTY.md" "$app/Contents/Resources/Licenses/THIRD_PARTY.md"
cp -f .build/checkouts/swift-markdown/LICENSE.txt "$app/Contents/Resources/Licenses/swift-markdown.txt"
cp -f .build/checkouts/swift-cmark/COPYING "$app/Contents/Resources/Licenses/swift-cmark.txt"
cp -f .build/checkouts/HighlightSwift/LICENSE.md "$app/Contents/Resources/Licenses/HighlightSwift.txt"
cp -f .build/checkouts/HighlightSwift/Sources/HighlightSwift/HighlightJS/LICENSE.md "$app/Contents/Resources/Licenses/highlight.js.txt"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.alkinum.melted</string>
<key>CFBundleName</key><string>Melted</string>
<key>CFBundleDisplayName</key><string>Melted</string>
<key>CFBundleExecutable</key><string>Melted</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.2.0</string>
<key>CFBundleVersion</key><string>8</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>CFBundleURLTypes</key><array><dict><key>CFBundleURLName</key><string>com.alkinum.melted.auth</string><key>CFBundleURLSchemes</key><array><string>melted</string></array></dict></array>
<key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
codesign --force --sign "$identity" --timestamp=none "$app"
codesign --verify --deep --strict "$app"
printf '%s\n' "$app"
