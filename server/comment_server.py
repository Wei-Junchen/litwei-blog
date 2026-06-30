#!/usr/bin/env python3
"""Tiny local comment service for Litwei Blog.

- No database.
- Stores comments as JSON Lines.
- Uses only Python standard library.
- Intended to run behind Nginx on 127.0.0.1.
"""

from __future__ import annotations

import cgi
import html
import json
import os
import time
import urllib.parse
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

HOST = os.environ.get("COMMENT_HOST", "127.0.0.1")
PORT = int(os.environ.get("COMMENT_PORT", "8787"))
COMMENTS_FILE = Path(os.environ.get("COMMENTS_FILE", "/var/lib/litwei-blog/comments.jsonl"))
MAX_BODY_BYTES = int(os.environ.get("COMMENT_MAX_BODY_BYTES", "8192"))
RATE_LIMIT_SECONDS = int(os.environ.get("COMMENT_RATE_LIMIT_SECONDS", "20"))
MAX_PUBLIC_COMMENTS = int(os.environ.get("COMMENT_MAX_PUBLIC_COMMENTS", "100"))

_last_submit_by_ip: dict[str, float] = {}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clamp(value: str, limit: int) -> str:
    value = value.strip()
    if len(value) > limit:
        return value[:limit]
    return value


def public_comment(row: dict[str, Any]) -> dict[str, Any]:
    name = clamp(str(row.get("name") or ""), 80) or "anonymous"
    return {
        "created_at": row.get("created_at", ""),
        "page_url": row.get("page_url", ""),
        "page_path": row.get("page_path", ""),
        "page_title": row.get("page_title", ""),
        "name": html.escape(name),
        "comment": html.escape(str(row.get("comment") or "")),
    }


def read_comments(page_path: str) -> list[dict[str, Any]]:
    if not COMMENTS_FILE.exists():
        return []

    items: list[dict[str, Any]] = []
    with COMMENTS_FILE.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if page_path and row.get("page_path") != page_path:
                continue
            items.append(public_comment(row))
    return items[-MAX_PUBLIC_COMMENTS:]


class Handler(BaseHTTPRequestHandler):
    server_version = "LitweiCommentServer/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        print("[%s] %s - %s" % (now_iso(), self.client_address[0], fmt % args), flush=True)

    def send_json(self, status: int, payload: dict[str, Any] | list[Any]) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/api/comments":
            self.send_json(404, {"ok": False, "error": "not found"})
            return

        query = urllib.parse.parse_qs(parsed.query)
        page_path = clamp(query.get("path", [""])[0], 300)
        self.send_json(200, {"ok": True, "comments": read_comments(page_path)})

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/api/comments":
            self.send_json(404, {"ok": False, "error": "not found"})
            return

        ip = self.headers.get("X-Forwarded-For", self.client_address[0]).split(",")[0].strip()
        ts = time.time()
        if ts - _last_submit_by_ip.get(ip, 0) < RATE_LIMIT_SECONDS:
            self.send_json(429, {"ok": False, "error": "too many comments, please wait"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY_BYTES:
            self.send_json(400, {"ok": False, "error": "invalid body size"})
            return

        body = self.rfile.read(length)
        ctype = self.headers.get("Content-Type", "")
        if "application/json" in ctype:
            try:
                form = json.loads(body.decode("utf-8", errors="replace"))
            except json.JSONDecodeError:
                self.send_json(400, {"ok": False, "error": "invalid json"})
                return
        elif "multipart/form-data" in ctype:
            environ = {
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": ctype,
                "CONTENT_LENGTH": str(length),
            }
            parsed_form = cgi.FieldStorage(
                fp=__import__("io").BytesIO(body),
                environ=environ,
                keep_blank_values=True,
            )
            form = {}
            for key in parsed_form.keys():
                item = parsed_form[key]
                if isinstance(item, list):
                    item = item[-1]
                form[key] = item.value if hasattr(item, "value") else ""
        else:
            raw = body.decode("utf-8", errors="replace")
            parsed_form = urllib.parse.parse_qs(raw, keep_blank_values=True)
            form = {k: v[-1] if v else "" for k, v in parsed_form.items()}

        # Honeypot: pretend success, but do not store.
        if str(form.get("_gotcha", "")).strip():
            self.send_json(200, {"ok": True})
            return

        comment = clamp(str(form.get("comment") or ""), 3000)
        if not comment:
            self.send_json(400, {"ok": False, "error": "comment is required"})
            return

        page_url = clamp(str(form.get("page_url") or ""), 500)
        page_path = clamp(str(form.get("page_path") or ""), 300)
        if not page_path and page_url:
            page_path = urllib.parse.urlparse(page_url).path or "/"

        row = {
            "created_at": now_iso(),
            "page_url": page_url,
            "page_path": page_path,
            "page_title": clamp(str(form.get("page_title") or ""), 200),
            "name": clamp(str(form.get("name") or ""), 80),
            "email": clamp(str(form.get("email") or ""), 200),
            "comment": comment,
            "ip": ip,
            "user_agent": clamp(self.headers.get("User-Agent", ""), 300),
        }

        COMMENTS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with COMMENTS_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

        _last_submit_by_ip[ip] = ts
        self.send_json(201, {"ok": True, "comment": public_comment(row)})


def main() -> None:
    COMMENTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"comment server listening on http://{HOST}:{PORT}", flush=True)
    print(f"comments file: {COMMENTS_FILE}", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
