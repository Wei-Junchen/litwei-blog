#!/usr/bin/env bash
set -euo pipefail
hugo server -D --bind 127.0.0.1 --baseURL http://localhost:1313/
