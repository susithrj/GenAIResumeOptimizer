"""Project path resolution. Single source of truth for project root and path resolution."""

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def resolve_path(relative_or_absolute_path: str) -> Path:
    """Resolve a path against project root if it is not absolute."""
    path = Path(relative_or_absolute_path)
    if path.is_absolute():
        return path
    return PROJECT_ROOT / path
