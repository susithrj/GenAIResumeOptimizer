"""
Resume section parser: raw resume text → structured sections (Pydantic).
Single responsibility: extraction only; no scoring or rewriting.
"""

from typing import Optional

from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from utils.pdf_reader import extract_text


class Experience(BaseModel):
    """One job/role entry."""

    company: str
    role: str
    duration: str
    bullets: list[str]


class ResumeStructure(BaseModel):
    """Structured resume for downstream agents. Missing sections are empty lists."""

    name: str
    summary: Optional[str] = None
    skills: list[str] = []
    experience: list[Experience] = []
    education: list[str] = []
    certifications: list[str] = []


_EXTRACT_PROMPT = """
Extract the structured information from this resume.
Be precise. Do not invent or infer information not present.
Return empty lists for sections that do not exist.

RESUME:
{resume_text}
"""


def parse_resume(resume_text: str) -> ResumeStructure:
    """
    Extract structured sections from raw resume text using an LLM with structured output.

    Args:
        resume_text: Full resume text (e.g. from PDF extraction).

    Returns:
        ResumeStructure with name, skills, experience, education, etc.
    """
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    structured_llm = llm.with_structured_output(ResumeStructure)
    prompt = _EXTRACT_PROMPT.format(resume_text=resume_text)
    return structured_llm.invoke(prompt)


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    text = extract_text("data/resume.pdf")
    result = parse_resume(text)
    print(result.model_dump_json(indent=2))
