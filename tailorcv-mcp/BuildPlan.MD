# ATS Resume Optimizer — Build Plan

> Day-by-day breakdown from empty folder to portfolio-ready GenAI project
> with MCP server and REST API.

---

## Overview

| Phase | Days | Theme | Gate |
|---|---|---|---|
| Week 1 | Days 1–7 | Build the Pipeline | Working end-to-end CLI |
| Week 2 | Days 8–14 | Make it Smart | Portfolio-ready project |
| Extension | Day 15 | MCP Server | Claude Desktop / Cursor integration |
| Extension | Day 16 | REST API | Postman / web access |

---

## Architecture — 3 Entry Points, 1 Pipeline

```
CLI (optimize.py)     MCP (server.py)      REST (api.py)
       │                     │                    │
       └─────────────────────┴────────────────────┘
                             │
                     agents/ pipeline
              (parser → jd_parser → gap_analyzer → rewriter)
                             │
                     graph/workflow.py
                     (LangGraph StateGraph)
                             │
              ┌──────────────┴──────────────┐
          ChromaDB                       SQLite
      (RAG knowledge base)            (checkpoints)
```

---

## Before You Start

```bash
# confirm venv is active
echo $VIRTUAL_ENV

# install packages
pip install -r requirements.txt

# create folder structure
mkdir -p agents utils data output graph data/jds
touch .env .gitignore optimize.py test.py
```

**`.env`**
```
OPENAI_API_KEY=sk-...
```

**`.env.example`** ← commit this, never commit real `.env`
```
OPENAI_API_KEY=your-key-here
```

**`.gitignore`**
```
.env
.venv/
__pycache__/
*.pyc
runs.db
output/
.DS_Store
data/chroma_db/
```

**`requirements.txt`**
```
langchain
langchain-openai
langgraph
pypdf
chromadb
python-dotenv
tiktoken
pydantic
mcp
fastmcp
fastapi
uvicorn
```

---

# WEEK 1 — Build the Pipeline

> Goal: By end of Day 7 you can run `python optimize.py` and get a
> full ATS report in the terminal.

---

## ✅ Day 1 — PDF Reader

**File:** `utils/pdf_reader.py`

**Goal:** Extract raw text from a resume PDF.
The pipeline needs a mouth before it can think.

**Concepts:** Document loading, text extraction, file I/O, SOLID design

**Tasks:**
1. Drop your resume PDF into `data/resume.pdf`
2. Create `utils/pdf_reader.py`
3. Read every page, concatenate text, skip empty pages
4. Add path resolver so relative paths work from any location
5. Print first 500 chars to confirm it works

**Code:**
```python
# utils/pdf_reader.py
from pathlib import Path
from pypdf import PdfReader

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def resolve_path(pdf_path):
    """Resolve relative paths against project root."""
    path = Path(pdf_path)
    if path.is_absolute():
        return path
    return PROJECT_ROOT / path


def extract_text(pdf_path):
    """
    Extract and return all text from a PDF file.
    Skips empty pages automatically.

    Args:
        pdf_path: Absolute or project-relative path to the PDF.

    Raises:
        FileNotFoundError: If the file does not exist.
    """
    resolved = resolve_path(pdf_path)

    if not resolved.exists():
        raise FileNotFoundError(f"PDF not found: {resolved}")

    reader = PdfReader(str(resolved))
    pages  = []

    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            pages.append(page_text.strip())

    return "\n".join(pages)


def pdf_stats(pdf_path):
    """Return basic stats about a PDF without re-extracting text."""
    resolved = resolve_path(pdf_path)
    reader   = PdfReader(str(resolved))
    return {
        "path":  str(resolved),
        "pages": len(reader.pages),
    }


if __name__ == "__main__":
    PATH  = "data/resume.pdf"
    text  = extract_text(PATH)
    stats = pdf_stats(PATH)

    print(text[:500])
    print(f"\n--- Total characters : {len(text)} ---")
    print(f"--- Total pages      : {stats['pages']} ---")
```

**Run:**
```bash
python utils/pdf_reader.py
```

**Done when:** Resume text prints to terminal.
Character count looks right (2000–6000 chars for 1–2 page resume).

**Common issues:**
- Empty output → PDF is image-based (scanned).
  Export from Google Docs or Word instead.
- Garbled text → font encoding issue. Try a different PDF export.

**Git commit:**
```bash
git add . && git commit -m "day-1: pdf reader"
```

---

## Day 2 — Resume Section Parser

**File:** `agents/parser.py`

**Goal:** Break raw resume text into structured sections
the LLM can reason about individually.

**Concepts:** Structured output, Pydantic schemas, prompt engineering, GPT-4o

**Tasks:**
1. Define Pydantic models for resume structure
2. Write a prompt that instructs the LLM to extract sections
3. Use `with_structured_output()` to enforce JSON schema
4. Test with your resume, print structured output
5. Handle edge cases: missing sections return empty lists not errors

**Code:**
```python
# agents/parser.py
from pydantic import BaseModel
from typing import Optional
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv

load_dotenv()


class Experience(BaseModel):
    company:  str
    role:     str
    duration: str
    bullets:  list[str]


class ResumeStructure(BaseModel):
    name:           str
    summary:        Optional[str]
    skills:         list[str]
    experience:     list[Experience]
    education:      list[str]
    certifications: list[str]


def parse_resume(resume_text):
    """Parse raw resume text into structured sections."""
    llm            = ChatOpenAI(model="gpt-4o", temperature=0)
    structured_llm = llm.with_structured_output(ResumeStructure)

    prompt = f"""
    Extract the structured information from this resume.
    Be precise. Do not invent or infer information not present.
    Return empty lists for sections that do not exist.

    RESUME:
    {resume_text}
    """
    return structured_llm.invoke(prompt)


if __name__ == "__main__":
    from utils.pdf_reader import extract_text

    text   = extract_text("data/resume.pdf")
    result = parse_resume(text)
    print(result.model_dump_json(indent=2))
```

**Run:**
```bash
python agents/parser.py
```

**Done when:** Clean JSON with name, skills, experience with bullets,
education. No hallucinated data.

**Git commit:**
```bash
git add . && git commit -m "day-2: resume parser with structured output"
```

---

## Day 3 — Job Description Parser

**File:** `agents/jd_parser.py`

**Goal:** Extract what the job actually wants —
required skills, nice-to-haves, seniority, domain keywords.

**Concepts:** Keyword extraction, requirement classification, structured output

**Tasks:**
1. Create `data/job_description.txt` — paste a real JD you are targeting
2. Define a Pydantic model for JD structure
3. Classify skills as required vs nice-to-have
4. Extract seniority level and domain
5. Test with 2–3 different JDs to confirm consistency

**Code:**
```python
# agents/jd_parser.py
from pydantic import BaseModel
from typing import Optional
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv

load_dotenv()


class JDStructure(BaseModel):
    job_title:        str
    company:          Optional[str]
    seniority:        str           # Junior / Mid / Senior / Lead
    domain:           str           # e.g. AI Engineering, Backend, Fullstack
    required_skills:  list[str]     # must have
    preferred_skills: list[str]     # nice to have
    keywords:         list[str]     # ATS keywords from JD
    responsibilities: list[str]     # key responsibilities


def parse_jd(jd_text):
    """Parse job description text into structured requirements."""
    llm            = ChatOpenAI(model="gpt-4o", temperature=0)
    structured_llm = llm.with_structured_output(JDStructure)

    prompt = f"""
    Extract structured requirements from this job description.
    Classify skills as required (must-have) vs preferred (nice-to-have).
    Extract important keywords that an ATS system would scan for.

    JOB DESCRIPTION:
    {jd_text}
    """
    return structured_llm.invoke(prompt)


if __name__ == "__main__":
    with open("data/job_description.txt", "r") as f:
        jd_text = f.read()

    result = parse_jd(jd_text)
    print(result.model_dump_json(indent=2))
```

**Run:**
```bash
python agents/jd_parser.py
```

**Done when:** Required vs preferred skills clearly separated.
Keywords list has 10+ terms. Seniority correctly identified.

**Git commit:**
```bash
git add . && git commit -m "day-3: jd parser"
```

---

## Day 4 — Gap Analyzer Agent

**File:** `agents/gap_analyzer.py`

**Goal:** Compare resume against JD.
Produce an ATS score and specific list of gaps.

**Concepts:** Scoring logic, comparison, structured analysis

**Tasks:**
1. Take parsed resume + parsed JD as inputs
2. Implement scoring formula
3. Identify weak sections: thin bullets, missing keywords, vague language
4. Output structured gap report with score + actionable gaps
5. Test on your own resume — score should be realistic, not 100

**Code:**
```python
# agents/gap_analyzer.py
from pydantic import BaseModel
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv

load_dotenv()


class GapReport(BaseModel):
    ats_score:        int       # 0-100
    matched_skills:   list[str]
    missing_skills:   list[str]
    weak_sections:    list[str]
    missing_keywords: list[str]
    recommendations:  list[str]


def analyze_gaps(parsed_resume, parsed_jd):
    """Compare resume vs JD and return ATS score with gap details."""
    llm            = ChatOpenAI(model="gpt-4o", temperature=0)
    structured_llm = llm.with_structured_output(GapReport)

    prompt = f"""
    Compare this resume against the job description requirements.

    Score ATS alignment from 0-100:
    - Start at 100
    - Deduct 10 points per missing required skill
    - Deduct 5 points per missing important keyword
    - Deduct 5 points per weak or vague section
    - Minimum score is 0

    Identify specific, actionable gaps only. Be precise.

    PARSED RESUME:
    {parsed_resume}

    PARSED JD:
    {parsed_jd}
    """
    return structured_llm.invoke(prompt)


if __name__ == "__main__":
    from agents.parser import parse_resume
    from agents.jd_parser import parse_jd
    from utils.pdf_reader import extract_text

    resume = parse_resume(extract_text("data/resume.pdf"))
    with open("data/job_description.txt") as f:
        jd = parse_jd(f.read())

    report = analyze_gaps(resume.model_dump(), jd.model_dump())
    print(f"\nATS Score:      {report.ats_score}/100")
    print(f"Missing skills: {report.missing_skills}")
    print(f"Weak sections:  {report.weak_sections}")
```

**Run:**
```bash
python agents/gap_analyzer.py
```

**Done when:** Score is realistic. Missing skills are real gaps, not hallucinated.

**Git commit:**
```bash
git add . && git commit -m "day-4: gap analyzer with ats scoring"
```

---

## Day 5 — RAG Knowledge Base

**File:** `utils/build_kb.py`

**Goal:** Embed 20+ real JDs into ChromaDB so the rewriter
can retrieve industry-standard language patterns.

**Concepts:** Embeddings, vector databases, chunking, semantic search, RAG

**Why 20 JDs — important to understand:**
```
Real JD (input)       →  WHAT skills to match
20 JDs in ChromaDB    →  HOW to write about those skills

The 20 JDs teach the rewriter the language and phrasing
that employers in your target industry actually use.

These are NOT for matching your resume against.
They are the rewriter's vocabulary reference.
More JDs = better, more human-sounding rewrites.
```

**Organise JDs by role — one folder per role:**
```
data/jds/
  ├── java_developer/
  │     ├── jd_sysco.txt
  │     └── jd_wso2.txt
  ├── ai_engineer/
  │     └── jd_grab.txt
  └── senior_swe/
        └── jd_99x.txt
```

Role-based folders let the rewriter query only the relevant
collection for the user's target role. A MERN developer gets
MERN patterns, a Java developer gets Java patterns.

**Tasks:**
1. Collect 20 real JDs for your target role from LinkedIn
2. Save each as `.txt` in `data/jds/your_role/`
3. Write `utils/build_kb.py` to embed and store per role collection
4. Write a query function to test retrieval
5. Confirm retrieval returns relevant chunks

**Code (updated: Google embeddings):**
```python
# utils/build_kb.py
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from langchain_chroma import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter

from utils.paths import resolve_path

load_dotenv()

JDS_DIR    = resolve_path("data/jds")
CHROMA_DIR = resolve_path("data/chroma_db")

CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
EMBEDDING_MODEL = "models/gemini-embedding-001"


def build_knowledge_base(
    jds_dir: Optional[Path] = None, chroma_dir: Optional[Path] = None
) -> None:
    """Build ChromaDB collections from JDs organised by role folder."""
    base = jds_dir or JDS_DIR
    persist = chroma_dir or CHROMA_DIR

    embeddings = GoogleGenerativeAIEmbeddings(model=EMBEDDING_MODEL)
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )

    for role_folder in base.iterdir():
        if not role_folder.is_dir():
            continue

        collection_name = role_folder.name  # e.g. "java_developer"
        chunks, metadatas = [], []

        for jd_file in role_folder.glob("*.txt"):
            text = jd_file.read_text(encoding="utf-8")
            doc_chunks = splitter.split_text(text)
            chunks.extend(doc_chunks)
            metadatas.extend(
                [{"role": collection_name, "source": jd_file.name}]
                * len(doc_chunks)
            )

        if chunks:
            vectorstore = Chroma(
                collection_name=collection_name,
                persist_directory=str(persist),
                embedding_function=embeddings,
            )
            vectorstore.add_texts(texts=chunks, metadatas=metadatas)
            print(f"Built: {collection_name} ({len(chunks)} chunks)")


def query_kb(query, collection_name="java_developer", k=3):
    """Query a specific role collection in ChromaDB."""
    embeddings = GoogleGenerativeAIEmbeddings(model=EMBEDDING_MODEL)
    vectorstore = Chroma(
        collection_name=collection_name,
        persist_directory=str(CHROMA_DIR),
        embedding_function=embeddings,
    )
    results = vectorstore.similarity_search(query, k=k)
    return [r.page_content for r in results]


if __name__ == "__main__":
    build_knowledge_base()

    results = query_kb("senior software engineer microservices AWS")
    print("\nSample retrieval:")
    for i, r in enumerate(results):
        print(f"\n[{i+1}] {r[:200]}...")
```

**Run:**
```bash
# run once to build the knowledge base
python utils/build_kb.py
```

**Done when:** `data/chroma_db/` folder created.
Test query returns relevant JD chunks.

**Git commit:**
```bash
git add . && git commit -m "day-5: rag knowledge base with chromadb"
```

---

## Day 6 — Rewriter Agent

**File:** `agents/rewriter.py`

**Goal:** Rewrite weak resume bullets using RAG-retrieved patterns.
Inject missing keywords naturally. Never hallucinate.

**Concepts:** RAG retrieval, prompt guardrails, before/after transformation

**How RAG and LLM combine here:**
```
STEP 1 — Embedding model (text-embedding-3-small)
  query = job_title + required_skills
  ChromaDB returns top 3 JD chunks for this role
  (real industry language patterns)

STEP 2 — Combine (pure Python, no model)
  prompt = resume + gaps + JD + retrieved chunks

STEP 3 — LLM (GPT-4o)
  reads everything together
  rewrites bullets using real industry language
  never invents experience
```

**Tasks:**
1. Write `agents/rewriter.py`
2. Query the right ChromaDB collection for the target role
3. Inject retrieved patterns into rewriter prompt
4. System prompt enforces: only use candidate's real experience
5. Return before/after pairs with reason for each change

**Code:**
```python
from pydantic import BaseModel
from langchain_openai import ChatOpenAI
from langchain_chroma import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from dotenv import load_dotenv

load_dotenv()

CHROMA_DIR = "data/chroma_db"
EMBEDDING_MODEL = "models/gemini-embedding-001"


class RewrittenBullet(BaseModel):
    original:       str
    rewritten:      str
    reason:         str
    keywords_added: list[str]


class RewriteResult(BaseModel):
    rewritten_bullets: list[RewrittenBullet]
    new_summary:       str
    overall_changes:   str


def rewrite_resume(parsed_resume, gap_report, parsed_jd, target_role="general"):
    """
    Rewrite resume bullets using RAG-retrieved JD patterns.
    target_role must match a collection name in ChromaDB.
    """
    collection_name = target_role.lower().replace(" ", "_")

    embeddings  = GoogleGenerativeAIEmbeddings(model=EMBEDDING_MODEL)
    vectorstore = Chroma(
        collection_name    = collection_name,
        persist_directory  = CHROMA_DIR,
        embedding_function = embeddings
    )

    query        = f"{parsed_jd.get('job_title')} {' '.join(parsed_jd.get('required_skills', []))}"
    patterns     = vectorstore.similarity_search(query, k=3)
    pattern_text = "\n---\n".join([p.page_content for p in patterns])

    llm            = ChatOpenAI(model="gpt-4o", temperature=0.3)
    structured_llm = llm.with_structured_output(RewriteResult)

    system_prompt = """
    You are an expert resume writer. Your rules are absolute:
    1. NEVER invent experience, skills, or achievements the candidate does not have
    2. ONLY rewrite using information present in the candidate's resume
    3. You MAY rephrase, strengthen language, add specificity, and inject keywords
       that reflect work the candidate has demonstrably done
    4. Every rewrite must be truthful and verifiable
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

    return structured_llm.invoke([
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": prompt}
    ])


if __name__ == "__main__":
    from agents.parser import parse_resume
    from agents.jd_parser import parse_jd
    from agents.gap_analyzer import analyze_gaps
    from utils.pdf_reader import extract_text

    resume = parse_resume(extract_text("data/resume.pdf"))
    with open("data/job_description.txt") as f:
        jd = parse_jd(f.read())

    gaps   = analyze_gaps(resume.model_dump(), jd.model_dump())
    result = rewrite_resume(
        resume.model_dump(),
        gaps.model_dump(),
        jd.model_dump(),
        target_role="java_developer"
    )

    for bullet in result.rewritten_bullets:
        print(f"\nBEFORE: {bullet.original}")
        print(f"AFTER:  {bullet.rewritten}")
        print(f"WHY:    {bullet.reason}")
```

**Run:**
```bash
python agents/rewriter.py
```

**Done when:** Before/after bullets look genuinely improved.
Keywords injected naturally. Nothing fabricated.

**Git commit:**
```bash
git add . && git commit -m "day-6: rewriter agent with rag retrieval"
```

---

## Day 7 — Wire End-to-End Pipeline

**File:** `optimize.py`

**Goal:** Connect all agents in a single script. One command, full output.

**Concepts:** Pipeline orchestration, JSON output, file saving

**Tasks:**
1. Write `optimize.py` — the main entry point
2. Call each agent in sequence: pdf → parse → jd → gaps → rewrite
3. Print a clean terminal report
4. Save `output/result.json` with full structured data
5. Save `output/optimized_resume.txt` with rewritten resume
6. Test with your own resume and a real JD

**Code:**
```python
# optimize.py
import json
import os
from dotenv import load_dotenv
from utils.pdf_reader import extract_text
from agents.parser import parse_resume
from agents.jd_parser import parse_jd
from agents.gap_analyzer import analyze_gaps
from agents.rewriter import rewrite_resume

load_dotenv()


def run_pipeline(resume_path, jd_path, target_role="general"):
    os.makedirs("output", exist_ok=True)

    print("\n── ATS RESUME OPTIMIZER ──────────────────")
    print(f"Resume:      {resume_path}")
    print(f"JD:          {jd_path}")
    print(f"Target role: {target_role}")
    print("──────────────────────────────────────────\n")

    print("Step 1/4  Parsing resume...")
    resume_text   = extract_text(resume_path)
    parsed_resume = parse_resume(resume_text)
    print("          ✓ Resume parsed\n")

    print("Step 2/4  Parsing job description...")
    with open(jd_path, "r") as f:
        jd_text = f.read()
    parsed_jd = parse_jd(jd_text)
    print(f"          ✓ JD parsed — {parsed_jd.job_title}\n")

    print("Step 3/4  Analyzing gaps...")
    gaps = analyze_gaps(parsed_resume.model_dump(), parsed_jd.model_dump())
    print(f"          ✓ ATS Score: {gaps.ats_score}/100")
    print(f"          ✗ Missing:   {', '.join(gaps.missing_skills[:3])}\n")

    print("Step 4/4  Rewriting resume...")
    rewrite = rewrite_resume(
        parsed_resume.model_dump(),
        gaps.model_dump(),
        parsed_jd.model_dump(),
        target_role=target_role
    )
    print(f"          ✓ {len(rewrite.rewritten_bullets)} bullets rewritten\n")

    print("══════════════════════════════════════════")
    print(" RESULT REPORT")
    print("══════════════════════════════════════════\n")
    print(f" ATS Score: {gaps.ats_score}/100")
    print(f" Missing:   {', '.join(gaps.missing_skills)}")
    print(f" Weak:      {', '.join(gaps.weak_sections)}\n")
    print(" REWRITES:")
    for b in rewrite.rewritten_bullets:
        print(f"\n  BEFORE: {b.original}")
        print(f"  AFTER:  {b.rewritten}")

    result = {
        "ats_score":     gaps.ats_score,
        "target_role":   target_role,
        "parsed_resume": parsed_resume.model_dump(),
        "parsed_jd":     parsed_jd.model_dump(),
        "gaps":          gaps.model_dump(),
        "rewrites":      rewrite.model_dump()
    }

    with open("output/result.json", "w") as f:
        json.dump(result, f, indent=2)

    with open("output/optimized_resume.txt", "w") as f:
        f.write(rewrite.new_summary + "\n\n")
        for b in rewrite.rewritten_bullets:
            f.write(f"• {b.rewritten}\n")

    print("\n──────────────────────────────────────────")
    print(" Saved → output/result.json")
    print(" Saved → output/optimized_resume.txt")
    print("──────────────────────────────────────────\n")


if __name__ == "__main__":
    run_pipeline(
        resume_path = "data/resume.pdf",
        jd_path     = "data/job_description.txt",
        target_role = "java_developer"
    )
```

**Run:**
```bash
python optimize.py
```

**Done when:** Full terminal report prints. Both output files saved.
Score makes sense.

**Git commit:**
```bash
git add . && git commit -m "day-7: end-to-end pipeline"
```

---

### ✅ Week 1 Gate

> Run `python optimize.py` → get ATS score, gap list, rewritten bullets
> from one command. Pipeline works end to end.

---

# WEEK 2 — Make it Smart

> Goal: Convert the sequential pipeline into a stateful LangGraph agent
> with self-correction, checkpointing, and human approval.

---

## Day 8 — Convert to LangGraph StateGraph

**File:** `graph/workflow.py`

**Goal:** Replace sequential `optimize.py` with a proper LangGraph state machine.

**Concepts:** StateGraph, TypedDict state, nodes, edges, conditional routing,
checkpointing, human-in-the-loop

**Note:** Days 8–11 all live in `graph/workflow.py`.
This single file is built incrementally across those days.
The full final version is shown here — build it all on Day 8,
then validate each feature on Days 9–11.

**Code:**
```python
# graph/workflow.py
import os
import json
from typing import TypedDict, Optional
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.sqlite import SqliteSaver
from agents.parser import parse_resume
from agents.jd_parser import parse_jd
from agents.gap_analyzer import analyze_gaps
from agents.rewriter import rewrite_resume
from utils.pdf_reader import extract_text


class ATSState(TypedDict):
    resume_path:   str
    jd_path:       str
    target_role:   str
    resume_text:   str
    jd_text:       str
    parsed_resume: Optional[dict]
    parsed_jd:     Optional[dict]
    ats_score:     int
    gaps:          Optional[dict]
    rewritten:     Optional[dict]
    iterations:    int
    approved:      bool


# ── Nodes ────────────────────────────────────────────────────────────

def node_load_resume(state):
    return {"resume_text": extract_text(state["resume_path"])}


def node_parse_resume(state):
    parsed = parse_resume(state["resume_text"])
    return {"parsed_resume": parsed.model_dump()}


def node_parse_jd(state):
    with open(state["jd_path"]) as f:
        jd_text = f.read()
    parsed = parse_jd(jd_text)
    return {"jd_text": jd_text, "parsed_jd": parsed.model_dump()}


def node_analyze_gaps(state):
    gaps = analyze_gaps(state["parsed_resume"], state["parsed_jd"])
    return {"gaps": gaps.model_dump(), "ats_score": gaps.ats_score}


def node_rewrite(state):
    result = rewrite_resume(
        state["parsed_resume"],
        state["gaps"],
        state["parsed_jd"],
        target_role=state.get("target_role", "general")
    )
    return {
        "rewritten":  result.model_dump(),
        "iterations": state.get("iterations", 0) + 1
    }


def node_rescore(state):
    gaps = analyze_gaps(state["rewritten"], state["parsed_jd"])
    return {"ats_score": gaps.ats_score, "gaps": gaps.model_dump()}


def node_save_output(state):
    os.makedirs("output", exist_ok=True)
    with open("output/result.json", "w") as f:
        json.dump(state, f, indent=2, default=str)
    return {}


# ── Router ───────────────────────────────────────────────────────────

def route_after_score(state):
    """
    Self-correction loop:
    If score < 70 AND iterations < 3 → retry rewrite
    Otherwise → proceed to human approval
    """
    score      = state.get("ats_score", 0)
    iterations = state.get("iterations", 0)

    if score >= 70 or iterations >= 3:
        print(f"  → Score {score}/100 after {iterations} iteration(s). Proceeding.")
        return "done"
    else:
        print(f"  → Score {score}/100. Retrying (attempt {iterations + 1}/3)...")
        return "retry"


# ── Graph Builder ─────────────────────────────────────────────────────

def build_graph():
    graph = StateGraph(ATSState)

    graph.add_node("load_resume",  node_load_resume)
    graph.add_node("parse_resume", node_parse_resume)
    graph.add_node("parse_jd",     node_parse_jd)
    graph.add_node("analyze_gaps", node_analyze_gaps)
    graph.add_node("rewrite",      node_rewrite)
    graph.add_node("rescore",      node_rescore)
    graph.add_node("save_output",  node_save_output)

    graph.set_entry_point("load_resume")
    graph.add_edge("load_resume",  "parse_resume")
    graph.add_edge("parse_resume", "parse_jd")
    graph.add_edge("parse_jd",     "analyze_gaps")
    graph.add_edge("analyze_gaps", "rewrite")
    graph.add_edge("rewrite",      "rescore")
    graph.add_edge("save_output",  END)

    # Self-correction loop — Day 9
    graph.add_conditional_edges(
        "rescore",
        route_after_score,
        {"retry": "rewrite", "done": "save_output"}
    )

    # Checkpointing — Day 10
    checkpointer = SqliteSaver.from_conn_string("runs.db")

    # Human-in-the-loop pause — Day 11
    return graph.compile(
        checkpointer     = checkpointer,
        interrupt_before = ["save_output"]
    )
```

**Run:**
```bash
python -c "
from graph.workflow import build_graph
app    = build_graph()
result = app.invoke({
    'resume_path': 'data/resume.pdf',
    'jd_path':     'data/job_description.txt',
    'target_role': 'java_developer',
    'iterations':  0,
    'approved':    False
})
print('Score:', result['ats_score'])
"
```

**Done when:** Graph runs to completion. Same output as Day 7.

**Git commit:**
```bash
git add . && git commit -m "day-8: convert to langgraph stategraph"
```

---

## Day 9 — Self-Correction Loop Validation

**Goal:** Confirm the retry loop works correctly end to end.

**Note:** `route_after_score` and `add_conditional_edges` already exist
in the Day 8 code. Day 9 is about testing and validating.

**Tasks:**
1. Test with a resume that scores low — watch it loop
2. Confirm score improves across iterations
3. Confirm it hard-stops at 3 iterations
4. Confirm score of exactly 70 proceeds (does not retry)
5. Log each attempt's score clearly to terminal

**Done when:** Low-scoring resume loops 1–3 times.
Hard stop at iteration 3 confirmed. Score at 70 passes through.

**Git commit:**
```bash
git add . && git commit -m "day-9: self-correction loop validated"
```

---

## Day 10 — Checkpointing + State Persistence

**Goal:** Every run saved to SQLite. Interrupted runs can be resumed.

**Note:** `SqliteSaver` is already wired in Day 8 `build_graph()`.
Day 10 adds the CLI thread_id flag to `optimize.py`.

**Tasks:**
1. Add `--thread-id` CLI argument to `optimize.py`
2. Generate unique thread_id per new run using timestamp
3. Print thread_id at start of every run so user can save it
4. Test: interrupt a run mid-way, resume with same thread_id

**Code — add to `optimize.py`:**
```python
import sys
import time

thread_id = sys.argv[1] if len(sys.argv) > 1 else f"run_{int(time.time())}"
config    = {"configurable": {"thread_id": thread_id}}

print(f"Thread ID: {thread_id}  ← save this to resume the run")
result = app.invoke(initial_state, config=config)
```

**Run:**
```bash
python optimize.py                     # new run, auto thread_id
python optimize.py run_1234567890      # resume existing run
```

**Done when:** `runs.db` created after first run.
Resume with same thread_id continues from last checkpoint.

**Git commit:**
```bash
git add . && git commit -m "day-10: sqlite checkpointing"
```

---

## Day 11 — Human-in-the-Loop Approval

**Goal:** Graph pauses before saving. User reviews rewrites.
Approves, rejects, or requests another rewrite.

**Note:** `interrupt_before=["save_output"]` is already in Day 8 `build_graph()`.
Day 11 adds the approval interaction to `optimize.py`.

**Tasks:**
1. After graph pauses, print rewritten bullets to terminal
2. Prompt user: approve (y), reject (n), retry (r)
3. On y → resume graph → proceeds to `save_output`
4. On n → exit without saving
5. On r → reset score and iterations, re-trigger rewrite

**Code — add to `optimize.py`:**
```python
# graph pauses here automatically before save_output
result = app.invoke(initial_state, config=config)

print("\n══ REVIEW CHANGES ══════════════════════")
for b in result["rewritten"]["rewritten_bullets"]:
    print(f"\n  BEFORE: {b['original']}")
    print(f"  AFTER:  {b['rewritten']}")

decision = input("\nApprove these changes? [y/n/r]: ").strip().lower()

if decision == "y":
    app.invoke(None, config=config)   # resumes → hits save_output → done
    print("✓ Saved.")
elif decision == "n":
    print("✗ Discarded. Nothing saved.")
elif decision == "r":
    app.update_state(config, {"iterations": 0, "ats_score": 0})
    app.invoke(None, config=config)
```

**Done when:** Graph pauses at approval. y/n/r input controls next step.

**Git commit:**
```bash
git add . && git commit -m "day-11: human-in-the-loop approval"
```

---

## Day 12 — Output Formatter

**File:** `utils/formatter.py`

**Goal:** Make the terminal output clean, readable, and demo-worthy.

**Tasks:**
1. Write `utils/formatter.py`
2. Show ATS score as a visual progress bar
3. Show before/after bullets with reasons
4. Show improvement delta: initial → final score (+N)
5. Save `output/optimized_resume.txt` in clean copy-paste format

**Code:**
```python
# utils/formatter.py

def score_bar(score, width=20):
    filled = int((score / 100) * width)
    bar    = "█" * filled + "░" * (width - filled)
    return f"{bar}  {score}/100"


def print_report(initial_score, final_score, gaps, rewrites):
    delta     = final_score - initial_score
    delta_str = f"+{delta}" if delta >= 0 else str(delta)

    print("\n══════════════════════════════════════════════")
    print("  ATS RESUME OPTIMIZER — RESULT")
    print("══════════════════════════════════════════════\n")
    print(f"  Initial Score  {score_bar(initial_score)}")
    print(f"  Final Score    {score_bar(final_score)}  ({delta_str})\n")

    print(f"  GAPS FOUND ({len(gaps['missing_skills'])})")
    for skill in gaps["missing_skills"]:
        print(f"  ✗ {skill}")

    print(f"\n  REWRITES ({len(rewrites['rewritten_bullets'])} bullets)\n")
    for b in rewrites["rewritten_bullets"]:
        print(f"  BEFORE  {b['original']}")
        print(f"  AFTER   {b['rewritten']}")
        print(f"  WHY     {b['reason']}")
        print()

    print("══════════════════════════════════════════════")


def save_optimized_resume(parsed_resume, rewrites, output_path):
    bullet_map = {
        b["original"]: b["rewritten"]
        for b in rewrites["rewritten_bullets"]
    }

    with open(output_path, "w") as f:
        f.write(f"{parsed_resume.get('name', '')}\n\n")
        f.write(f"SUMMARY\n{rewrites.get('new_summary', '')}\n\n")
        f.write("EXPERIENCE\n")
        for exp in parsed_resume.get("experience", []):
            f.write(f"\n{exp['role']} — {exp['company']} ({exp['duration']})\n")
            for bullet in exp["bullets"]:
                rewritten = bullet_map.get(bullet, bullet)
                f.write(f"• {rewritten}\n")
```

**Done when:** Terminal shows score bar and delta.
`optimized_resume.txt` is clean and copy-pasteable.

**Git commit:**
```bash
git add . && git commit -m "day-12: output formatter"
```

---

## Day 13 — Test with 5 Real JDs

**Goal:** Validate quality across different roles. Find and fix weak prompts.

**Tasks:**
1. Pick 5 real JDs: 2× Senior SWE, 2× AI/ML Engineer, 1× Tech Lead
2. Run full pipeline on each with correct `target_role`
3. Record: initial score, final score, rewrite quality (1–5 subjective)
4. Identify which prompts produce weak output
5. Tune prompts, re-run problem cases

**Test runs:**
```bash
python optimize.py --jd data/jds/senior_swe/jd_grab.txt      --target-role senior_swe
python optimize.py --jd data/jds/senior_swe/jd_sysco.txt     --target-role senior_swe
python optimize.py --jd data/jds/ai_engineer/jd_netflix.txt  --target-role ai_engineer
python optimize.py --jd data/jds/ai_engineer/jd_wso2.txt     --target-role ai_engineer
python optimize.py --jd data/jds/senior_swe/jd_tech_lead.txt --target-role senior_swe
```

**Evaluation checklist per run:**
- [ ] Score is realistic (not 95+ unless resume is genuinely strong)
- [ ] Missing skills are real gaps not hallucinated
- [ ] Rewritten bullets sound natural not robotic
- [ ] No invented experience or skills
- [ ] Keywords are relevant to the JD not generic

**Done when:** 4/5 runs produce output you would submit to a real employer.

**Git commit:**
```bash
git add . && git commit -m "day-13: tested against 5 real jds"
```

---

## Day 14 — README + Portfolio Polish

**Goal:** Document everything so you can explain every decision in an interview.

**Tasks:**
1. Update `README.md` with setup, usage, example output
2. Write `ARCHITECTURE.md` explaining each component and design decisions
3. Add real example output to README (copy from a real run)
4. Write `What's Next` section showing product thinking
5. Create `.env.example` template for public users
6. Clean commit history, push to GitHub

**Interview talking points to document in `ARCHITECTURE.md`:**

| Question | Answer |
|---|---|
| Why LangGraph not a simple script? | Needed self-correction loop, checkpointing, human-in-the-loop — impossible cleanly without a graph |
| Why RAG for the rewriter? | Generic rewrites sound robotic. Retrieving real JD patterns grounds language in what employers actually write |
| Why role-based ChromaDB collections? | Java Developer JDs use different language than AI Engineer JDs. Separate collections = role-specific rewrites |
| How do you prevent hallucination? | System prompt guardrails + Pydantic structured output + human approval gate |
| Why 3 entry points? | Clean architecture. Agents have no knowledge of who calls them. Same pipeline works from CLI, Claude Desktop, or web |

**Done when:** GitHub repo is public. README explains everything clearly.
You can demo in 3 minutes.

**Git commit:**
```bash
git add . && git commit -m "day-14: readme, architecture docs, portfolio polish"
```

---

### 🚀 Week 2 Gate

> Self-correcting LangGraph agent, RAG-powered rewriting,
> human-in-the-loop approval, SQLite checkpointing,
> tested against 5 real JDs, clean GitHub repo. Interview-ready.

---

# EXTENSION — MCP + REST API

---

## Day 15 — MCP Server

**File:** `server.py`

**Goal:** Expose the pipeline as an MCP server so Claude Desktop
or Cursor can run it from a natural language conversation.
Zero UI needed.

**Concepts:** MCP protocol, tool definitions, docstrings as contracts,
Claude Desktop integration

**MCP vs REST — the key difference:**
```
REST API  →  you call it explicitly with structured JSON
             you are the brain deciding when to call it

MCP       →  Claude reads your tool docstring,
             decides when to call it,
             structures the parameters from your natural language
             you just talk
```

**Install:**
```bash
pip install mcp fastmcp
```

**Code:**
```python
# server.py
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from agents.parser import parse_resume
from agents.jd_parser import parse_jd
from agents.gap_analyzer import analyze_gaps
from agents.rewriter import rewrite_resume

load_dotenv()

mcp = FastMCP("ATS Resume Optimizer")


@mcp.tool()
def optimize_resume(resume_text, jd_text, target_role="general"):
    """
    Full ATS optimization pipeline.
    Takes raw resume text and job description text.
    Returns ATS score, missing skills, gap report,
    and rewritten bullets tailored to the JD.
    Use this when the user wants their resume optimized
    for a specific job.
    Example target_role values: java_developer,
    mern_developer, ai_engineer, senior_swe.
    """
    parsed_resume = parse_resume(resume_text)
    parsed_jd     = parse_jd(jd_text)
    gaps          = analyze_gaps(
                        parsed_resume.model_dump(),
                        parsed_jd.model_dump()
                    )
    rewrite       = rewrite_resume(
                        parsed_resume.model_dump(),
                        gaps.model_dump(),
                        parsed_jd.model_dump(),
                        target_role=target_role
                    )
    return {
        "ats_score":         gaps.ats_score,
        "missing_skills":    gaps.missing_skills,
        "weak_sections":     gaps.weak_sections,
        "rewritten_bullets": rewrite.model_dump()
    }


@mcp.tool()
def get_ats_score(resume_text, jd_text):
    """
    Quick ATS score only. No rewriting.
    Use this when the user just wants to check their score
    without making any changes to the resume.
    """
    parsed_resume = parse_resume(resume_text)
    parsed_jd     = parse_jd(jd_text)
    gaps          = analyze_gaps(
                        parsed_resume.model_dump(),
                        parsed_jd.model_dump()
                    )
    return {
        "ats_score":      gaps.ats_score,
        "missing_skills": gaps.missing_skills,
        "matched_skills": gaps.matched_skills
    }


@mcp.tool()
def get_gap_report(resume_text, jd_text):
    """
    Detailed gap analysis only. No rewriting.
    Use this when the user wants to understand what
    is missing before deciding to rewrite.
    """
    parsed_resume = parse_resume(resume_text)
    parsed_jd     = parse_jd(jd_text)
    gaps          = analyze_gaps(
                        parsed_resume.model_dump(),
                        parsed_jd.model_dump()
                    )
    return gaps.model_dump()


@mcp.tool()
def add_jd_to_knowledge_base(jd_text, target_role):
    """
    Add a job description to the knowledge base for a specific role.
    More JDs added = better rewrite quality for that role.
    Use this when the user wants to improve results for a role.
    Example roles: java_developer, mern_developer, ai_engineer.
    """
    from langchain_openai import OpenAIEmbeddings
    from langchain_community.vectorstores import Chroma
    from langchain.text_splitter import RecursiveCharacterTextSplitter

    collection_name = target_role.lower().replace(" ", "_")
    embeddings      = OpenAIEmbeddings(model="text-embedding-3-small")
    vectorstore     = Chroma(
        collection_name    = collection_name,
        persist_directory  = "data/chroma_db",
        embedding_function = embeddings
    )
    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    chunks   = splitter.split_text(jd_text)
    vectorstore.add_texts(
        texts     = chunks,
        metadatas = [{"role": collection_name}] * len(chunks)
    )
    return {
        "status":       "added",
        "collection":   collection_name,
        "chunks_added": len(chunks)
    }


if __name__ == "__main__":
    mcp.run()
```

**Connect to Claude Desktop:**

```bash
# mac config
~/Library/Application Support/Claude/claude_desktop_config.json

# windows config
%APPDATA%\Claude\claude_desktop_config.json
```

```json
{
  "mcpServers": {
    "ats-optimizer": {
      "command": "python",
      "args": ["/Users/susith/Projects/ATSLLM/server.py"]
    }
  }
}
```

Get your exact path:
```bash
pwd
# /Users/susith/Projects/ATSLLM
```

Restart Claude Desktop. Click the hammer icon 🔨.
Your 4 tools should appear.

**Test prompts in Claude Desktop:**
```
# triggers optimize_resume
"Here is my resume: [paste]
 Here is the JD: [paste]
 I am targeting java developer roles. Please optimize."

# triggers get_ats_score
"What is my ATS score for this role?
 Resume: [paste]   JD: [paste]"

# triggers get_gap_report
"What is missing from my resume for this job?
 Don't rewrite yet, just tell me the gaps.
 Resume: [paste]   JD: [paste]"

# triggers add_jd_to_knowledge_base
"Add this JD to improve rewrites for MERN developers: [paste JD]"
```

**Important:** The docstring is your contract with Claude.
Better description = Claude picks the right tool more accurately.

**Done when:** 4 tools appear in Claude Desktop hammer menu.
Full pipeline runs from a natural language message.
CLI still works independently.

**Git commit:**
```bash
git add . && git commit -m "day-15: mcp server for claude desktop"
```

---

## Day 16 — REST API (FastAPI)

**File:** `api.py`

**Goal:** Expose pipeline over HTTP so it can be tested from Postman
and later called from a React frontend.

**Concepts:** FastAPI, REST endpoints, Swagger UI auto-generation,
multipart form data

**Testing strategy:**
```
Until React is built:
  Option A → Swagger UI at /docs      ← built into FastAPI, no setup
  Option B → Postman with plain text  ← paste resume as JSON string
  Option C → Postman with PDF upload  ← use /optimize/pdf endpoint

Use /optimize (plain text) for testing.
Switch to /optimize/pdf when React frontend is ready.
```

**Install:**
```bash
pip install fastapi uvicorn
```

**Code:**
```python
# api.py
from fastapi import FastAPI, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional
import tempfile, os
from dotenv import load_dotenv
from utils.pdf_reader import extract_text
from agents.parser import parse_resume
from agents.jd_parser import parse_jd
from agents.gap_analyzer import analyze_gaps
from agents.rewriter import rewrite_resume

load_dotenv()

app = FastAPI(title="ATS Resume Optimizer API")


class OptimizeRequest(BaseModel):
    resume_text: str
    jd_text:     str
    target_role: Optional[str] = "general"


@app.post("/optimize")
def optimize_text(request: OptimizeRequest):
    """
    Optimize resume using plain text input.
    Best for Postman testing. Paste resume text as a JSON string.
    """
    parsed_resume = parse_resume(request.resume_text)
    parsed_jd     = parse_jd(request.jd_text)
    gaps          = analyze_gaps(
                        parsed_resume.model_dump(),
                        parsed_jd.model_dump()
                    )
    rewrite       = rewrite_resume(
                        parsed_resume.model_dump(),
                        gaps.model_dump(),
                        parsed_jd.model_dump(),
                        target_role=request.target_role
                    )
    return {
        "ats_score":         gaps.ats_score,
        "missing_skills":    gaps.missing_skills,
        "rewritten_bullets": rewrite.model_dump()
    }


@app.post("/optimize/pdf")
async def optimize_pdf(
    resume_pdf:  UploadFile = File(...),
    jd_text:     str        = Form(...),
    target_role: str        = Form("general")
):
    """
    Optimize resume using PDF file upload.
    Use this endpoint when React frontend has drag-and-drop upload.
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(await resume_pdf.read())
        tmp_path = tmp.name

    resume_text = extract_text(tmp_path)
    os.unlink(tmp_path)

    parsed_resume = parse_resume(resume_text)
    parsed_jd     = parse_jd(jd_text)
    gaps          = analyze_gaps(
                        parsed_resume.model_dump(),
                        parsed_jd.model_dump()
                    )
    rewrite       = rewrite_resume(
                        parsed_resume.model_dump(),
                        gaps.model_dump(),
                        parsed_jd.model_dump(),
                        target_role=target_role
                    )
    return {
        "ats_score":         gaps.ats_score,
        "missing_skills":    gaps.missing_skills,
        "rewritten_bullets": rewrite.model_dump()
    }


@app.get("/health")
def health():
    return {"status": "ok"}
```

**Run:**
```bash
uvicorn api:app --reload
```

**Test via Swagger UI (zero setup):**
```
http://localhost:8000/docs
```

**Test via Postman — plain text:**
```
Method:   POST
URL:      http://localhost:8000/optimize
Headers:  Content-Type: application/json

Body:
{
  "resume_text": "John Doe\nSoftware Engineer\nSysco Labs...",
  "jd_text":     "We are looking for a Senior Java Developer...",
  "target_role": "java_developer"
}
```

**Done when:** `/docs` Swagger UI opens.
`/optimize` returns structured JSON from Postman.

**Git commit:**
```bash
git add . && git commit -m "day-16: fastapi rest endpoint"
```

---

## Final Project Structure

```
ats-optimizer/
│
├── optimize.py             ← CLI entry point        (Day 7)
├── server.py               ← MCP entry point        (Day 15)
├── api.py                  ← REST entry point       (Day 16)
│
├── requirements.txt
├── .env                    ← never commit
├── .env.example            ← commit this
├── .gitignore
├── README.md
├── ARCHITECTURE.md
├── BUILDPLAN.md
│
├── agents/
│   ├── parser.py           ← resume → structured JSON
│   ├── jd_parser.py        ← JD → structured JSON
│   ├── gap_analyzer.py     ← ATS score + gap report
│   └── rewriter.py         ← RAG-powered bullet rewriter
│
├── graph/
│   └── workflow.py         ← LangGraph StateGraph
│
├── utils/
│   ├── pdf_reader.py       ← PDF → raw text
│   ├── build_kb.py         ← embed JDs into ChromaDB
│   └── formatter.py        ← terminal output + file saver
│
└── data/
    ├── resume.pdf
    ├── job_description.txt
    ├── jds/
    │   ├── java_developer/ ← JDs for this role
    │   ├── ai_engineer/
    │   └── senior_swe/
    └── chroma_db/          ← auto-generated, in .gitignore
```

---

## Commit History

```bash
git commit -m "day-1:  pdf reader"
git commit -m "day-2:  resume parser with structured output"
git commit -m "day-3:  jd parser"
git commit -m "day-4:  gap analyzer with ats scoring"
git commit -m "day-5:  rag knowledge base with chromadb"
git commit -m "day-6:  rewriter agent with rag retrieval"
git commit -m "day-7:  end-to-end pipeline"
git commit -m "day-8:  convert to langgraph stategraph"
git commit -m "day-9:  self-correction loop validated"
git commit -m "day-10: sqlite checkpointing"
git commit -m "day-11: human-in-the-loop approval"
git commit -m "day-12: output formatter"
git commit -m "day-13: tested against 5 real jds"
git commit -m "day-14: readme, architecture docs, portfolio polish"
git commit -m "day-15: mcp server for claude desktop"
git commit -m "day-16: fastapi rest endpoint"
```

---

## Quick Reference

```bash
# install
pip install -r requirements.txt

# build knowledge base (run once)
python utils/build_kb.py

# CLI
python optimize.py

# CLI with specific JD and role
python optimize.py --jd data/jds/ai_engineer/jd_grab.txt --target-role ai_engineer

# resume interrupted run
python optimize.py run_1234567890

# MCP server (Claude Desktop / Cursor)
python server.py

# REST API (Postman / web)
uvicorn api:app --reload
# Swagger UI: http://localhost:8000/docs
```

---

## What You Can Say in Interviews

```
"I built a multi-agent resume optimizer using LangGraph.

The pipeline has 5 nodes: resume parser, JD parser,
gap analyzer, RAG-powered rewriter, and a scorer.

I used ChromaDB with role-based collections —
separate embedding stores per job family so the
rewriter retrieves language patterns specific to
the target role, not generic output.

If the ATS score after rewriting is below 70,
the graph loops back to the rewriter — max 3 iterations.

I added SQLite checkpointing so any run can be resumed,
and a human-in-the-loop interrupt so the user approves
changes before they're saved.

I exposed the same pipeline three ways:
CLI for local use, MCP server for Claude Desktop,
and a FastAPI endpoint for web access.
The agents have no knowledge of the caller —
clean separation of concerns throughout."
```

Every major GenAI concept covered. 60 seconds. No notes needed.