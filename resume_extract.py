"""Extract plain text from resume files (txt, docx, doc, pdf).

Hyperlinks (especially LinkedIn labeled "LinkedIn") are resolved to the
real URL so downstream scoring/rewrite can use linkedin.com/in/actual-slug.
"""
from __future__ import annotations

import io
import re
import zipfile
import xml.etree.ElementTree as ET
from html import unescape
from pathlib import Path

W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"

_FAKE_LINKEDIN = {"username", "your-profile", "yourname", "name", "profile"}
_FAKE_GITHUB = {
    "username",
    "yourname",
    "profile",
    "settings",
    "explore",
    "features",
    "topics",
    "marketplace",
    "login",
    "signup",
    "about",
    "pricing",
    "orgs",
    "notifications",
    "actions",
    "sponsors",
    "issues",
    "pulls",
    "new",
}
_GITHUB_RE = re.compile(r"(?:https?://)?(?:www\.)?github\.com/([A-Za-z0-9_-]+)/?", re.I)
_LINKEDIN_SLUG_RE = re.compile(
    r"(?:https?://)?(?:[\w-]+\.)?(linkedin\.com/(?:mwlite/)?(?:in|pub)/[A-Za-z0-9\-_%\.]+)",
    re.I,
)
_LNKD_RE = re.compile(r"lnkd\.in/[A-Za-z0-9_-]+", re.I)


_MONTH_GLUE = re.compile(
    r"(?<=[a-z])(?=(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|"
    r"Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|"
    r"Nov(?:ember)?|Dec(?:ember)?)\s*\d{4})",
    re.I,
)
_CITY_GLUE = re.compile(
    r"(?<=[a-z])(?=(?:Los Angeles|New York|San Francisco|San Jose|San Diego|"
    r"Chicago|Houston|Dallas|Austin|Seattle|Boston|Denver|Atlanta|Miami|"
    r"Phoenix|Portland|Philadelphia|Hyderabad|Bangalore|Bengaluru|Chennai|"
    r"Pune|Mumbai|Delhi|Noida|Gurgaon|Gurugram|Glassboro)\b)"
)
_COUNTRY_GLUE = re.compile(r"(?<=[a-z])(?=(?:India|USA|UK|Canada|Germany|Singapore)\b)")
_MAILTO_RE = re.compile(r"mailto:([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})", re.I)
_MID_BULLET_RE = re.compile(r"(?<=\S)\s*[•·●\u2022\u2023\u25E6\u2043\u2219]\s*(?=\S)")


def _clean_text(text: str) -> str:
    text = str(text or "").replace("\ufeff", "")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\t", " ").replace("\xa0", " ").replace("\u200b", "")
    text = text.replace("\x7f", "•")
    # Only turn mid-line bullets into pipes on contact lines (email / phone / LinkedIn).
    lines_out = []
    for line in text.split("\n"):
        if "@" in line or "linkedin" in line.lower() or re.search(r"\d{3}[\s.()-]*\d{3}", line):
            line = _MID_BULLET_RE.sub(" | ", line)
        lines_out.append(line)
    text = "\n".join(lines_out)
    text = re.sub(r"(?m)^[•·●\u2022\u2023\u25E6\uf0b7▪▸►]\s*", "- ", text)
    text = _MONTH_GLUE.sub(" ", text)
    text = re.sub(r"(?<=[a-z])(?=Graduated:?)", " ", text, flags=re.I)
    text = _CITY_GLUE.sub(" ", text)
    text = _COUNTRY_GLUE.sub(" ", text)
    text = "\n".join(ln.strip() for ln in text.split("\n"))
    text = re.sub(r"(?m)^\s*\|\s*", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"(?:\s*\|\s*){2,}", " | ", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def _emails_from_urls(urls: list[str] | None) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for url in urls or []:
        m = _MAILTO_RE.search(str(url or ""))
        if not m:
            continue
        email = m.group(1).strip()
        key = email.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(email)
    return out


def _inject_emails(text: str, urls: list[str] | None) -> str:
    emails = _emails_from_urls(urls)
    if not emails:
        return text
    missing = [e for e in emails if e.lower() not in text.lower()]
    if not missing:
        return text
    lines = text.split("\n")
    insert_at = 0
    seen = 0
    for i, line in enumerate(lines):
        if not line.strip():
            continue
        seen += 1
        if seen >= 2:
            insert_at = i
            break
        insert_at = i + 1
    extra = " | ".join(missing)
    if insert_at < len(lines) and ("@" in lines[insert_at] or "linkedin" in lines[insert_at].lower()):
        lines[insert_at] = extra + " | " + lines[insert_at]
    else:
        lines.insert(insert_at, extra)
    return "\n".join(lines)


def _strip_bare_social_labels(text: str) -> str:
    """Keep LinkedIn/GitHub on the contact line only when a real profile URL is present."""
    lines = (text or "").split("\n")
    out: list[str] = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if i >= 16:
            out.extend(lines[i:])
            break
        if re.match(
            r"^(SKILLS|TECHNICAL SKILLS|EXPERIENCE|PROFESSIONAL EXPERIENCE|EDUCATION|PROJECTS|CERTIF)\b",
            stripped,
            re.I,
        ):
            out.extend(lines[i:])
            break
        if re.search(r"GitHub\s+Actions", line, re.I) and "@" not in line:
            out.append(line)
            continue
        is_contact = (
            "@" in line
            or bool(re.search(r"\d{3}[\s.()-]*\d{3}", line))
            or bool(re.search(r"(?:^|\|)\s*(linkedin|linked\s*in|github)\s*(?:\||$)", line, re.I))
            or bool(linkedin_slug(line) or github_profile(line))
        )
        if not is_contact:
            out.append(line)
            continue
        kept: list[str] = []
        for part in re.split(r"\s*\|\s*", line):
            token = part.strip()
            if not token:
                continue
            if re.match(r"^(linkedin|linked\s*in)\b", token, re.I) and not linkedin_slug(token):
                continue
            if (
                re.match(r"^github\b", token, re.I)
                and not github_profile(token)
                and not re.search(r"GitHub\s+Actions", token, re.I)
            ):
                continue
            kept.append(token)
        out.append(" | ".join(kept))
    return "\n".join(out)


def _lift_name_above_leading_heading(text: str) -> str:
    """Some Word files put SUMMARY above the name; move the heading under contact."""
    lines = (text or "").split("\n")
    head_idx = name_idx = contact_idx = -1
    for i, raw in enumerate(lines[:12]):
        line = raw.strip()
        if not line:
            continue
        if head_idx < 0 and re.match(
            r"^(SUMMARY|OBJECTIVE|PROFILE|PROFESSIONAL SUMMARY)\b", line, re.I
        ):
            head_idx = i
            continue
        if name_idx < 0 and not re.search(r"@|\d{3}[\s.()-]*\d{3}|linkedin|github", line, re.I):
            if not re.match(
                r"^(SUMMARY|SKILLS|EXPERIENCE|EDUCATION|PROJECTS|CERTIF|OBJECTIVE|PROFILE)\b",
                line,
                re.I,
            ):
                name_idx = i
                continue
        if contact_idx < 0 and (
            "@" in line or re.search(r"\d{3}[\s.()-]*\d{3}", line) or "linkedin" in line.lower()
        ):
            contact_idx = i
            break
    if head_idx < 0 or name_idx < 0 or head_idx > name_idx:
        return text
    heading = lines.pop(head_idx)
    if name_idx > head_idx:
        name_idx -= 1
    if contact_idx > head_idx:
        contact_idx -= 1
    insert_at = (contact_idx if contact_idx >= 0 else name_idx) + 1
    lines.insert(insert_at, heading)
    return "\n".join(lines)


def _finalize_extract(text: str, urls: list[str] | None) -> tuple[str, list[str]]:
    urls = list(urls or [])
    blob = _clean_text(text)
    blob = _lift_name_above_leading_heading(blob)
    blob = _inject_linkedin(blob, urls)
    blob = _inject_github(blob, urls)
    blob = _inject_emails(blob, urls)
    blob = _strip_bare_social_labels(blob)
    blob = _lift_name_above_leading_heading(blob)
    return blob, urls


def linkedin_slug(url: str) -> str:
    """Return linkedin.com/in/handle, or '' if missing/placeholder."""
    raw = unescape(str(url or "")).strip()
    if not raw:
        return ""
    m = _LINKEDIN_SLUG_RE.search(raw)
    if m:
        slug = m.group(1).lower().rstrip("/")
        handle = slug.rsplit("/", 1)[-1]
        if handle in _FAKE_LINKEDIN:
            return ""
        return slug
    m = _LNKD_RE.search(raw)
    return m.group(0) if m else ""


def github_profile(url: str) -> str:
    """Return github.com/handle, or '' if missing/placeholder."""
    raw = unescape(str(url or "")).strip()
    if not raw:
        return ""
    m = _GITHUB_RE.search(raw)
    if not m:
        return ""
    handle = m.group(1)
    if handle.lower() in _FAKE_GITHUB:
        return ""
    return f"github.com/{handle}"


def first_github_profile(text: str, extra_urls: list[str] | None = None) -> str:
    for url in list(extra_urls or []) + [text or ""]:
        slug = github_profile(url)
        if slug:
            return slug
    return ""


def _inject_github(text: str, urls: list[str]) -> str:
    slug = first_github_profile(text, urls)
    if not slug:
        return text
    if re.search(re.escape(slug), text, re.I):
        return text
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if re.search(r"GitHub\s+Actions", line, re.I):
            continue
        if re.search(r"(?:^|\||•)\s*GitHub\s*(?:\||$)", line, re.I) or re.fullmatch(r"GitHub", line.strip(), re.I):
            lines[i] = re.sub(r"\bGitHub\b", slug, line, count=1)
            return "\n".join(lines)
        if "@" in line or re.search(r"\d{3}[\s.()-]*\d{3}", line) or "linkedin" in line.lower():
            lines[i] = line.rstrip() + " | " + slug
            return "\n".join(lines)
    return text


def first_linkedin_slug(text: str, extra_urls: list[str] | None = None) -> str:
    for url in list(extra_urls or []) + [text or ""]:
        slug = linkedin_slug(url)
        if slug:
            return slug
    return ""


def _inject_linkedin(text: str, urls: list[str]) -> str:
    slug = first_linkedin_slug(text, urls)
    if not slug:
        return text
    if re.search(r"linkedin\.com/in/username\b", text, re.I):
        text = re.sub(
            r"(?:https?://)?(?:www\.)?linkedin\.com/in/username\b",
            slug,
            text,
            flags=re.I,
        )
    if re.search(re.escape(slug), text, re.I):
        return text
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if re.search(r"(?:^|\||•)\s*Linked\s*In\s*(?:\||$)", line, re.I) or re.fullmatch(
            r"Linked\s*In", line.strip(), re.I
        ):
            lines[i] = re.sub(r"\bLinked\s*In\b", slug, line, count=1, flags=re.I)
            return "\n".join(lines)
        if "@" in line or re.search(r"\d{3}[\s.()-]*\d{3}", line) or "github" in line.lower():
            lines[i] = line.rstrip() + " | " + slug
            return "\n".join(lines)
    if re.search(r"\blinkedin\b", text, re.I) and "linkedin.com/" not in text.lower():
        return re.sub(r"\blinkedin\b", slug, text, count=1, flags=re.I)
    return text


def extract_txt(data: bytes) -> str:
    for enc in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            return _clean_text(data.decode(enc))
        except UnicodeDecodeError:
            continue
    return _clean_text(data.decode("utf-8", errors="replace"))


def _rels_path(part_path: str) -> str:
    folder, name = part_path.rsplit("/", 1)
    return f"{folder}/_rels/{name}.rels"


def _parse_rels(zf: zipfile.ZipFile, part_path: str) -> dict[str, str]:
    rels: dict[str, str] = {}
    try:
        root = ET.fromstring(zf.read(_rels_path(part_path)))
    except KeyError:
        return rels
    for rel in root.iter(f"{REL_NS}Relationship"):
        rid = rel.get("Id") or ""
        target = unescape((rel.get("Target") or "").strip())
        mode = (rel.get("TargetMode") or "").lower()
        rtype = (rel.get("Type") or "").lower()
        if rid and target and (mode == "external" or "hyperlink" in rtype):
            rels[rid] = target
    return rels


def _attr_rid(node: ET.Element) -> str:
    direct = node.get(f"{R_NS}id") or node.get("r:id") or ""
    if direct:
        return direct
    for key, value in node.attrib.items():
        if str(value).startswith("rId") and "id" in key.lower():
            return str(value)
    return ""


def _package_urls(zf: zipfile.ZipFile) -> list[str]:
    """Every external URL in the DOCX (rels + XML), including icon-only hyperlinks."""
    urls: list[str] = []
    for name in zf.namelist():
        if not name.endswith((".xml", ".rels")):
            continue
        try:
            raw = unescape(zf.read(name).decode("utf-8", errors="ignore"))
        except Exception:  # noqa: BLE001
            continue
        urls.extend(_LINKEDIN_SLUG_RE.findall(raw))
        urls.extend(_LNKD_RE.findall(raw))
        if name.endswith(".rels"):
            try:
                root = ET.fromstring(zf.read(name))
            except Exception:  # noqa: BLE001
                continue
            for rel in root.iter(f"{REL_NS}Relationship"):
                target = unescape((rel.get("Target") or "").strip())
                if target.startswith("http") or "linkedin" in target.lower():
                    urls.append(target)
    return urls


def _para_text_and_urls(para: ET.Element, rels: dict[str, str]) -> tuple[str, list[str]]:
    parts: list[str] = []
    urls: list[str] = []

    def emit(inner: str, url: str | None) -> None:
        inner = inner or ""
        slug = linkedin_slug(url or "")
        if slug:
            urls.append(slug if slug.startswith("lnkd.in/") else f"https://{slug}")
            label = inner.strip()
            if not label or re.fullmatch(r"(linkedin|linked\s*in|profile)", label, re.I):
                parts.append(slug)
                return
            parts.append(inner)
            if slug.lower() not in inner.lower() and "linkedin.com" not in inner.lower():
                parts.append(" " + slug)
            return
        gh = github_profile(url or "")
        if gh:
            urls.append(f"https://{gh}")
            label = inner.strip()
            if not label or re.fullmatch(r"github", label, re.I):
                parts.append(gh)
                return
            parts.append(inner)
            if gh.lower() not in inner.lower() and "github.com" not in inner.lower():
                parts.append(" " + gh)
            return
        if url:
            urls.append(url)
            label = inner.strip()
            if label and url not in inner:
                parts.append(inner)
                if re.fullmatch(r"(portfolio|website|site)", label, re.I):
                    parts.append(" " + url)
            else:
                parts.append(inner or url)
            return
        if inner:
            parts.append(inner)

    skip_linkedin_label = False

    def walk(node: ET.Element) -> None:
        nonlocal skip_linkedin_label
        tag = node.tag
        if tag == f"{W_NS}tab" or tag.endswith("}tab"):
            # Word uses tabs between title/company and city/dates. Dropping them
            # glued NetflixLos Angeles and CertificationNov 2024.
            if not parts or not str(parts[-1]).endswith((" ", "\n", "|")):
                parts.append(" ")
            return
        if tag in (f"{W_NS}br", f"{W_NS}cr") or tag.endswith("}br") or tag.endswith("}cr"):
            parts.append("\n")
            return
        if tag == f"{W_NS}hyperlink" or tag.endswith("}hlinkClick") or tag.endswith("}hlinkHover"):
            rid = _attr_rid(node)
            url = rels.get(rid)
            inner = "".join((t.text or "") for t in node.iter(f"{W_NS}t")) if tag == f"{W_NS}hyperlink" else ""
            emit(inner, url)
            skip_linkedin_label = bool(linkedin_slug(url or ""))
            return
        if tag == f"{W_NS}instrText" and node.text:
            m = re.search(r'HYPERLINK\s+"?([^"\s\\]+)"?', node.text, re.I)
            if m:
                emit("", m.group(1).strip())
                skip_linkedin_label = bool(linkedin_slug(m.group(1)))
            return
        if tag == f"{W_NS}t" and node.text:
            if skip_linkedin_label and re.fullmatch(r"(linkedin|linked\s*in)", node.text.strip(), re.I):
                skip_linkedin_label = False
                return
            skip_linkedin_label = False
            parts.append(node.text)
        for child in list(node):
            walk(child)

    walk(para)
    return "".join(parts), urls


def _docx_part_order(names: list[str]) -> list[str]:
    headers = sorted(n for n in names if re.search(r"/header\d+\.xml$", n))
    body = [n for n in names if n.endswith("/document.xml")]
    footers = sorted(n for n in names if re.search(r"/footer\d+\.xml$", n))
    return headers + body + footers


def extract_docx(data: bytes) -> str:
    text, _urls = extract_docx_with_links(data)
    return text


def extract_docx_with_links(data: bytes) -> tuple[str, list[str]]:
    urls: list[str] = []
    lines: list[str] = []
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        urls.extend(_package_urls(zf))
        parts = _docx_part_order(
            [n for n in zf.namelist() if re.search(r"word/(document|header\d+|footer\d+)\.xml$", n)]
        )
        for part in parts:
            rels = _parse_rels(zf, part)
            root = ET.fromstring(zf.read(part))
            for para in root.iter(f"{W_NS}p"):
                line, found = _para_text_and_urls(para, rels)
                urls.extend(found)
                if line.strip():
                    lines.append(line.strip())
    text = _inject_linkedin(_clean_text("\n".join(lines)), urls)
    return _finalize_extract(text, urls)


def _strip_html(data: bytes) -> str:
    text, _urls = _strip_html_with_links(data)
    return text


def _strip_html_with_links(data: bytes) -> tuple[str, list[str]]:
    raw = data.decode("utf-8", errors="replace").lstrip("\ufeff")
    urls: list[str] = []

    def repl(match: re.Match[str]) -> str:
        href = unescape(match.group(1) or "").strip()
        inner = unescape(re.sub(r"<[^>]+>", "", match.group(2) or "")).strip()
        slug = linkedin_slug(href)
        if slug:
            urls.append(f"https://{slug}" if not slug.startswith("lnkd.in/") else slug)
            if not inner or re.fullmatch(r"(linkedin|linked\s*in|profile)", inner, re.I):
                return slug
            if slug.lower() not in inner.lower():
                return f"{inner} {slug}"
            return inner
        if href:
            urls.append(href)
        if href.lower().startswith("mailto:"):
            return inner or href.split(":", 1)[-1]
        return inner or href

    raw = re.sub(r"(?is)<!--.*?-->", " ", raw)
    raw = re.sub(r"(?is)<head[^>]*>.*?</head>", " ", raw)
    raw = re.sub(r'(?is)<a\s[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', repl, raw)
    raw = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", raw)
    raw = re.sub(r"(?i)<br\s*/?>", "\n", raw)
    raw = re.sub(r"(?i)</p\s*>", "\n", raw)
    raw = re.sub(r"(?i)</div\s*>", "\n", raw)
    raw = re.sub(r"(?i)</tr\s*>", "\n", raw)
    raw = re.sub(r"(?i)</h[1-6]\s*>", "\n", raw)
    raw = re.sub(r"<[^>]+>", " ", raw)
    return _finalize_extract(unescape(raw), urls)


def extract_doc(data: bytes) -> str:
    text, _urls = extract_doc_with_links(data)
    return text


def _is_html_payload(data: bytes) -> bool:
    head = data.lstrip(b"\xef\xbb\xbf")[:9000].lower()
    return b"<html" in head or b"<!doctype" in head


def extract_doc_with_links(data: bytes) -> tuple[str, list[str]]:
    if data[:4] == b"PK\x03\x04" or data[:2] == b"PK":
        return extract_docx_with_links(data)
    if _is_html_payload(data):
        return _strip_html_with_links(data)
    chunks: list[str] = []
    for match in re.finditer(rb"[\x20-\x7e\r\n\t]{8,}", data):
        piece = match.group(0).decode("ascii", errors="ignore").strip()
        if len(piece) < 8 or piece.startswith("<?xml") or piece.startswith("{"):
            continue
        if re.match(r"(?i)print\s+\d+$", piece):
            continue
        if re.search(r"(?i)\.(doc|docx|pdf)$", piece) and len(piece) < 120:
            continue
        chunks.append(piece)
    if chunks:
        blob = "\n".join(chunks)
        urls = _LINKEDIN_SLUG_RE.findall(blob) + _LNKD_RE.findall(blob) + _scan_bytes_for_linkedin(data)
        return _finalize_extract(blob, urls)
    utf16 = re.findall(rb"(?:[\x20-\x7e]\x00){6,}", data)
    if utf16:
        text = b"".join(utf16).decode("utf-16-le", errors="ignore")
        urls = _LINKEDIN_SLUG_RE.findall(text) + _scan_bytes_for_linkedin(data)
        return _finalize_extract(text, urls)
    raise ValueError("Could not read this .doc file. Save as .docx or .pdf and try again.")


def _scan_bytes_for_linkedin(data: bytes) -> list[str]:
    blob = data.decode("latin-1", errors="ignore").replace("\\\n", "").replace("\r", "")
    blob = re.sub(r"\(\s*", "(", blob)
    found = _LINKEDIN_SLUG_RE.findall(blob) + _LNKD_RE.findall(blob)
    return found


def _pdf_link_urls(reader) -> list[str]:
    urls: list[str] = []

    def add(value) -> None:
        if value is None:
            return
        raw = str(value)
        if raw.startswith("/") and len(raw) < 8:
            return
        urls.append(raw)

    for page in getattr(reader, "pages", []):
        annots = None
        try:
            annots = page.get("/Annots")
        except Exception:  # noqa: BLE001
            annots = None
        if not annots:
            continue
        try:
            annots = list(annots)
        except TypeError:
            continue
        for annot in annots:
            try:
                obj = annot.get_object() if hasattr(annot, "get_object") else annot
                subtype = str(obj.get("/Subtype") or "")
                if subtype not in ("/Link", "/URI", "/Widget"):
                    # Still try URI — some PDF writers skip Subtype
                    pass
                action = obj.get("/A")
                if action is not None and hasattr(action, "get_object"):
                    action = action.get_object()
                if action is not None and hasattr(action, "get"):
                    add(action.get("/URI"))
                    add(action.get("/URI") if action.get("/S") else None)
                if hasattr(obj, "get"):
                    add(obj.get("/URI"))
                    dest = obj.get("/Dest")
                    if dest is not None:
                        add(dest)
            except Exception:  # noqa: BLE001
                continue
    return urls


def extract_pdf(data: bytes) -> str:
    text, _urls = extract_pdf_with_links(data)
    return text


def extract_pdf_with_links(data: bytes) -> tuple[str, list[str]]:
    last_error: Exception | None = None
    for mod_name, reader_name in (("pypdf", "PdfReader"), ("PyPDF2", "PdfReader")):
        try:
            mod = __import__(mod_name, fromlist=[reader_name])
            reader_cls = getattr(mod, reader_name)
            reader = reader_cls(io.BytesIO(data))
            pages = [(page.extract_text() or "") for page in reader.pages]
            text = "\n\n".join(pages)
            urls = _pdf_link_urls(reader) + _scan_bytes_for_linkedin(data)
            if text or urls:
                return _finalize_extract(text, urls)
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            continue
    hint = " Install pypdf: pip install pypdf"
    if last_error:
        raise ValueError(f"PDF text extraction failed.{hint}") from last_error
    raise ValueError(f"PDF appears empty or unreadable.{hint}")


def extract_resume(filename: str, data: bytes) -> dict:
    if not data:
        raise ValueError("File is empty")
    ext = Path(filename or "").suffix.lower()
    if ext == ".docx":
        text, urls = extract_docx_with_links(data)
    elif ext == ".doc":
        text, urls = extract_doc_with_links(data)
    elif ext == ".pdf":
        text, urls = extract_pdf_with_links(data)
    else:
        raise ValueError(f"Unsupported file type: {ext or 'unknown'}. Upload a PDF, DOC, or DOCX.")
    slug = first_linkedin_slug(text, urls)
    gh = first_github_profile(text, urls)
    return {"text": text, "links": {"linkedin": slug, "github": gh}, "urls": urls}


def extract_resume_text(filename: str, data: bytes) -> str:
    return extract_resume(filename, data)["text"]
