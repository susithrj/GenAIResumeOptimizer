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

from typing import Dict, List

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from utils.build_kb import CHROMA_DIR, EMBEDDING_MODEL
from langchain_chroma import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings

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

    llm = ChatOpenAI(model="gpt-4o", temperature=0.3)
    structured_llm = llm.with_structured_output(RewriteResult)

    system_prompt = """
    You are an expert resume writer. Your rules are absolute:
    1. NEVER invent experience, skills, or achievements the candidate does not have.
    2. ONLY rewrite using information present in the candidate's resume.
    3. You MAY rephrase, strengthen language, add specificity, and inject keywords
       that reflect work the candidate has demonstrably done.
    4. Every rewrite must be truthful and verifiable.
    """

    prompt = f"""
    Rewrite the weak resume sections to better match this job description.
    Use the JD patterns below as reference for industry-standard language.

    CANDIDATE RESUME:
    {parsed_resume}

    GAP REPORT (what needs fixing):
    {gap_report}

    TARGET JD REQUIREMENTS:
    {parsed_jd}

    INDUSTRY LANGUAGE PATTERNS (from similar {target_role} JDs):
    {pattern_text}

    Rewrite each bullet in weak_sections. Return before/after pairs with reasons.
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

    result = rewrite_resume(
        resume.model_dump(),
        gaps.model_dump(),
        jd.model_dump(),
        target_role="java_developer",
    )

    for bullet in result.rewritten_bullets:
        print(f"\nBEFORE: {bullet.original}")
        print(f"AFTER:  {bullet.rewritten}")
        print(f"WHY:    {bullet.reason}")

