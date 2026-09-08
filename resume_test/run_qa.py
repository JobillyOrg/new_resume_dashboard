#!/usr/bin/env python3
"""QA harness: extract resume_test files, rewrite vs 5 JDs, flag issues."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api_core import gemini_generate, load_env  # noqa: E402
from resume_extract import extract_resume_text  # noqa: E402

load_env()

OUT = Path(__file__).resolve().parent / "_qa_out"
EXTRACTED = Path(__file__).resolve().parent / "_extracted"
OUT.mkdir(exist_ok=True)
EXTRACTED.mkdir(exist_ok=True)

JDS = {
    "data_engineer_aws": """Job Title: Data Engineer
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
""",
    "ml_engineer_aws": """Job Title: Machine Learning Engineer
Location: Remote / Hybrid USA

About the role:
Build and productionize ML systems for recommendation, NLP, and generative AI use cases.

Responsibilities:
- Develop and deploy ML models with Python, PyTorch/TensorFlow, and scikit-learn
- Build feature pipelines and real-time inference services on AWS SageMaker
- Implement RAG systems, embeddings, and LLM evaluation
- Own MLOps: MLflow, Docker, Kubernetes, CI/CD, model monitoring
- Collaborate with data engineering on Spark/Kafka feature pipelines

Required qualifications:
- 4+ years ML engineering experience
- Strong Python, deep learning, NLP
- AWS ML stack (SageMaker, S3, Lambda)
- Experience with Docker, Kubernetes, Airflow
""",
    "data_analyst": """Job Title: Data Analyst
Location: USA Remote

About the role:
Turn complex data into actionable insights for business stakeholders.

Responsibilities:
- Analyze large datasets using SQL, Python, and Excel
- Build dashboards and reports in Tableau and Power BI
- Design ETL workflows and support data quality
- Perform A/B testing, statistical analysis, and KPI tracking
- Partner with product and operations teams

Required qualifications:
- 3+ years data analyst experience
- SQL, Python, Tableau/Power BI
- Experience with cloud data platforms (AWS or Azure)
- Strong communication and storytelling with data
""",
    "ai_engineer": """Job Title: AI Engineer
Location: Remote USA

About the role:
Design and scale generative AI and ML applications in production.

Responsibilities:
- Build LLM applications, RAG pipelines, and prompt evaluation frameworks
- Deploy models on AWS using SageMaker, Lambda, and container platforms
- Implement feature stores and real-time personalization systems
- Work with Kafka, Flink/Spark for streaming features
- Ensure reliability, latency, and cost efficiency of AI services

Required qualifications:
- 4+ years AI/ML experience
- GPT/Llama, RAG, embeddings, Python
- AWS AI infrastructure
- Docker/Kubernetes and production ML experience
""",
    "soc_analyst": """Job Title: Security Operations Center (SOC) Analyst
Location: Remote USA

About the role:
Monitor, triage, and respond to security threats in a 24x7 SOC environment.

Responsibilities:
- Triage SIEM alerts using Splunk, Microsoft Sentinel, and CrowdStrike
- Investigate phishing, malware, and identity threats
- Validate IOCs and support incident response
- Write detection logic (KQL/SPL) and tune alerts
- Apply MITRE ATT&CK for investigation and reporting

Required qualifications:
- 3+ years SOC / security operations experience
- SIEM tools (Splunk, Sentinel, QRadar)
- Threat intelligence, phishing analysis, vulnerability assessment
- Strong written communication and attention to detail
""",
}

# Map resume stems -> best JD key
RESUME_JD = {
    "Harsha Vardhan DE Support Resume": "data_engineer_aws",
    "Lokesh_Bathala_Network_Deployment_Technician": "soc_analyst",  # closest ops/security-ish; expect weak fit
    "Maheshwari Vallapu AI Engineer Resume": "ai_engineer",
    "Prasanna Gandla SOC Resume (1)": "soc_analyst",
    "Reshmi Support": "data_analyst",
    "Sucharitha Bode Resume": "data_analyst",
    "Sucharitha Bode_AIAnalyst": "ai_engineer",
    "Sucharitha Bode_dataAnalyst": "data_analyst",
    "SUPPORT Anirudh Machine Learning Engineer (2)": "ml_engineer_aws",
    "Tejashwini_DA_Resume": "data_analyst",
    "Vasanthi_Vaddelli_Resume": "ai_engineer",
}

AWS_RE = re.compile(
    r"\b(aws|amazon web services|\bs3\b|glue|emr|redshift|lambda|athena|kinesis|dynamodb|sagemaker|cloudformation)\b",
    re.I,
)
AZURE_RE = re.compile(
    r"\b(azure|adf|azure data factory|synapse|blob storage|power bi|azure devops|azure ml|cosmos ?db)\b",
    re.I,
)
GCP_RE = re.compile(
    r"\b(gcp|google cloud|bigquery|dataflow|pub/?sub|composer|vertex ai|dataproc|\bgcs\b)\b",
    re.I,
)
LEVERAGE_RE = re.compile(r"\bleverag(?:e|es|ed|ing)\b", re.I)
PROJECTS_HDR_RE = re.compile(r"^(?:KEY |SELECTED |PERSONAL |ACADEMIC )?PROJECTS?\s*$", re.I | re.M)


def detect_clouds(text: str) -> dict:
    return {
        "aws": len(AWS_RE.findall(text)),
        "azure": len(AZURE_RE.findall(text)),
        "gcp": len(GCP_RE.findall(text)),
    }


def primary_cloud(scores: dict) -> str | None:
    ranked = sorted(scores.items(), key=lambda x: -x[1])
    if not ranked or ranked[0][1] == 0:
        return None
    return ranked[0][0]


def count_project_sections(text: str) -> int:
    return len(PROJECTS_HDR_RE.findall(text))


def section_headers(text: str) -> list[str]:
    headers = []
    for line in text.splitlines():
        t = line.strip()
        if not t or len(t) > 52:
            continue
        if t.isupper() and 3 <= len(t) <= 50:
            headers.append(t)
        elif PROJECTS_HDR_RE.match(t):
            headers.append(t.upper())
    return headers


def format_issues(text: str) -> list[str]:
    issues = []
    if "\uf0b7" in text or "\u2022" in text:
        issues.append("Contains bullet glyphs (•) — template expects '- ' bullets")
    if re.search(r"\bleverag(?:e|es|ed|ing)\b", text, re.I):
        issues.append(f"'leveraging/leveraged' appears {len(LEVERAGE_RE.findall(text))} time(s)")
    if re.search(r",\s*[A-Z][A-Za-z0-9.+#/ ]{1,30}\.\s*$", text, re.M):
        issues.append("Possible trailing comma skill dumps on bullets")
    if text.count("PROJECTS") >= 2 or count_project_sections(text) > 1:
        issues.append(f"Projects section appears {count_project_sections(text)} time(s) / PROJECTS token count={text.upper().count('PROJECTS')}")
    # contact / name at top
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if lines and lines[0].upper() in {"SUMMARY", "PROFESSIONAL SUMMARY", "TECHNICAL SKILLS", "SKILLS"}:
        issues.append("Resume does not start with candidate name (starts with section header)")
    if re.search(r"https?://www\.linkedin\.com", text, re.I):
        issues.append("LinkedIn uses full URL — template prefers linkedin.com/in/username")
    # role line spacing issues
    if re.search(r"\|[A-Za-z]", text) or re.search(r"[A-Za-z]\|", text):
        issues.append("Pipe separators missing spaces around '|' in some lines")
    if re.search(r"(Engineer|Analyst|Scientist)(January|February|March|April|May|June|July|August|September|October|November|December)", text):
        issues.append("Missing space between job title and start month")
    return issues


def cloud_contradictions(text: str, prefer: str | None) -> list[str]:
    scores = detect_clouds(text)
    issues = []
    present = [c for c, n in scores.items() if n > 0]
    if len(present) >= 2:
        issues.append(f"Multiple clouds present: {scores}")
    if prefer:
        rivals = {"aws": ["azure", "gcp"], "azure": ["aws", "gcp"], "gcp": ["aws", "azure"]}.get(prefer, [])
        for r in rivals:
            if scores[r] > 0 and scores.get(prefer, 0) >= 2:
                issues.append(f"Primary={prefer} but rival '{r}' still appears ({scores[r]} hits)")
    return issues


def rewrite_prompt(jd: str, resume: str) -> str:
    return f"""You are a US full-time resume writer. Rewrite the MASTER resume for ATS.

RULES:
- Preserve name, contact, companies, titles, dates, education.
- Stay on the candidate's primary cloud stack. Do NOT mix AWS + Azure + GCP services. Keep only the dominant cloud and neutral tools (Python, SQL, Spark, Kafka, Docker, etc.).
- Never use the words leveraging or leveraged. Use using/with/via/through.
- If PROJECTS exists, keep the same projects once: project name then "- " bullets only. No dates on projects. Do not invent a second PROJECTS section. If no projects, do not create one.
- Output layout: Name, title, contact, SUMMARY, SKILLS, PROFESSIONAL EXPERIENCE, EDUCATION, then extra sections.
- Experience role lines: Company | Location | Job Title Month YYYY – Month YYYY
- Bullets start with "- ", end with period, action → technology → result.
- Each role 6-7 bullets.
- Do not invent employers, degrees, or certifications.

JOB DESCRIPTION:
{jd[:7000]}

MASTER RESUME:
{resume[:12000]}

OUTPUT the resume only. Start with the candidate name on line 1."""


def score_prompt(jd: str, resume: str) -> str:
    return f"""Score this resume vs the JD. Return ONLY JSON:
{{"atsScore": <0-100 integer>, "gaps": ["..."], "cloudMix": true/false, "projectsOk": true/false, "notes": "short"}}

Be strict like ChatGPT/Claude ATS checkers. Typical strong resume is 75-85. 95+ is rare.

JD:
{jd[:5000]}

RESUME:
{resume[:10000]}"""


def extract_all() -> dict[str, str]:
    resumes = {}
    folder = Path(__file__).resolve().parent
    for p in sorted(folder.iterdir()):
        if p.suffix.lower() not in {".pdf", ".docx", ".doc"}:
            continue
        if p.name.startswith("_"):
            continue
        try:
            text = extract_resume_text(p.name, p.read_bytes())
            (EXTRACTED / f"{p.stem}.txt").write_text(text, encoding="utf-8")
            resumes[p.stem] = text
            print(f"EXTRACT OK: {p.name} ({len(text)} chars)", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"EXTRACT FAIL: {p.name}: {exc}", flush=True)
    return resumes


def analyze_static(name: str, text: str) -> dict:
    clouds = detect_clouds(text)
    return {
        "name": name,
        "chars": len(text),
        "clouds": clouds,
        "primaryCloud": primary_cloud(clouds),
        "projectSections": count_project_sections(text),
        "leverageCount": len(LEVERAGE_RE.findall(text)),
        "headers": section_headers(text)[:20],
        "issues": format_issues(text) + cloud_contradictions(text, primary_cloud(clouds)),
    }


def run_rewrite(name: str, text: str, jd_key: str) -> dict:
    jd = JDS[jd_key]
    print(f"REWRITE {name} -> {jd_key} ...", flush=True)
    rewritten = gemini_generate(rewrite_prompt(jd, text), as_json=False, max_tokens=8192)["text"].strip()
    # strip fences if any
    rewritten = re.sub(r"^```(?:text|markdown)?\n?|\n?```$", "", rewritten).strip()
    (OUT / f"{name}__{jd_key}__rewritten.txt").write_text(rewritten, encoding="utf-8")

    score_raw = gemini_generate(score_prompt(jd, rewritten), as_json=True, max_tokens=1024)["text"]
    try:
        score = json.loads(score_raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", score_raw, re.S)
        score = json.loads(m.group(0)) if m else {"atsScore": None, "notes": score_raw[:300]}

    master_primary = primary_cloud(detect_clouds(text))
    issues = format_issues(rewritten) + cloud_contradictions(rewritten, master_primary)

    # invent companies check (very light): companies with | in rewritten not in master
    master_cos = set(re.findall(r"^([A-Z][^|\n]{1,40})\s*\|", text, re.M))
    out_cos = set(re.findall(r"^([A-Z][^|\n]{1,40})\s*\|", rewritten, re.M))
    invented = sorted(c for c in out_cos - master_cos if c.upper() not in {"SUMMARY", "SKILLS", "TECHNICAL SKILLS"})
    if invented:
        issues.append(f"Possible new company/role lines not in master: {invented[:5]}")

    if count_project_sections(text) == 0 and count_project_sections(rewritten) > 0:
        issues.append("Invented PROJECTS section (master had none)")
    if count_project_sections(rewritten) > 1:
        issues.append("Duplicated PROJECTS section after rewrite")

    # dates in projects block
    if count_project_sections(rewritten) >= 1:
        parts = re.split(r"(?im)^(?:KEY |SELECTED |PERSONAL |ACADEMIC )?PROJECTS?\s*$", rewritten)
        if len(parts) > 1:
            proj = parts[1].split("\n\n")[0] if "\n\n" in parts[1] else parts[1][:800]
            if re.search(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b", proj, re.I):
                issues.append("Projects section still contains dates")

    return {
        "resume": name,
        "jd": jd_key,
        "atsScore": score.get("atsScore"),
        "scoreMeta": score,
        "masterClouds": detect_clouds(text),
        "rewrittenClouds": detect_clouds(rewritten),
        "issues": issues,
        "rewrittenPreview": "\n".join(rewritten.splitlines()[:18]),
        "rewrittenChars": len(rewritten),
    }


def main() -> None:
    resumes = extract_all()
    static_reports = [analyze_static(n, t) for n, t in resumes.items()]
    (OUT / "static_report.json").write_text(json.dumps(static_reports, indent=2), encoding="utf-8")

    # Prefer unique people; skip exact duplicate stems where both pdf/docx exist — keep both variants if content differs
    rewrite_targets = []
    seen_hash = set()
    for name, text in resumes.items():
        h = hash(re.sub(r"\s+", " ", text.lower())[:2000])
        if h in seen_hash:
            print(f"SKIP duplicate-ish: {name}", flush=True)
            continue
        seen_hash.add(h)
        jd_key = RESUME_JD.get(name)
        if not jd_key:
            # fallback by keywords
            low = text.lower()
            if "soc" in low or "splunk" in low or "sentinel" in low:
                jd_key = "soc_analyst"
            elif "machine learning" in low or "ml engineer" in low:
                jd_key = "ml_engineer_aws"
            elif "data engineer" in low:
                jd_key = "data_engineer_aws"
            elif "ai engineer" in low or "generative ai" in low:
                jd_key = "ai_engineer"
            else:
                jd_key = "data_analyst"
        rewrite_targets.append((name, text, jd_key))

    results = []
    for name, text, jd_key in rewrite_targets:
        try:
            results.append(run_rewrite(name, text, jd_key))
        except Exception as exc:  # noqa: BLE001
            results.append({"resume": name, "jd": jd_key, "error": str(exc)})
            print(f"REWRITE FAIL {name}: {exc}", flush=True)

    # Also run one mismatch test: AWS-primary resume against Azure-heavy DA JD already covered;
    # add Anirudh vs data_engineer to check cloud filtering under DE JD
    if "SUPPORT Anirudh Machine Learning Engineer (2)" in resumes:
        try:
            results.append(
                run_rewrite(
                    "SUPPORT Anirudh Machine Learning Engineer (2)",
                    resumes["SUPPORT Anirudh Machine Learning Engineer (2)"],
                    "data_engineer_aws",
                )
            )
        except Exception as exc:  # noqa: BLE001
            results.append({"resume": "Anirudh", "jd": "data_engineer_aws", "error": str(exc)})

    report = {
        "jdsUsed": list(JDS.keys()),
        "static": static_reports,
        "rewrites": results,
        "summary": {
            "resumesExtracted": len(resumes),
            "rewritesRun": len([r for r in results if "error" not in r]),
            "rewritesFailed": len([r for r in results if "error" in r]),
            "withIssues": len([r for r in results if r.get("issues")]),
        },
    }
    (OUT / "qa_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], indent=2), flush=True)
    print(f"Wrote {OUT / 'qa_report.json'}", flush=True)


if __name__ == "__main__":
    main()
