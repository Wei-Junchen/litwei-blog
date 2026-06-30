#!/usr/bin/env bash
set -euo pipefail
python3 scripts/normalize-markdown.py
rm -rf public
hugo --minify
