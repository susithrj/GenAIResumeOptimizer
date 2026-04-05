"""
Merge bullet rewrites into the user's original resume text with minimal disruption.

Preserves line breaks, section order, and surrounding characters by replacing
only matched spans (substring first, then whole-line fallback when indentation
or bullets differ from the model's `original` field).
"""

from __future__ import annotations


def normalize_newlines(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def _replace_matching_lines(text: str, original: str, rewritten: str) -> str:
    """Replace lines whose stripped form equals original.strip(); keep leading indent/tabs."""
    target = original.strip()
    if not target:
        return text

    lines = text.split("\n")
    out: list[str] = []
    changed = False
    for line in lines:
        if line.strip() == target:
            indent = line[: len(line) - len(line.lstrip(" \t"))]
            out.append(indent + rewritten)
            changed = True
        else:
            out.append(line)

    return "\n".join(out) if changed else text


def merge_bullet_rewrites_into_resume(resume_text: str, rewritten_bullets: list[dict]) -> str:
    """
    Apply before/after bullet pairs onto the raw resume.

    - Longest `original` first to reduce accidental substring clashes.
    - Each pair: try exact substring replace (all occurrences), then line-based match.
    """
    text = normalize_newlines(resume_text)
    pairs: list[tuple[str, str]] = []
    for b in rewritten_bullets:
        o = b.get("original")
        r = b.get("rewritten")
        if o is None or r is None:
            continue
        o = str(o)
        r = str(r)
        if not o.strip():
            continue
        pairs.append((o, r))

    pairs.sort(key=lambda x: len(x[0]), reverse=True)

    for original, rewritten in pairs:
        if original in text:
            text = text.replace(original, rewritten)
            continue

        new_text = _replace_matching_lines(text, original, rewritten)
        if new_text != text:
            text = new_text
            continue

        # Last resort: same content with normalized internal whitespace on one line
        o_collapsed = " ".join(original.split())
        if o_collapsed != original and o_collapsed in text:
            text = text.replace(o_collapsed, rewritten)

    return text


def merge_summary_into_resume(
    resume_text: str,
    old_summary: str | None,
    new_summary: str | None,
) -> str:
    """Replace professional summary block once if the parsed summary appears verbatim."""
    if not old_summary or not new_summary:
        return resume_text
    old = old_summary.strip()
    new = new_summary.strip()
    if not old or not new:
        return resume_text

    if old_summary in resume_text:
        return resume_text.replace(old_summary, new_summary, 1)
    if old in resume_text:
        return resume_text.replace(old, new, 1)
    return resume_text


def build_merged_resume_text(
    resume_text: str,
    rewrite_dump: dict,
    *,
    parsed_summary: str | None = None,
) -> str:
    """
    Full pipeline: normalize newlines, merge bullets, then optional summary swap.
    """
    text = normalize_newlines(resume_text)
    bullets = rewrite_dump.get("rewritten_bullets") or []
    text = merge_bullet_rewrites_into_resume(text, bullets)
    new_sum = (rewrite_dump.get("new_summary") or "").strip() or None
    text = merge_summary_into_resume(text, parsed_summary, new_sum)
    return text
