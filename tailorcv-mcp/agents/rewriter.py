"""
Rewriter agent (Day 6).

Takes:
- parsed_resume (dict)
- gap_report   (dict)
- parsed_jd    (dict)

Does:
- Uses the role-specific Chroma collection (built in utils/build_kb.py)
  with Google Generative AI embeddings
- Retrieves JD language patterns
- Asks an LLM to rewrite weak bullets truthfully
"""

from __future__ import annotations

from typing import Dict, List

from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_groq import ChatGroq
from pydantic import BaseModel

from utils.build_kb import CHROMA_DIR, EMBEDDING_MODEL
from langchain_chroma import Chroma

load_dotenv()


class RewrittenBullet(BaseModel):
    original: str
    rewritten: str
    reason: str
    keywords_added: List[str]


class RewriteResult(BaseModel):
    rewritten_bullets: List[RewrittenBullet]
    new_summary: str
    overall_changes: str


def _build_vectorstore(collection_name: str) -> Chroma:
    """
    Create a Chroma vector store for a given role collection using
    the shared Google embedding model and persisted DB directory.
    """
    embeddings = GoogleGenerativeAIEmbeddings(model=EMBEDDING_MODEL)
    return Chroma(
        collection_name=collection_name,
        persist_directory=str(CHROMA_DIR),
        embedding_function=embeddings,
    )


def rewrite_resume(
    parsed_resume: Dict,
    gap_report: Dict,
    parsed_jd: Dict,
    target_role: str = "java_developer",
    raw_resume_text: str | None = None,
) -> RewriteResult:
    """
    Rewrite weak resume bullets using RAG-retrieved JD patterns.

    target_role must match a collection name in ChromaDB, e.g. "java_developer".
    """
    collection_name = target_role.lower().replace(" ", "_")

    vectorstore = _build_vectorstore(collection_name)

    query = f"{parsed_jd.get('job_title', '')} {' '.join(parsed_jd.get('required_skills', []))}"
    patterns = vectorstore.similarity_search(query, k=3)
    pattern_text = "\n---\n".join([p.page_content for p in patterns]) if patterns else ""

    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0.3,
    )
    structured_llm = llm.with_structured_output(RewriteResult)

    system_prompt = """
    You are an expert resume writer. Your rules are absolute:
    1. NEVER invent experience, skills, or achievements the candidate does not have.
    2. ONLY rewrite using information present in the candidate's resume.
    3. You MAY rephrase, strengthen language, add specificity, and inject keywords
       that reflect work the candidate has demonstrably done.
    4. Every rewrite must be truthful and verifiable.
    5. For each bullet, the "original" field MUST be copied EXACTLY from the verbatim
       resume text provided (same characters, spacing, and line breaks as that line or span).
       This enables surgical find-and-replace in the user's document.
    """

    verbatim_block = ""
    if raw_resume_text and raw_resume_text.strip():
        verbatim_block = f"""
    VERBATIM RESUME (copy each "original" bullet from this text only — exact match required):
    \"\"\"{raw_resume_text}\"\"\"

    """

    prompt = f"""
    Rewrite the weak resume sections to better match this job description.
    Use the JD patterns below as reference for industry-standard language.
{verbatim_block}
    STRUCTURED RESUME (for context):
    {parsed_resume}

    GAP REPORT (what needs fixing):
    {gap_report}

    TARGET JD REQUIREMENTS:
    {parsed_jd}

    INDUSTRY LANGUAGE PATTERNS (from similar {target_role} JDs):
    {pattern_text}

    Rewrite bullets that need improvement. Return before/after pairs with reasons.
    Each "original" must appear verbatim in the VERBATIM RESUME block when provided,
    otherwise match a line from the structured experience bullets exactly as the candidate wrote it.
    """

    return structured_llm.invoke(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ]
    )


if __name__ == "__main__":
    from agents.gap_analyzer import analyze_gaps
    from agents.jd_parser import load_jd_from_file, parse_jd
    from agents.parser import parse_resume
    from utils.pdf_reader import extract_text

    load_dotenv()

    resume = parse_resume(extract_text("data/resume.pdf"))
    jd = parse_jd(load_jd_from_file("data/job_description.txt"))
    gaps = analyze_gaps(resume.model_dump(), jd.model_dump())

    from utils.text_merge import normalize_newlines

    text_raw = extract_text("data/resume.pdf")
    result = rewrite_resume(
        resume.model_dump(),
        gaps.model_dump(),
        jd.model_dump(),
        target_role="java_developer",
        raw_resume_text=normalize_newlines(text_raw),
    )

    for bullet in result.rewritten_bullets:
        print(f"\nBEFORE: {bullet.original}")
        print(f"AFTER:  {bullet.rewritten}")
        print(f"WHY:    {bullet.reason}")

