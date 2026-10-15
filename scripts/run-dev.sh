#!/bin/sh
# SPDX-FileCopyrightText: 2026 Melted contributors
# SPDX-License-Identifier: GPL-3.0-or-later
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
exec python3 "$repo/scripts/dev.py" up
