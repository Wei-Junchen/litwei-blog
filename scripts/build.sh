#!/usr/bin/env bash
set -euo pipefail
rm -rf public
hugo --minify
