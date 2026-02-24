# utils/pdf_reader.py
import re
from pathlib import Path

from pypdf import PdfReader

from utils.paths import resolve_path


def _normalize_whitespace(text: str) -> str:
    """Collapse excessive newlines and strip leading/trailing whitespace."""
    text = text.strip()
    return re.sub(r"\n{3,}", "\n\n", text)


def extract_text(pdf_path: str) -> str:
    """
    Extract all text from a PDF and return as a single string.
    Skips empty pages and normalizes excessive whitespace/blank lines.

    Args:
        pdf_path: Absolute or project-relative path to the PDF.

    Returns:
        Concatenated text from all non-empty pages.

    Raises:
        FileNotFoundError: If the file does not exist.
    """
    resolved = resolve_path(pdf_path)
    if not resolved.exists():
        raise FileNotFoundError(f"PDF not found: {resolved}")

    reader = PdfReader(str(resolved))
    parts = []
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            parts.append(page_text.strip())

    return _normalize_whitespace("\n".join(parts))


def pdf_stats(pdf_path: str) -> dict:
    """Return basic stats about a PDF without re-extracting full text."""
    resolved = resolve_path(pdf_path)
    reader = PdfReader(str(resolved))
    return {
        "path": str(resolved),
        "pages": len(reader.pages),
    }


if __name__ == "__main__":
    PATH = "data/resume.pdf"

    text = extract_text(PATH)
    stats = pdf_stats(PATH)

    print(text[:500])
    print(f"\n--- Total characters : {len(text)} ---")
    print(f"--- Total pages      : {stats['pages']} ---")