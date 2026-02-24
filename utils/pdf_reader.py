# utils/pdf_reader.py
from pathlib import Path
from pypdf import PdfReader

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def resolve_path(pdf_path):
    """Resolve relative paths against project root."""
    path = Path(pdf_path)
    if path.is_absolute():
        return path
    return PROJECT_ROOT / path


def extract_text(pdf_path):
    """
    Extract and return all text from a PDF file.
    Skips empty pages automatically.

    Args:
        pdf_path: Absolute or project-relative path to the PDF.

    Raises:
        FileNotFoundError: If the file does not exist.
    """
    resolved = resolve_path(pdf_path)

    if not resolved.exists():
        raise FileNotFoundError(f"PDF not found: {resolved}")

    reader = PdfReader(str(resolved))
    pages = []

    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            pages.append(page_text.strip())

    return "\n".join(pages)


def pdf_stats(pdf_path):
    """Return basic stats about a PDF without re-extracting text."""
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