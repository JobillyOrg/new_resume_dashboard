#!/usr/bin/env python3
"""Local static server + Gemini proxy for the ATS resume dashboard."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"

MODELS = [
    os.environ.get("GEMINI_MODEL", "").strip(),
    "gemini-2.5-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-2.0-flash",
    "gemini-2.5-flash",
]


def load_env() -> None:
    if not ENV_PATH.exists():
        return
    for raw in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env()
API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
PORT = int(os.environ.get("PORT", "8765"))
os.chdir(ROOT)


def gemini_generate(prompt: str, as_json: bool, max_tokens: int) -> dict:
    if not API_KEY:
        raise RuntimeError("GEMINI_API_KEY is missing. Add it to .env")

    last_error = None
    models = [m for m in MODELS if m]
    # de-dupe while preserving order
    seen = set()
    models = [m for m in models if not (m in seen or seen.add(m))]

    for model in models:
        body = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "maxOutputTokens": max_tokens,
                "temperature": 0.0,
                "topP": 1.0,
                "topK": 1,
            },
        }
        if as_json:
            body["generationConfig"]["responseMimeType"] = "application/json"

        req = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": API_KEY,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            text = extract_text(payload)
            if not text.strip():
                last_error = f"{model} returned empty text"
                continue
            return {"ok": True, "model": model, "text": text, "raw": payload}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:800]
            last_error = f"{model} HTTP {exc.code}: {detail}"
            # try next model on 404 / unsupported
            if exc.code in (404, 400):
                continue
            raise RuntimeError(last_error) from exc
        except Exception as exc:  # noqa: BLE001
            last_error = f"{model}: {exc}"
            continue
    raise RuntimeError(last_error or "All Gemini models failed")


def extract_text(payload: dict) -> str:
    candidates = payload.get("candidates") or []
    if not candidates:
        feedback = payload.get("promptFeedback") or {}
        raise RuntimeError(f"Gemini blocked or empty response: {feedback}")
    parts = (candidates[0].get("content") or {}).get("parts") or []
    return "".join(part.get("text") or "" for part in parts)


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] == "/api/health":
            self._json(
                200,
                {
                    "ok": True,
                    "gemini": bool(API_KEY),
                    "project": os.environ.get("GEMINI_PROJECT", ""),
                    "keyName": os.environ.get("GEMINI_KEY_NAME", ""),
                },
            )
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] != "/api/gemini":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length") or 0)
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._json(400, {"ok": False, "error": "Invalid JSON body"})
            return

        prompt = (data.get("prompt") or "").strip()
        if not prompt:
            self._json(400, {"ok": False, "error": "prompt is required"})
            return
        as_json = bool(data.get("json"))
        max_tokens = int(data.get("maxTokens") or (2048 if as_json else 8192))
        max_tokens = max(256, min(max_tokens, 8192))

        try:
            result = gemini_generate(prompt, as_json, max_tokens)
            self._json(200, result)
        except Exception as exc:  # noqa: BLE001
            self._json(502, {"ok": False, "error": str(exc)})

    def _json(self, status: int, payload: dict) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


if __name__ == "__main__":
    if not API_KEY:
        print("ERROR: GEMINI_API_KEY missing. Put it in .env")
        sys.exit(1)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Jobilly.AI Resume Dashboard  http://127.0.0.1:{PORT}")
    print("Gemini proxy          /api/gemini")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
