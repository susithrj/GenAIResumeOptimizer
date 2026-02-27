"""
Gap analyzer: compare parsed resume vs parsed JD → ATS score and actionable gaps.
Single responsibility: scoring and gap identification; no rewriting.
"""

from langchain_groq import ChatGroq
from pydantic import BaseModel

from agents.jd_parser import parse_jd
from agents.parser import parse_resume
from utils.pdf_reader import extract_text


class GapReport(BaseModel):
    """Structured gap analysis for the resume vs job description."""

    ats_score: int  # 0–100
    matched_skills: list[str] = []
    missing_skills: list[str] = []
    weak_sections: list[str] = []
    missing_keywords: list[str] = []
    recommendations: list[str] = []


_GAP_ANALYSIS_PROMPT = """
Compare this resume against the job description requirements.

Score the ATS alignment from 0–100 using this formula:
- Start at 100
- Deduct 10 points per missing required skill
- Deduct 5 points per missing important keyword
- Deduct 5 points per weak/vague section
- Minimum score is 0

Identify specific, actionable gaps only. Be precise.

PARSED RESUME:
{parsed_resume}

PARSED JD:
{parsed_jd}
"""


def analyze_gaps(parsed_resume: dict, parsed_jd: dict) -> GapReport:
    """
    Compare resume and JD and return ATS score plus gap report.

    Args:
        parsed_resume: ResumeStructure as dict (e.g. from parse_resume(...).model_dump()).
        parsed_jd: JDStructure as dict (e.g. from parse_jd(...).model_dump()).

    Returns:
        GapReport with ats_score, matched/missing skills, weak_sections, recommendations.
    """
    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0,
    )
    structured_llm = llm.with_structured_output(GapReport)
    prompt = _GAP_ANALYSIS_PROMPT.format(
        parsed_resume=parsed_resume,
        parsed_jd=parsed_jd,
    )
    return structured_llm.invoke(prompt)


if __name__ == "__main__":
    import json
    from dotenv import load_dotenv
    from agents.jd_parser import load_jd_from_file

    load_dotenv()

    resume_text = extract_text("data/resume.pdf")
    resume = parse_resume(resume_text)
    jd_text = load_jd_from_file("data/job_description.txt")
    jd = parse_jd(jd_text)

    report = analyze_gaps(resume.model_dump(), jd.model_dump())

    print(f"\nATS Score: {report.ats_score}/100")
    print(f"Missing skills: {report.missing_skills}")
    print(f"Weak sections: {report.weak_sections}")
    print(json.dumps(report.model_dump(), indent=2))
