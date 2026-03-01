"""
MCP server (Day 15) exposing the ATS optimizer as tools.

Tools:
- optimize_resume(resume_text, jd_text, target_role)
- optimize_resume_to_docx(resume_docx_path, jd_text, target_role)  -> writes DOCX, returns path
- get_ats_score(resume_text, jd_text)
- get_gap_report(resume_text, jd_text)
- add_jd_to_knowledge_base(jd_text, target_role)
"""

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

from agents.gap_analyzer import analyze_gaps
from agents.jd_parser import parse_jd
from agents.parser import parse_resume
from agents.rewriter import rewrite_resume
from utils.build_kb import CHROMA_DIR, EMBEDDING_MODEL
from utils.docx_io import read_docx_to_text_and_map, write_optimized_docx
from utils.paths import resolve_path

from langchain_chroma import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings
try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:
    from langchain.text_splitter import RecursiveCharacterTextSplitter

load_dotenv()

mcp = FastMCP("ATS Resume Optimizer")


@mcp.tool()
def optimize_resume(resume_text: str, jd_text: str, target_role: str = "java_developer") -> dict:
    """
    Full ATS optimization pipeline. Returns JSON only (no file written).

    Use optimize_resume_to_docx when the user wants the result as a Word document (.docx).

    Takes:
      - resume_text: Raw resume text (e.g. copied from DOCX/PDF).
      - jd_text: Job description text.
      - target_role: Role/collection name used for RAG (e.g. "java_developer").

    Returns:
      - ats_score: Alignment score 0–100.
      - missing_skills: Required skills absent from resume.
      - weak_sections: Sections that need improvement.
      - rewritten_bullets: Structured before/after bullet rewrites.
    """
    parsed_resume = parse_resume(resume_text)
    parsed_jd = parse_jd(jd_text)
    gaps = analyze_gaps(
        parsed_resume.model_dump(),
        parsed_jd.model_dump(),
    )
    rewrite = rewrite_resume(
        parsed_resume.model_dump(),
        gaps.model_dump(),
        parsed_jd.model_dump(),
        target_role=target_role,
    )
    return {
        "ats_score": gaps.ats_score,
        "missing_skills": gaps.missing_skills,
        "weak_sections": gaps.weak_sections,
        "rewritten_bullets": rewrite.model_dump(),
    }


@mcp.tool()
def optimize_resume_to_docx(
    resume_docx_path: str,
    jd_text: str,
    target_role: str = "java_developer",
) -> dict:
    """
    Full ATS optimization and write result as a DOCX file (preserves original formatting).

    Use this when the user wants the optimized resume as a Word document, not plain text or JSON.

    Takes:
      - resume_docx_path: Absolute path or path relative to project root to the resume DOCX
        (e.g. "data/resume.docx" or "/Users/.../resume.docx").
      - jd_text: Job description text.
      - target_role: Role for RAG (e.g. "java_developer").

    Returns:
      - output_docx_path: Path to the generated DOCX (output/optimized_resume.docx).
      - ats_score, missing_skills, weak_sections, rewritten_bullets: same as optimize_resume.
    """
    path = resolve_path(resume_docx_path)
    if not path.exists():
        return {
            "error": f"Resume file not found: {path}",
            "output_docx_path": None,
        }
    if not str(path).lower().endswith(".docx"):
        return {
            "error": "Resume path must be a .docx file.",
            "output_docx_path": None,
        }

    resume_text, bullet_map = read_docx_to_text_and_map(path)
    parsed_resume = parse_resume(resume_text)
    parsed_jd = parse_jd(jd_text)
    gaps = analyze_gaps(
        parsed_resume.model_dump(),
        parsed_jd.model_dump(),
    )
    rewrite = rewrite_resume(
        parsed_resume.model_dump(),
        gaps.model_dump(),
        parsed_jd.model_dump(),
        target_role=target_role,
    )

    output_dir = resolve_path("output")
    output_path = output_dir / "optimized_resume.docx"
    write_optimized_docx(
        original_path=path,
        output_path=output_path,
        bullet_map=bullet_map,
        rewritten_bullets=rewrite.model_dump()["rewritten_bullets"],
    )

    return {
        "output_docx_path": str(output_path),
        "ats_score": gaps.ats_score,
        "missing_skills": gaps.missing_skills,
        "weak_sections": gaps.weak_sections,
        "rewritten_bullets": rewrite.model_dump(),
    }


@mcp.tool()
def get_ats_score(resume_text: str, jd_text: str) -> dict:
    """
    Quick ATS score only (no rewriting).

    Use when the user just wants an alignment score and a list
    of missing skills vs the job description.

    Returns:
      - ats_score: 0–100
      - missing_skills: required skills not present in resume
      - matched_skills: skills present in both resume and JD
    """
    parsed_resume = parse_resume(resume_text)
    parsed_jd = parse_jd(jd_text)
    gaps = analyze_gaps(
        parsed_resume.model_dump(),
        parsed_jd.model_dump(),
    )
    return {
        "ats_score": gaps.ats_score,
        "missing_skills": gaps.missing_skills,
        "matched_skills": gaps.matched_skills,
    }


@mcp.tool()
def get_gap_report(resume_text: str, jd_text: str) -> dict:
    """
    Detailed gap analysis only (no rewriting).

    Use when the user wants to understand:
      - score
      - missing skills
      - weak sections
      - missing keywords
      - recommendations
    before deciding to rewrite.
    """
    parsed_resume = parse_resume(resume_text)
    parsed_jd = parse_jd(jd_text)
    gaps = analyze_gaps(
        parsed_resume.model_dump(),
        parsed_jd.model_dump(),
    )
    return gaps.model_dump()


@mcp.tool()
def add_jd_to_knowledge_base(jd_text: str, target_role: str) -> dict:
    """
    Add a job description to the RAG knowledge base for a specific role.

    More JDs added for a role → better, more grounded bullet rewrites
    for that role (e.g. "java_developer", "mern_developer", "ai_engineer").

    This uses the same Google embeddings + Chroma setup as build_kb.py.
    """
    collection_name = target_role.lower().replace(" ", "_")
    embeddings = GoogleGenerativeAIEmbeddings(model=EMBEDDING_MODEL)
    vectorstore = Chroma(
        collection_name=collection_name,
        persist_directory=str(CHROMA_DIR),
        embedding_function=embeddings,
    )
    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    chunks = splitter.split_text(jd_text)
    vectorstore.add_texts(
        texts=chunks,
        metadatas=[{"role": collection_name}] * len(chunks),
    )
    return {
        "status": "added",
        "collection": collection_name,
        "chunks_added": len(chunks),
    }


if __name__ == "__main__":
    mcp.run()

