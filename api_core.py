"""Shared API logic for local server and Vercel serverless."""
from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

from resume_extract import extract_resume_text

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


def api_key() -> str:
    return os.environ.get("GEMINI_API_KEY", "").strip()


def health_payload() -> dict:
    return {
        "ok": True,
        "gemini": bool(api_key()),
        "extractResume": True,
        "project": os.environ.get("GEMINI_PROJECT", ""),
        "keyName": os.environ.get("GEMINI_KEY_NAME", ""),
    }


def extract_gemini_text(payload: dict) -> str:
    candidates = payload.get("candidates") or []
    if not candidates:
        feedback = payload.get("promptFeedback") or {}
        raise RuntimeError(f"Gemini blocked or empty response: {feedback}")
    parts = (candidates[0].get("content") or {}).get("parts") or []
    return "".join(part.get("text") or "" for part in parts)


def gemini_generate(prompt: str, as_json: bool, max_tokens: int) -> dict:
    key = api_key()
    if not key:
        raise RuntimeError("GEMINI_API_KEY is missing. Add it to .env or Vercel env vars")

    last_error = None
    models = [m for m in MODELS if m]
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
                "x-goog-api-key": key,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            text = extract_gemini_text(payload)
            if not text.strip():
                last_error = f"{model} returned empty text"
                continue
            return {"ok": True, "model": model, "text": text, "raw": payload}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:800]
            last_error = f"{model} HTTP {exc.code}: {detail}"
            if exc.code in (404, 400):
                continue
            raise RuntimeError(last_error) from exc
        except Exception as exc:  # noqa: BLE001
            last_error = f"{model}: {exc}"
            continue
    raise RuntimeError(last_error or "All Gemini models failed")


def handle_gemini_request(data: dict) -> tuple[int, dict]:
    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        return 400, {"ok": False, "error": "prompt is required"}
    as_json = bool(data.get("json"))
    max_tokens = int(data.get("maxTokens") or (2048 if as_json else 8192))
    max_tokens = max(256, min(max_tokens, 8192))
    try:
        return 200, gemini_generate(prompt, as_json, max_tokens)
    except Exception as exc:  # noqa: BLE001
        return 502, {"ok": False, "error": str(exc)}


def handle_extract_resume_request(data: dict) -> tuple[int, dict]:
    file_name = (data.get("fileName") or data.get("filename") or "resume.txt").strip()
    raw_b64 = data.get("data") or data.get("base64") or ""
    if not raw_b64:
        return 400, {"ok": False, "error": "data (base64 file content) is required"}
    try:
        raw = base64.b64decode(raw_b64)
        text = extract_resume_text(file_name, raw)
        if len(text.strip()) < 40:
            return 400, {
                "ok": False,
                "error": "Very little text was found in that file. Try another export.",
            }
        return 200, {"ok": True, "text": text, "fileName": file_name, "chars": len(text)}
    except Exception as exc:  # noqa: BLE001
        return 400, {"ok": False, "error": str(exc)}
