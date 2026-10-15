#!/usr/bin/env python3
"""Read-only checks for Melted design docs, not native UI or runtime validation."""
import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


class EmbeddedTokens(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = False
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag == "script" and dict(attrs).get("id") == "design-tokens":
            self.active = True

    def handle_endtag(self, tag):
        if tag == "script":
            self.active = False

    def handle_data(self, data):
        if self.active:
            self.parts.append(data)


def luminance(color):
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
        raise ValueError(f"Expected opaque sRGB hex: {color}")
    rgb = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb]
    return sum(v * w for v, w in zip(linear, (.2126, .7152, .0722)))


def run(repo):
    errors, ratios = [], []
    design = repo / ".agents/design"
    tokens = json.loads((design / "tokens.json").read_text())
    for theme, colors in tokens["themes"].items():
        for check in tokens["contrastChecks"]:
            fg, bg = check["foreground"], check["background"]
            a, b = sorted((luminance(colors[fg]), luminance(colors[bg])))
            ratio = (b + .05) / (a + .05)
            ratios.append(ratio)
            if ratio < check["minimum"]:
                errors.append(f"{theme} {fg}/{bg}: {ratio:.2f} < {check['minimum']}")
    parser = EmbeddedTokens()
    parser.feed((design / "reference.html").read_text())
    if json.loads("".join(parser.parts)) != tokens:
        errors.append("reference.html embedded tokens differ from tokens.json")

    docs = sorted((repo / ".agents").rglob("*.md")) + [repo / "AGENTS.md"]
    links = examples = 0
    for doc in docs:
        content = doc.read_text()
        for match in re.finditer(r"^```json\s*\n(.*?)^```\s*$", content, re.M | re.S):
            examples += 1
            try:
                json.loads(match.group(1))
            except json.JSONDecodeError as exc:
                errors.append(f"{doc.relative_to(repo)} JSON example: {exc}")
        prose = re.sub(r"^```[^\n]*\n.*?^```\s*$", "", content, flags=re.M | re.S)
        # This repository uses ordinary inline links; not a full Markdown parser.
        for match in re.finditer(r"\[[^\]\n]*\]\((<[^>]+>|[^)\s]+)\s*\)", prose):
            target = match.group(1).strip("<>")
            url = urlsplit(target)
            if url.scheme or url.netloc or not url.path:
                continue
            links += 1
            path = doc.parent / unquote(url.path)
            if not path.exists():
                errors.append(f"{doc.relative_to(repo)} missing link: {target}")
    print(f"Checked {len(docs)} Markdown files, {links} local links, {examples} JSON examples.")
    print(f"Checked {len(ratios)} color pairs; minimum contrast {min(ratios):.2f}:1.")
    print("Checked reference page token parity. Anchors, external URLs and native UI are not checked.")
    for error in errors:
        print(f"FAIL: {error}", file=sys.stderr)
    if not errors:
        print("PASS: static design checks.")
    return 1 if errors else 0


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--repo", type=Path, default=Path.cwd(), help="Melted repository root")
    args = cli.parse_args()
    try:
        sys.exit(run(args.repo.resolve()))
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        sys.exit(1)
