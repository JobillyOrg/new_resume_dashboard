#!/usr/bin/env python3
"""Convert a raw job description into structured JSON (see jsonjd.txt)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api_core import gemini_generate, load_env  # noqa: E402

load_env()

SCHEMA = """Return JSON with exactly this shape:
{
  "job_information": {
    "title": "",
    "company": "",
    "location": "",
    "employment_type": "",
    "seniority_level": "junior|mid|senior|lead|staff|manager|unknown",
    "work_mode": "remote|hybrid|onsite|unknown"
  },
  "overview": "",
  "years_of_experience": {
    "minimum": null,
    "maximum": null,
    "note": ""
  },
  "must_have_skills": [],
  "nice_to_have_skills": [],
  "ats_phrases": [],
  "responsibilities": [],
  "requirements": {
    "education": "",
    "experience": "",
    "hard_gates": [],
    "work_authorization": "",
    "other": []
  },
  "domain_industry": [],
  "eligibility": {
    "us_citizen_required": false,
    "sponsorship_available": null,
    "clearance_required": false,
    "notes": []
  }
}
"""


def build_prompt(jd: str) -> str:
    return f"""You are a job-description analyst. Convert this posting into clear structured JSON.
Use ONLY facts in the JD. Do not invent skills, years, or requirements.

JOB DESCRIPTION:
{jd[:12000]}

{SCHEMA}

Rules:
- must_have_skills = hard technical tools/skills clearly required (10-16 max).
- nice_to_have_skills = preferred / secondary tools from the JD only.
- ats_phrases = 8-14 short recruiter/ATS search phrases copied from the JD. Not a duplicate of must-have tools.
- responsibilities = duty bullets rewritten cleanly (one idea each).
- No certifications as must-haves unless the JD makes them a hard gate.
- domain_industry is informational. Treat industry as a hard gate ONLY if the JD explicitly requires that industry experience (healthcare, mortgage, retail, financial-services, etc.).
- No benefits, 401k, or soft-skill fluff in skill lists.
- Empty string / [] / null when unknown.
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


def convert_text(jd: str, out: Path) -> Path:
    result = gemini_generate(build_prompt(jd), as_json=True, max_tokens=3500)
    data = parse_json_loose(result.get("text") or "")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return out


def main() -> None:
    here = Path(__file__).resolve().parent
    out_dir = here / "_json"
    if len(sys.argv) >= 2:
        src = Path(sys.argv[1])
        jd = src.read_text(encoding="utf-8", errors="ignore")
        stem = src.stem
    else:
        # Default sample from run_qa data engineer JD
        jd = """Job Title: Data Engineer
Location: Remote, USA

About the role:
We are hiring a Data Engineer to build and operate scalable data pipelines on AWS.

Responsibilities:
- Design, build, and maintain ETL/ELT pipelines using Python, SQL, Apache Spark, and Airflow
- Build data lake and warehouse solutions with S3, Glue, Redshift, and Athena
- Implement streaming pipelines with Kafka and Kinesis
- Partner with analytics and ML teams to deliver trusted datasets
- Improve data quality, monitoring, and CI/CD for pipelines using Docker and Terraform

Required qualifications:
- 4+ years data engineering experience
- Strong Python, SQL, Spark/PySpark
- Hands-on AWS (S3, Glue, Redshift, Lambda, EMR)
- Experience with Airflow, dbt, Kafka
- Bachelor's degree or equivalent experience
"""
        stem = "sample_data_engineer_aws"
        (here / "_samples").mkdir(exist_ok=True)
        (here / "_samples" / f"{stem}.txt").write_text(jd, encoding="utf-8")

    out = convert_text(jd, out_dir / f"{stem}.jd.json")
    print(f"OK  -> {out}")


if __name__ == "__main__":
    main()
