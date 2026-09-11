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
_LINKEDIN_SLUG_RE = re.compile(
    r"(?:https?://)?(?:[\w-]+\.)?(linkedin\.com/(?:mwlite/)?(?:in|pub)/[A-Za-z0-9\-_%\.]+)",
    re.I,
)
_LNKD_RE = re.compile(r"lnkd\.in/[A-Za-z0-9_-]+", re.I)


def _clean_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


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
    if re.search(r"\bLinkedIn\b", text):
        return re.sub(r"\bLinkedIn\b", slug, text, count=1)
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
        if url:
            urls.append(url)
            label = inner.strip()
            if label and url not in inner:
                parts.append(inner)
                if re.fullmatch(r"(github|portfolio|website|site)", label, re.I):
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
                    lines.append(line)
    text = _inject_linkedin(_clean_text("\n".join(lines)), urls)
    return text, urls


def _strip_html(data: bytes) -> str:
    text, _urls = _strip_html_with_links(data)
    return text


def _strip_html_with_links(data: bytes) -> tuple[str, list[str]]:
    raw = data.decode("utf-8", errors="replace")
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
        return inner or href

    raw = re.sub(r'(?is)<a\s[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', repl, raw)
    raw = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", raw)
    raw = re.sub(r"(?i)<br\s*/?>", "\n", raw)
    raw = re.sub(r"(?i)</p\s*>", "\n", raw)
    raw = re.sub(r"(?i)</div\s*>", "\n", raw)
    raw = re.sub(r"(?i)</tr\s*>", "\n", raw)
    raw = re.sub(r"<[^>]+>", " ", raw)
    return _inject_linkedin(_clean_text(unescape(raw)), urls), urls


def extract_doc(data: bytes) -> str:
    text, _urls = extract_doc_with_links(data)
    return text


def extract_doc_with_links(data: bytes) -> tuple[str, list[str]]:
    head = data[:16]
    if head.startswith(b"PK"):
        return extract_docx_with_links(data)
    if b"<html" in data[:8000].lower() or b"<!doctype html" in data[:8000].lower():
        return _strip_html_with_links(data)
    chunks: list[str] = []
    for match in re.finditer(rb"[\x20-\x7e\r\n\t]{8,}", data):
        piece = match.group(0).decode("ascii", errors="ignore").strip()
        if len(piece) >= 8 and not piece.startswith("<?xml"):
            chunks.append(piece)
    if chunks:
        blob = _clean_text("\n".join(chunks))
        urls = _LINKEDIN_SLUG_RE.findall(blob) + _LNKD_RE.findall(blob) + _scan_bytes_for_linkedin(data)
        return _inject_linkedin(blob, urls), urls
    utf16 = re.findall(rb"(?:[\x20-\x7e]\x00){6,}", data)
    if utf16:
        text = _clean_text(b"".join(utf16).decode("utf-16-le", errors="ignore"))
        urls = _LINKEDIN_SLUG_RE.findall(text)
        return _inject_linkedin(text, urls), urls
    raise ValueError("Could not read this .doc file. Save as .docx or .txt and try again.")


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
            pages = [page.extract_text() or "" for page in reader.pages]
            text = _clean_text("\n\n".join(pages))
            urls = _pdf_link_urls(reader) + _scan_bytes_for_linkedin(data)
            if text or urls:
                return _inject_linkedin(text, urls), urls
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
    if ext == ".txt":
        text, urls = extract_txt(data), []
    elif ext == ".docx":
        text, urls = extract_docx_with_links(data)
    elif ext == ".doc":
        text, urls = extract_doc_with_links(data)
    elif ext == ".pdf":
        text, urls = extract_pdf_with_links(data)
    else:
        raise ValueError(f"Unsupported file type: {ext or 'unknown'}. Use PDF, DOC, DOCX, or TXT.")
    slug = first_linkedin_slug(text, urls)
    return {"text": text, "links": {"linkedin": slug}, "urls": urls}


def extract_resume_text(filename: str, data: bytes) -> str:
    return extract_resume(filename, data)["text"]
