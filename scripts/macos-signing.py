#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Melted contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Pin this checkout's development identity without exporting private keys."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys

CONFIG = Path(__file__).resolve().parent.parent / '.local/macos-signing.json'


def resolve(identities, pinned=None, requested=None):
    if requested == '-':
        return {'identity': '-', 'name': 'Explicit ad-hoc signing'}
    selector = requested or (pinned or {}).get('identity')
    if selector == '-':
        return pinned
    matches = [item for item in identities if (
        selector in (item['identity'], item['name']) if selector
        else item['name'].startswith('Apple Development: ')
    )]
    if len(matches) != 1:
        reason = 'Pinned identity is unavailable.' if pinned and not requested else 'Select exactly one valid signing identity.'
        raise ValueError(reason + ' Run security find-identity -v -p codesigning, then python3 scripts/macos-signing.py --configure <SHA-1>. No automatic ad-hoc fallback.')
    return matches[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--configure', metavar='SHA-1', help='Explicitly change the local identity; - opts into ad-hoc signing.')
    args = parser.parse_args()
    output = subprocess.run(['security', 'find-identity', '-v', '-p', 'codesigning'], check=True, capture_output=True, text=True).stdout
    identities = [{'identity': fingerprint, 'name': name} for fingerprint, name in re.findall(r'\) ([0-9A-F]{40}) "([^"]+)"', output)]
    pinned = json.loads(CONFIG.read_text()) if CONFIG.exists() else None
    chosen = resolve(identities, pinned, args.configure)
    if pinned != chosen:
        CONFIG.parent.mkdir(parents=True, exist_ok=True)
        CONFIG.write_text(json.dumps(chosen, indent=2) + '\n')
        print(f"Pinned development signer: {chosen['name']} ({CONFIG})", file=sys.stderr)
    if chosen['identity'] == '-':
        print('Ad-hoc signing changes app identity after rebuilds and may repeat Keychain prompts.', file=sys.stderr)
    print(chosen['identity'])


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        sys.exit(str(error))
