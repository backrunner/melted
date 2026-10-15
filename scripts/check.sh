#!/bin/sh
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo"
python3 .agents/skills/melted-guard/scripts/check_design.py --repo .
python3 scripts/generate-design-tokens.py --check
python3 scripts/dev.py check
cd "$repo/apps/apple/Packages/MeltedKit"
swift test
cd "$repo"
sh scripts/build-macos.sh
