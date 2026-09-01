#!/usr/bin/env python3
"""Local static server + Gemini proxy for the ATS resume dashboard."""
from __future__ import annotations

import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from api_core import (
    handle_extract_resume_request,
    handle_gemini_request,
    health_payload,
    load_env,
)

ROOT = Path(__file__).resolve().parent
load_env()
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8765"))
IS_PRODUCTION = os.environ.get("ENV", "").strip().lower() in ("production", "prod")
os.chdir(ROOT)


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        if IS_PRODUCTION:
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        path = self.path.split("?", 1)[0]
        if path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        elif IS_PRODUCTION and path.endswith((".js", ".css", ".png", ".jpg", ".jpeg", ".webp", ".ico", ".woff2")):
            self.send_header("Cache-Control", "public, max-age=3600")
        else:
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] == "/api/health":
            self._json(200, health_payload())
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        length = int(self.headers.get("Content-Length") or 0)
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._json(400, {"ok": False, "error": "Invalid JSON body"})
            return

        if path == "/api/extract-resume":
            status, payload = handle_extract_resume_request(data)
            self._json(status, payload)
            return
        if path == "/api/gemini":
            status, payload = handle_gemini_request(data)
            self._json(status, payload)
            return
        self.send_error(404)

    def _json(self, status: int, payload: dict) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


if __name__ == "__main__":
    from api_core import api_key

    if not api_key():
        print("ERROR: GEMINI_API_KEY missing. Put it in .env")
        sys.exit(1)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    mode = "production" if IS_PRODUCTION else "development"
    print(f"Jobilly.AI Resume Dashboard  http://{HOST}:{PORT}  ({mode})")
    print("Gemini proxy          /api/gemini")
    print("Resume extract        /api/extract-resume")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
