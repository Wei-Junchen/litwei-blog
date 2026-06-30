#!/usr/bin/env bash
set -euo pipefail
section="${1:-posts}"
title="${2:-}"
if [ -z "$title" ]; then
  echo "Usage: $0 <posts|tech|game|life> \"Article Title\"" >&2
  exit 1
fi
slug=$(printf '%s' "$title" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9一-龥]+/-/g; s/^-+|-+$//g')
file="content/${section}/${slug}.md"
mkdir -p "content/${section}"
cat > "$file" <<POST
---
title: "$title"
date: $(date +%Y-%m-%dT%H:%M:%S%z)
draft: true
tags: []
categories: ["$section"]
summary: ""
cover: ""
comments: true
---

POST
echo "$file"
