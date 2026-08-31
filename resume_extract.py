"""Extract plain text from resume files (txt, docx, doc, pdf)."""
from __future__ import annotations

import io
import re
import zipfile
import xml.etree.ElementTree as ET
from html import unescape
from pathlib import Path

W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _clean_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_txt(data: bytes) -> str:
    for enc in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            return _clean_text(data.decode(enc))
        except UnicodeDecodeError:
            continue
    return _clean_text(data.decode("utf-8", errors="replace"))


def extract_docx(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        xml = zf.read("word/document.xml")
    root = ET.fromstring(xml)
    lines: list[str] = []
    for para in root.iter(f"{W_NS}p"):
        parts = [node.text for node in para.iter(f"{W_NS}t") if node.text]
        if parts:
            lines.append("".join(parts))
    return _clean_text("\n".join(lines))


def _strip_html(data: bytes) -> str:
    raw = data.decode("utf-8", errors="replace")
    raw = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", raw)
    raw = re.sub(r"(?i)<br\s*/?>", "\n", raw)
    raw = re.sub(r"(?i)</p\s*>", "\n", raw)
    raw = re.sub(r"(?i)</div\s*>", "\n", raw)
    raw = re.sub(r"(?i)</tr\s*>", "\n", raw)
    raw = re.sub(r"<[^>]+>", " ", raw)
    return _clean_text(unescape(raw))


def extract_doc(data: bytes) -> str:
    head = data[:16]
    if head.startswith(b"PK"):
        return extract_docx(data)
    if b"<html" in data[:8000].lower() or b"<!doctype html" in data[:8000].lower():
        return _strip_html(data)
    chunks: list[str] = []
    for match in re.finditer(rb"[\x20-\x7e\r\n\t]{8,}", data):
        piece = match.group(0).decode("ascii", errors="ignore").strip()
        if len(piece) >= 8 and not piece.startswith("<?xml"):
            chunks.append(piece)
    if chunks:
        return _clean_text("\n".join(chunks))
    utf16 = re.findall(rb"(?:[\x20-\x7e]\x00){6,}", data)
    if utf16:
        text = b"".join(utf16).decode("utf-16-le", errors="ignore")
        return _clean_text(text)
    raise ValueError("Could not read this .doc file. Save as .docx or .txt and try again.")


def extract_pdf(data: bytes) -> str:
    last_error: Exception | None = None
    for mod_name, reader_name in (("pypdf", "PdfReader"), ("PyPDF2", "PdfReader")):
        try:
            mod = __import__(mod_name, fromlist=[reader_name])
            reader_cls = getattr(mod, reader_name)
            reader = reader_cls(io.BytesIO(data))
            pages = []
            for page in reader.pages:
                pages.append(page.extract_text() or "")
            text = _clean_text("\n\n".join(pages))
            if text:
                return text
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            continue
    hint = " Install pypdf: pip install pypdf"
    if last_error:
        raise ValueError(f"PDF text extraction failed.{hint}") from last_error
    raise ValueError(f"PDF appears empty or unreadable.{hint}")


def extract_resume_text(filename: str, data: bytes) -> str:
    if not data:
        raise ValueError("File is empty")
    ext = Path(filename or "").suffix.lower()
    if ext == ".txt":
        return extract_txt(data)
    if ext == ".docx":
        return extract_docx(data)
    if ext == ".doc":
        return extract_doc(data)
    if ext == ".pdf":
        return extract_pdf(data)
    raise ValueError(f"Unsupported file type: {ext or 'unknown'}. Use PDF, DOC, DOCX, or TXT.")
