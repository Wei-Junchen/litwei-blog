#!/usr/bin/env python3
"""Normalize Hugo Markdown files before build.

Goal: author Markdown simply:

# My Article

content...

The script generates/updates minimal front matter:
- title: first H1, else existing title, else filename
- date: existing date, else YYYY_MM_DD / YYYY-MM-DD in filename, else file mtime
- draft: false when missing
- comments: true when missing
- categories: section name when missing

It does not remove the Markdown H1; the visible article title should come from Markdown.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
DATE_IN_NAME = re.compile(r"(?P<y>20\d{2})[-_](?P<m>\d{1,2})[-_](?P<d>\d{1,2})")
H1 = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)


def split_front_matter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---\n"):
        return {}, text.lstrip()
    end = text.find("\n---", 4)
    if end == -1:
        return {}, text.lstrip()
    raw = text[4:end].strip().splitlines()
    body = text[end + len("\n---"):].lstrip("\n")
    data: dict[str, str] = {}
    for line in raw:
        if ":" not in line or line.startswith(" "):
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip()
    return data, body


def quote(value: str) -> str:
    escaped = value.replace('"', '\\"')
    return f'"{escaped}"'


def title_from(path: Path, body: str, fm: dict[str, str]) -> str:
    match = H1.search(body)
    if match:
        return match.group(1).strip()
    if fm.get("title"):
        return fm["title"].strip().strip('"\'')
    name = path.stem
    name = DATE_IN_NAME.sub("", name).strip("-_ ") or path.stem
    return name.replace("_", " ").replace("-", " ").strip()


def date_from(path: Path, fm: dict[str, str]) -> str:
    if fm.get("date"):
        return fm["date"].strip().strip('"\'')
    match = DATE_IN_NAME.search(path.stem)
    if match:
        y = int(match.group("y"))
        m = int(match.group("m"))
        d = int(match.group("d"))
        return f"{y:04d}-{m:02d}-{d:02d}T00:00:00+08:00"
    ts = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).astimezone()
    return ts.strftime("%Y-%m-%dT%H:%M:%S%z")


def section_for(path: Path) -> str:
    rel = path.relative_to(CONTENT)
    return rel.parts[0] if len(rel.parts) > 1 else "posts"


def normalize(path: Path) -> bool:
    if path.name == "_index.md":
        return False
    original = path.read_text(encoding="utf-8")
    fm, body = split_front_matter(original)
    section = section_for(path)

    title = title_from(path, body, fm)
    date = date_from(path, fm)
    draft = fm.get("draft", "false")
    comments = fm.get("comments", "true")
    tags = fm.get("tags", "[]")
    categories = fm.get("categories", f'[{quote(section)}]')
    summary = fm.get("summary", "\"\"")
    cover = fm.get("cover", "\"\"")

    front_matter = [
        "---",
        f"title: {quote(title)}",
        f"date: {date}",
        f"draft: {draft}",
        f"tags: {tags}",
        f"categories: {categories}",
        f"summary: {summary}",
        f"cover: {cover}",
        f"comments: {comments}",
    ]
    if "math" in fm:
        front_matter.append(f"math: {fm['math']}")

    new = "\n".join(front_matter + [
        "---",
        "",
        body.rstrip(),
        "",
    ])
    if new != original:
        path.write_text(new, encoding="utf-8")
        return True
    return False


def main() -> None:
    changed = []
    for path in sorted(CONTENT.rglob("*.md")):
        if normalize(path):
            changed.append(path.relative_to(ROOT))
    if changed:
        print("normalized markdown:")
        for path in changed:
            print(f"- {path}")


if __name__ == "__main__":
    main()
