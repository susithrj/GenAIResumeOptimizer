"""
Day 7 — End-to-end ATS optimizer pipeline.

Orchestrates the agents:
- PDF → text      (utils.pdf_reader.extract_text)
- text → resume   (agents.parser.parse_resume, Groq)
- text → JD       (agents.jd_parser.parse_jd, Groq)
- resume + JD → gaps (agents.gap_analyzer.analyze_gaps, Groq)
- gaps → rewrites (agents.rewriter.rewrite_resume, Groq + Google embeddings)
"""

import json
import os
from typing import Optional

from dotenv import load_dotenv

from agents.gap_analyzer import analyze_gaps
from agents.jd_parser import parse_jd
from agents.parser import parse_resume
from agents.rewriter import rewrite_resume
from utils.docx_io import read_docx_to_text_and_map, write_optimized_docx
from utils.pdf_reader import extract_text
from utils.paths import resolve_path
from utils.text_merge import build_merged_resume_text, normalize_newlines

load_dotenv()


def run_pipeline(
    resume_path: str,
    jd_path: str,
    target_role: str = "java_developer",
) -> dict:
    """
    Run the full ATS optimization pipeline and return structured result.
    """
    # Resolve against project root so it works from any cwd
    resume_path_resolved = resolve_path(resume_path)
    jd_path_resolved = resolve_path(jd_path)

    os.makedirs(resolve_path("output"), exist_ok=True)

    print("\n── ATS RESUME OPTIMIZER ──────────────────")
    print(f"Resume:      {resume_path_resolved}")
    print(f"JD:          {jd_path_resolved}")
    print(f"Target role: {target_role}")
    print("──────────────────────────────────────────\n")

    print("Step 1/4  Parsing resume...")
    bullet_map = {}
    if str(resume_path_resolved).lower().endswith(".docx"):
        resume_text, bullet_map = read_docx_to_text_and_map(resume_path_resolved)
    else:
        resume_text = extract_text(str(resume_path_resolved))
    canonical_resume = normalize_newlines(resume_text)
    parsed_resume = parse_resume(canonical_resume.strip())
    print("          ✓ Resume parsed\n")

    print("Step 2/4  Parsing job description...")
    with open(jd_path_resolved, "r", encoding="utf-8") as f:
        jd_text = f.read()
    parsed_jd = parse_jd(jd_text)
    print(f"          ✓ JD parsed — {parsed_jd.job_title}\n")

    print("Step 3/4  Analyzing gaps...")
    gaps = analyze_gaps(parsed_resume.model_dump(), parsed_jd.model_dump())
    print(f"          ✓ ATS Score: {gaps.ats_score}/100")
    if gaps.missing_skills:
        print(f"          ✗ Missing:   {', '.join(gaps.missing_skills[:3])}\n")
    else:
        print("          ✗ Missing:   (none)\n")

    print("Step 4/4  Rewriting resume...")
    rewrite = rewrite_resume(
        parsed_resume.model_dump(),
        gaps.model_dump(),
        parsed_jd.model_dump(),
        target_role=target_role,
        raw_resume_text=canonical_resume,
    )
    print(f"          ✓ {len(rewrite.rewritten_bullets)} bullets rewritten\n")

    merged_resume_text = build_merged_resume_text(
        canonical_resume,
        rewrite.model_dump(),
        parsed_summary=parsed_resume.summary,
    )

    print("══════════════════════════════════════════")
    print(" RESULT REPORT")
    print("══════════════════════════════════════════\n")
    print(f" ATS Score: {gaps.ats_score}/100")
    print(f" Missing:   {', '.join(gaps.missing_skills) or '(none)'}")
    print(f" Weak:      {', '.join(gaps.weak_sections) or '(none)'}\n")
    print(" REWRITES:")
    for b in rewrite.rewritten_bullets:
        print(f"\n  BEFORE: {b.original}")
        print(f"  AFTER:  {b.rewritten}")

    result = {
        "ats_score": gaps.ats_score,
        "target_role": target_role,
        "parsed_resume": parsed_resume.model_dump(),
        "parsed_jd": parsed_jd.model_dump(),
        "gaps": gaps.model_dump(),
        "rewrites": rewrite.model_dump(),
        "merged_resume_text": merged_resume_text,
    }

    # Save JSON result
    output_dir = resolve_path("output")
    with open(output_dir / "result.json", "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    with open(output_dir / "optimized_resume.txt", "w", encoding="utf-8") as f:
        f.write(merged_resume_text)

    # Save optimized resume DOCX (only when input was DOCX and we have a bullet map)
    if bullet_map:
        write_optimized_docx(
            original_path=resume_path_resolved,
            output_path=output_dir / "optimized_resume.docx",
            bullet_map=bullet_map,
            rewritten_bullets=result["rewrites"]["rewritten_bullets"],
        )

    print("\n──────────────────────────────────────────")
    print(f" Saved → {output_dir / 'result.json'}")
    print(f" Saved → {output_dir / 'optimized_resume.txt'}")
    if bullet_map:
        print(f" Saved → {output_dir / 'optimized_resume.docx'}")
    print("──────────────────────────────────────────\n")

    return result


if __name__ == "__main__":
    # Defaults match the project structure.
    # Use the DOCX resume so we can preserve formatting in the optimized output.
    run_pipeline("data/resume.docx", "data/job_description.txt", target_role="java_developer")

