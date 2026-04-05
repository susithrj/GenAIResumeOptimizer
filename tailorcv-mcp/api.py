"""
FastAPI server for tailorcv-ui.

Run from tailorcv-mcp:
  uvicorn api:app --reload --host 127.0.0.1 --port 8000
"""

import os
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from agents.gap_analyzer import analyze_gaps
from agents.jd_parser import parse_jd
from agents.parser import parse_resume
from agents.rewriter import rewrite_resume
from utils.text_merge import build_merged_resume_text, normalize_newlines

_pkg = Path(__file__).resolve().parent
load_dotenv(_pkg / ".env")
load_dotenv(_pkg.parent / ".env")

DEFAULT_ORIGINS = "http://127.0.0.1:5173,http://localhost:5173"
_origins = os.getenv("CORS_ORIGINS", DEFAULT_ORIGINS).split(",")
_origins = [o.strip() for o in _origins if o.strip()]

app = FastAPI(title="TailorCV API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class OptimizeRequest(BaseModel):
    resume_text: str = Field(..., min_length=1, description="Plain text resume body")
    job_description: str = Field(..., min_length=1, description="Job description text")
    target_role: str = Field(
        default="java_developer",
        description="Chroma collection name for RAG (e.g. java_developer)",
    )


class KeywordChip(BaseModel):
    word: str
    status: Literal["added", "found", "missing", "partial"]


class OptimizeResponse(BaseModel):
    """Aligned with GapReport + RewriteResult plus UI-friendly fields."""

    ats_score: int
    missing_skills: list[str]
    weak_sections: list[str]
    matched_skills: list[str]
    missing_keywords: list[str]
    recommendations: list[str]
    rewritten_bullets: list[dict]
    new_summary: str
    overall_changes: str
    rewritten_resume_text: str = Field(
        ...,
        description="User's resume text with rewritten bullets/summary merged in (plain text).",
    )
    keywords: list[KeywordChip]


def _build_keyword_chips(gaps_dump: dict, rewrite_dump: dict) -> list[KeywordChip]:
    """Derive chips for the UI: added from rewrites, found/missing from gap report."""
    by_key: dict[str, KeywordChip] = {}

    def add(word: str, status: Literal["added", "found", "missing", "partial"]) -> None:
        w = word.strip()
        if not w:
            return
        key = w.lower()
        if key in by_key:
            existing = by_key[key]
            priority = {"missing": 0, "partial": 1, "found": 2, "added": 3}
            if priority[status] >= priority[existing.status]:
                by_key[key] = KeywordChip(word=w, status=status)
        else:
            by_key[key] = KeywordChip(word=w, status=status)

    for s in gaps_dump.get("missing_skills") or []:
        add(str(s), "missing")
    for s in gaps_dump.get("missing_keywords") or []:
        add(str(s), "missing")
    for s in gaps_dump.get("matched_skills") or []:
        add(str(s), "found")
    for b in rewrite_dump.get("rewritten_bullets") or []:
        for kw in b.get("keywords_added") or []:
            add(str(kw), "added")

    return list(by_key.values())


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/optimize", response_model=OptimizeResponse)
def optimize(body: OptimizeRequest) -> OptimizeResponse:
    try:
        canonical_resume = normalize_newlines(body.resume_text)
        parsed_resume = parse_resume(canonical_resume.strip())
        parsed_jd = parse_jd(body.job_description.strip())
        gaps = analyze_gaps(
            parsed_resume.model_dump(),
            parsed_jd.model_dump(),
        )
        rewrite = rewrite_resume(
            parsed_resume.model_dump(),
            gaps.model_dump(),
            parsed_jd.model_dump(),
            target_role=body.target_role.strip() or "java_developer",
            raw_resume_text=canonical_resume,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    gaps_dump = gaps.model_dump()
    rewrite_dump = rewrite.model_dump()
    rewritten_resume_text = build_merged_resume_text(
        canonical_resume,
        rewrite_dump,
        parsed_summary=parsed_resume.summary,
    )
    keywords = _build_keyword_chips(gaps_dump, rewrite_dump)

    return OptimizeResponse(
        ats_score=gaps.ats_score,
        missing_skills=gaps.missing_skills,
        weak_sections=gaps.weak_sections,
        matched_skills=gaps.matched_skills,
        missing_keywords=gaps.missing_keywords,
        recommendations=gaps.recommendations,
        rewritten_bullets=rewrite_dump["rewritten_bullets"],
        new_summary=rewrite.new_summary,
        overall_changes=rewrite.overall_changes,
        rewritten_resume_text=rewritten_resume_text,
        keywords=keywords,
    )
