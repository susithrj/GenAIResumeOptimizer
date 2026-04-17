"""
Lightweight, embedding-based ATS alignment score.

Goal: provide a cheap "alignment meter" without calling a chat LLM.
Uses the existing Google embeddings stack already used for RAG.
"""

from __future__ import annotations

import hashlib
import math
import re
import time
from collections import Counter, OrderedDict
from dataclasses import dataclass
from typing import Iterable, List, Tuple

from langchain_google_genai import GoogleGenerativeAIEmbeddings

from utils.build_kb import EMBEDDING_MODEL


# Tuning knobs (keep conservative to control cost/latency)
DEFAULT_PHRASE_CAP = 50
DEFAULT_RESUME_CHUNK_CAP = 90
DEFAULT_THRESHOLD = 0.72
DEFAULT_MAX_EMBED_CHARS = 25_000

# Simple in-process cache: good enough for debounce/session re-tries.
_CACHE_MAX = 128
_CACHE_TTL_S = 15 * 60
_cache: "OrderedDict[str, tuple[float, 'ScoreResult']]" = OrderedDict()


@dataclass(frozen=True)
class ScoreResult:
    ats_score: int
    covered: List[str]
    missing: List[str]
    phrase_count: int
    covered_count: int
    threshold: float


_WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9+#./-]{1,}")

# Minimal stopwords list; keeps scoring deterministic without extra deps.
_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "has",
    "have",
    "in",
    "is",
    "it",
    "its",
    "of",
    "on",
    "or",
    "that",
    "the",
    "to",
    "with",
    "we",
    "you",
    "your",
    "their",
    "our",
    "will",
    "this",
    "these",
    "those",
    "who",
    "what",
    "when",
    "where",
    "why",
    "how",
    "must",
    "should",
    "can",
    "may",
    "preferred",
    "required",
    "requirements",
    "responsibilities",
    "role",
    "job",
    "experience",
    "years",
    "year",
    "plus",
}


def _sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8", errors="ignore")).hexdigest()


def _cache_get(key: str) -> ScoreResult | None:
    now = time.time()
    item = _cache.get(key)
    if not item:
        return None
    ts, val = item
    if now - ts > _CACHE_TTL_S:
        try:
            del _cache[key]
        except KeyError:
            pass
        return None
    # refresh LRU order
    _cache.move_to_end(key)
    return val


def _cache_put(key: str, val: ScoreResult) -> None:
    _cache[key] = (time.time(), val)
    _cache.move_to_end(key)
    while len(_cache) > _CACHE_MAX:
        _cache.popitem(last=False)


def _tokenize(text: str) -> List[str]:
    return [m.group(0) for m in _WORD_RE.finditer(text)]


def _normalize_token(tok: str) -> str:
    # Keep important symbols (C++, CI/CD, node.js) but normalize case.
    return tok.strip().lower()


def _extract_phrases(jd_text: str, cap: int = DEFAULT_PHRASE_CAP) -> List[str]:
    toks = [_normalize_token(t) for t in _tokenize(jd_text)]
    toks = [t for t in toks if t and t not in _STOPWORDS and len(t) >= 2]

    if not toks:
        return []

    # Unigrams by frequency
    uni_counts = Counter(toks)

    # Bigrams/trigrams (skip if any token is stopword-ish or too short)
    bigrams = [" ".join(toks[i : i + 2]) for i in range(len(toks) - 1)]
    trigrams = [" ".join(toks[i : i + 3]) for i in range(len(toks) - 2)]
    bi_counts = Counter(bigrams)
    tri_counts = Counter(trigrams)

    def top_phrases(counter: Counter[str], n: int) -> List[str]:
        return [p for p, _ in counter.most_common(n)]

    # Blend: favor single tokens (skills) + some phrases for context.
    unis = top_phrases(uni_counts, max(10, cap // 2))
    bis = top_phrases(bi_counts, max(10, cap // 3))
    tris = top_phrases(tri_counts, max(5, cap // 6))

    # Dedupe, preserve order.
    out: List[str] = []
    seen = set()
    for p in (unis + bis + tris):
        key = p.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(p.strip())
        if len(out) >= cap:
            break
    return out


def _chunk_resume(resume_text: str, cap: int = DEFAULT_RESUME_CHUNK_CAP) -> List[str]:
    # Keep bullets/lines; fall back to sentence-ish chunks.
    raw_lines = [ln.strip() for ln in resume_text.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    lines = [ln for ln in raw_lines if ln]
    chunks: List[str] = []

    for ln in lines:
        # Remove common bullet prefixes
        ln2 = re.sub(r"^\s*([•*-]|\u2022)\s+", "", ln).strip()
        if ln2:
            chunks.append(ln2)
        if len(chunks) >= cap:
            return chunks

    if chunks:
        return chunks[:cap]

    # Fallback: split into sentence-ish pieces
    parts = re.split(r"(?<=[.!?])\s+", resume_text.strip())
    parts = [p.strip() for p in parts if p.strip()]
    return parts[:cap]


def _cap_total_chars(chunks: List[str], max_chars: int) -> List[str]:
    if max_chars <= 0:
        return chunks
    out: List[str] = []
    total = 0
    for c in chunks:
        if not c:
            continue
        # +1 for join/newline-ish overhead to approximate payload size
        need = len(c) + 1
        if out and total + need > max_chars:
            break
        if not out and need > max_chars:
            # Single chunk too large: truncate deterministically.
            out.append(c[: max(0, max_chars - 1)])
            break
        out.append(c)
        total += need
    return out


def _keyword_overlap_score(resume_text: str, phrases: List[str], threshold: float) -> ScoreResult:
    # Deterministic fallback: phrase presence (case-insensitive).
    rt = (resume_text or "").lower()
    covered: List[str] = []
    missing: List[str] = []
    for p in phrases:
        key = (p or "").strip().lower()
        if not key:
            continue
        if key in rt:
            covered.append(p)
        else:
            missing.append(p)

    phrase_count = len(phrases)
    covered_count = len(covered)
    ats_score = int(round(100.0 * (covered_count / phrase_count))) if phrase_count > 0 else 0
    return ScoreResult(
        ats_score=ats_score,
        covered=covered,
        missing=missing,
        phrase_count=phrase_count,
        covered_count=covered_count,
        threshold=threshold,
    )


def _cosine(a: List[float], b: List[float]) -> float:
    # No numpy dependency.
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0.0 or nb <= 0.0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


def score_resume_against_jd(
    resume_text: str,
    job_description: str,
    *,
    phrase_cap: int = DEFAULT_PHRASE_CAP,
    resume_chunk_cap: int = DEFAULT_RESUME_CHUNK_CAP,
    threshold: float = DEFAULT_THRESHOLD,
    max_embed_chars: int = DEFAULT_MAX_EMBED_CHARS,
) -> ScoreResult:
    resume_text = (resume_text or "").strip()
    job_description = (job_description or "").strip()
    if not resume_text or not job_description:
        return ScoreResult(
            ats_score=0,
            covered=[],
            missing=[],
            phrase_count=0,
            covered_count=0,
            threshold=threshold,
        )

    cache_key = f"{_sha1(resume_text)}:{_sha1(job_description)}:{phrase_cap}:{resume_chunk_cap}:{threshold}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    phrases = _extract_phrases(job_description, cap=phrase_cap)
    resume_chunks = _chunk_resume(resume_text, cap=resume_chunk_cap)
    # Keep payload bounded even if CV is huge / very long lines.
    resume_chunks = _cap_total_chars(resume_chunks, max_chars=max_embed_chars)

    if not phrases or not resume_chunks:
        out = ScoreResult(
            ats_score=0,
            covered=[],
            missing=phrases,
            phrase_count=len(phrases),
            covered_count=0,
            threshold=threshold,
        )
        _cache_put(cache_key, out)
        return out

    try:
        embeddings = GoogleGenerativeAIEmbeddings(model=EMBEDDING_MODEL)
        phrase_vecs = embeddings.embed_documents(phrases)
        chunk_vecs = embeddings.embed_documents(resume_chunks)
    except Exception:
        out = _keyword_overlap_score(resume_text=resume_text, phrases=phrases, threshold=threshold)
        _cache_put(cache_key, out)
        return out

    covered: List[str] = []
    missing: List[str] = []

    for phrase, pv in zip(phrases, phrase_vecs):
        best = 0.0
        for cv in chunk_vecs:
            s = _cosine(pv, cv)
            if s > best:
                best = s
        if best >= threshold:
            covered.append(phrase)
        else:
            missing.append(phrase)

    phrase_count = len(phrases)
    covered_count = len(covered)
    ats_score = int(round(100.0 * (covered_count / phrase_count))) if phrase_count > 0 else 0

    out = ScoreResult(
        ats_score=ats_score,
        covered=covered,
        missing=missing,
        phrase_count=phrase_count,
        covered_count=covered_count,
        threshold=threshold,
    )
    _cache_put(cache_key, out)
    return out

