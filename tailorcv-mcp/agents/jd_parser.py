"""
Job description parser: raw JD text → structured requirements (Pydantic).
Single responsibility: extract required/preferred skills, seniority, keywords.
"""

from typing import Optional

from langchain_groq import ChatGroq
from pydantic import BaseModel

from utils.paths import resolve_path


class JDStructure(BaseModel):
    """Structured job description for gap analysis and rewriting."""

    job_title: str
    company: Optional[str] = None
    seniority: str  # e.g. Junior / Mid / Senior / Lead
    domain: str  # e.g. AI Engineering, Backend, Fullstack
    required_skills: list[str] = []  # must-have
    preferred_skills: list[str] = []  # nice-to-have
    keywords: list[str] = []  # important terms for ATS
    responsibilities: list[str] = []


_JD_EXTRACT_PROMPT = """
Extract structured requirements from this job description.
- Classify skills as required (explicitly stated as required/must-have) vs preferred (nice-to-have/bonus/preferred).
- Extract important keywords that an ATS system would scan for.

JOB DESCRIPTION:
{jd_text}
"""


def parse_jd(jd_text: str) -> JDStructure:
    """
    Extract structured JD from raw text using an LLM with structured output.

    Args:
        jd_text: Full job description text.

    Returns:
        JDStructure with job_title, seniority, required/preferred skills, keywords.
    """
    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0,
    )
    structured_llm = llm.with_structured_output(JDStructure)
    prompt = _JD_EXTRACT_PROMPT.format(jd_text=jd_text)
    return structured_llm.invoke(prompt)


def load_jd_from_file(jd_path: str) -> str:
    """Load JD text from a file path (resolved against project root if relative)."""
    resolved = resolve_path(jd_path)
    with open(resolved, "r", encoding="utf-8") as f:
        return f.read()


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    jd_text = load_jd_from_file("data/job_description.txt")
    result = parse_jd(jd_text)
    print(result.model_dump_json(indent=2))
