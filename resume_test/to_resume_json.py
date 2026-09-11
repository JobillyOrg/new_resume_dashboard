#!/usr/bin/env python3
"""Convert a plain-text resume into the structured JSON schema (see jsonresume.txt)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api_core import gemini_generate, load_env  # noqa: E402

load_env()

SCHEMA_HINT = """Return JSON with exactly this shape:
{
  "personal_information": {
    "name": "",
    "location": "",
    "phone": "",
    "email": "",
    "linkedin": ""
  },
  "professional_summary": "",
  "education": [
    {
      "degree": "",
      "start_date": "",
      "end_date": "",
      "institution": "",
      "location": ""
    }
  ],
  "skills": {
    "languages": [],
    "frameworks_and_tools": [],
    "databases": [],
    "cloud_platforms": [],
    "visualization": [],
    "ai_ml": [],
    "version_control_and_devops": [],
    "certifications": []
  },
  "professional_experience": [
    {
      "company": "",
      "role": "",
      "start_date": "",
      "end_date": "",
      "location": "",
      "responsibilities": []
    }
  ]
}
"""


def build_prompt(resume: str) -> str:
    return f"""You are a resume parser. Convert the resume into structured JSON only.
Use ONLY facts present in the resume. Do not invent employers, dates, degrees, or skills.

RESUME:
{resume[:14000]}

{SCHEMA_HINT}

Rules:
- Put every skill into the best skills.* bucket; leave unused buckets as [].
- responsibilities = experience bullets only (no Skills-section dump).
- professional_summary = SUMMARY paragraph only.
- personal_information.linkedin = the exact linkedin.com/in/slug if present. Never invent linkedin.com/in/username.
- personal_information.location = header/home city only, never a college or employer city.
- professional_experience[].location = only if that role header already has a city/Remote; empty otherwise. Never guess HQ or copy the header city.
- Empty string / [] when unknown — never guess.
Return JSON only."""


def parse_json_loose(raw: str) -> dict:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if not m:
            raise
        return json.loads(m.group(0))


def convert(path: Path) -> Path:
    resume = path.read_text(encoding="utf-8", errors="ignore")
    result = gemini_generate(build_prompt(resume), as_json=True, max_tokens=4000)
    raw = result.get("text") or ""
    data = parse_json_loose(raw)
    out_dir = Path(__file__).resolve().parent / "_json"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / (path.stem + ".json")
    out.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return out


def main() -> None:
    if len(sys.argv) < 2:
        targets = sorted((Path(__file__).resolve().parent / "_extracted").glob("*.txt"))
    else:
        targets = [Path(a) for a in sys.argv[1:]]
    if not targets:
        print("No resume text files found.")
        sys.exit(1)
    for t in targets:
        out = convert(t)
        print(f"OK  {t.name} -> {out}")


if __name__ == "__main__":
    main()
