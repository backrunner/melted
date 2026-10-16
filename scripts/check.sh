#!/bin/sh
# SPDX-FileCopyrightText: 2026 Melted contributors
# SPDX-License-Identifier: GPL-3.0-or-later
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo"
python3 .agents/skills/melted-guard/scripts/check_design.py --repo .
python3 scripts/generate-design-tokens.py --check
python3 scripts/generate-brand-assets.py --check
swift scripts/generate-app-icon.swift --check
python3 -m unittest discover -s scripts/tests
python3 scripts/dev.py check
cd "$repo/apps/apple/Packages/MeltedKit"
swift test
cd "$repo/apps/macos"
swift test
cd "$repo"
sh scripts/build-macos.sh
