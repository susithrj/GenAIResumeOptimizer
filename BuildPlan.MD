# ATS Resume Optimizer — 14 Day Build Plan

> Day-by-day breakdown from empty folder to portfolio-ready GenAI project.

---

## Overview

| Week | Theme | Gate |
|---|---|---|
| Week 1 (Days 1–7) | Build the Pipeline | Working end-to-end CLI |
| Week 2 (Days 8–14) | Make it Smart | Portfolio-ready project |

---

## Before You Start

Confirm your environment is ready:

```bash
# venv is active
echo $VIRTUAL_ENV

# packages installed
pip install -r requirements.txt

# project structure exists
mkdir -p agents utils data output graph
touch .env .gitignore optimize.py test.py
```

Your `.env` file:
```
OPENAI_API_KEY=sk-...
```

Your `.gitignore`:
```
.env
.venv/
__pycache__/
*.pyc
runs.db
output/
.DS_Store
```

---

# WEEK 1 — Build the Pipeline

> Goal: By end of Day 7 you can run `python optimize.py` and get a full ATS report in the terminal.

---

## Day 1 — PDF Reader

**Goal:** Extract raw text from a resume PDF. The pipeline needs a mouth before it can think.

**Concepts:** Document loading, text extraction, file I/O

**Tasks:**
1. Drop your resume PDF into `data/resume.pdf`
2. Create `utils/pdf_reader.py`
3. Read every page of the PDF and concatenate text
4. Strip excessive whitespace and blank lines
5. Print first 500 chars to confirm it works

**Code:**
```python
# utils/pdf_reader.py
from pypdf import PdfReader

def extract_text(pdf_path: str) -> str:
    reader = PdfReader(pdf_path)
    text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"
    return text.strip()

if __name__ == "__main__":
    text = extract_text("data/resume.pdf")
    print(text[:500])
    print(f"\n--- Total characters: {len(text)} ---")
    print(f"--- Total pages: {len(PdfReader('data/resume.pdf').pages)} ---")
```

**Run:**
```bash
python utils/pdf_reader.py
```

**Done when:** Your resume text prints to terminal, character count looks right (typically 2000–6000 chars for a 1–2 page resume).

**Common issues:**
- Scanned PDF returns empty → your PDF is image-based, not text. Use a text-based PDF or export from Google Docs/Word.
- Garbled text → font encoding issue. Try a different PDF export.

---

## Day 2 — Resume Section Parser

**Goal:** Break raw resume text into structured sections the LLM can reason about individually.

**Concepts:** Structured output, Pydantic schemas, prompt engineering

**Tasks:**
1. Define a Pydantic model for the resume structure
2. Write a prompt that instructs the LLM to extract sections
3. Use `with_structured_output()` to enforce JSON schema
4. Test with your resume, print the structured output
5. Handle edge cases: missing sections return empty lists not errors

**Code:**
```python
# agents/parser.py
from pydantic import BaseModel
from typing import Optional
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
from utils.pdf_reader import extract_text

load_dotenv()

class Experience(BaseModel):
    company: str
    role: str
    duration: str
    bullets: list[str]

class ResumeStructure(BaseModel):
    name: str
    summary: Optional[str]
    skills: list[str]
    experience: list[Experience]
    education: list[str]
    certifications: list[str]

def parse_resume(resume_text: str) -> ResumeStructure:
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    structured_llm = llm.with_structured_output(ResumeStructure)

    prompt = f"""
    Extract the structured information from this resume.
    Be precise. Do not invent or infer information not present.
    Return empty lists for sections that don't exist.

    RESUME:
    {resume_text}
    """
    return structured_llm.invoke(prompt)

if __name__ == "__main__":
    text = extract_text("data/resume.pdf")
    result = parse_resume(text)
    print(result.model_dump_json(indent=2))
```

**Run:**
```bash
python agents/parser.py
```

**Done when:** Clean JSON with your name, skills list, experience with bullets, education. No hallucinated data.

---

## Day 3 — Job Description Parser

**Goal:** Extract what the job actually wants — required skills, nice-to-haves, seniority level, domain keywords.

**Concepts:** Keyword extraction, requirement classification, structured output

**Tasks:**
1. Create `data/job_description.txt` — paste a real JD you're targeting
2. Define a Pydantic model for JD structure
3. Write a parser that classifies skills as required vs nice-to-have
4. Extract seniority level and domain (e.g. "Senior", "AI Engineering")
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
    job_title: str
    company: Optional[str]
    seniority: str                  # Junior / Mid / Senior / Lead
    domain: str                     # e.g. AI Engineering, Backend, Fullstack
    required_skills: list[str]      # must have
    preferred_skills: list[str]     # nice to have
    keywords: list[str]             # important terms that appear in JD
    responsibilities: list[str]     # key responsibilities

def parse_jd(jd_text: str) -> JDStructure:
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    structured_llm = llm.with_structured_output(JDStructure)

    prompt = f"""
    Extract structured requirements from this job description.
    Classify skills as required (explicitly stated as required/must-have)
    vs preferred (stated as nice-to-have/bonus/preferred).
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

**Done when:** Structured JSON with required vs preferred skills clearly separated, keywords list has 10+ terms, seniority is correctly identified.

---

## Day 4 — Gap Analyzer Agent

**Goal:** Compare resume against JD. Produce an ATS score and a specific list of gaps.

**Concepts:** Scoring logic, comparison algorithms, structured analysis

**Tasks:**
1. Take parsed resume + parsed JD as inputs
2. Implement skill matching: exact match, partial match, missing
3. Score formula: (matched required skills / total required skills) × 100
4. Identify weak sections: thin bullets, missing keywords, vague language
5. Output structured gap report with score + actionable gaps

**Code:**
```python
# agents/gap_analyzer.py
from pydantic import BaseModel
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv

load_dotenv()

class GapReport(BaseModel):
    ats_score: int                  # 0-100
    matched_skills: list[str]       # skills present in both
    missing_skills: list[str]       # required skills not in resume
    weak_sections: list[str]        # sections that exist but need improvement
    missing_keywords: list[str]     # JD keywords absent from resume
    recommendations: list[str]      # specific improvement suggestions

def analyze_gaps(parsed_resume: dict, parsed_jd: dict) -> GapReport:
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    structured_llm = llm.with_structured_output(GapReport)

    prompt = f"""
    Compare this resume against the job description requirements.

    Score the ATS alignment from 0-100 using this formula:
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
    return structured_llm.invoke(prompt)

if __name__ == "__main__":
    import json
    from agents.parser import parse_resume
    from agents.jd_parser import parse_jd
    from utils.pdf_reader import extract_text

    resume = parse_resume(extract_text("data/resume.pdf"))
    with open("data/job_description.txt") as f:
        jd = parse_jd(f.read())

    report = analyze_gaps(resume.model_dump(), jd.model_dump())
    print(f"\nATS Score: {report.ats_score}/100")
    print(f"Missing skills: {report.missing_skills}")
    print(f"Weak sections: {report.weak_sections}")
```

**Run:**
```bash
python agents/gap_analyzer.py
```

**Done when:** Score is realistic (not 100 unless your resume is perfect), missing skills are real gaps, not hallucinated ones.

---

## Day 5 — RAG Knowledge Base

**Goal:** Embed 20+ real JDs into ChromaDB so the rewriter can retrieve industry-standard language patterns.

**Concepts:** Embeddings, vector databases, chunking, semantic search

**Tasks:**
1. Collect 20 real JDs for your target role from LinkedIn/job boards
2. Save each as a `.txt` file in `data/jds/`
3. Write `utils/build_kb.py` to embed and store all JDs
4. Write a query function to test retrieval
5. Confirm retrieval returns semantically relevant chunks

**Code:**
```python
# utils/build_kb.py
import os
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
from langchain.text_splitter import RecursiveCharacterTextSplitter
from dotenv import load_dotenv

load_dotenv()

JDS_DIR = "data/jds"
CHROMA_DIR = "data/chroma_db"

def build_knowledge_base():
    # Load all JD text files
    documents = []
    for filename in os.listdir(JDS_DIR):
        if filename.endswith(".txt"):
            with open(os.path.join(JDS_DIR, filename), "r") as f:
                content = f.read()
                documents.append({
                    "content": content,
                    "source": filename
                })

    print(f"Loaded {len(documents)} JDs")

    # Chunk each document
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50
    )

    chunks = []
    metadatas = []
    for doc in documents:
        doc_chunks = splitter.split_text(doc["content"])
        chunks.extend(doc_chunks)
        metadatas.extend([{"source": doc["source"]}] * len(doc_chunks))

    print(f"Created {len(chunks)} chunks")

    # Embed and store
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    vectorstore = Chroma.from_texts(
        texts=chunks,
        embedding=embeddings,
        metadatas=metadatas,
        persist_directory=CHROMA_DIR
    )

    print(f"Knowledge base built → {CHROMA_DIR}")
    return vectorstore

def query_kb(query: str, k: int = 3) -> list[str]:
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    vectorstore = Chroma(
        persist_directory=CHROMA_DIR,
        embedding_function=embeddings
    )
    results = vectorstore.similarity_search(query, k=k)
    return [r.page_content for r in results]

if __name__ == "__main__":
    build_knowledge_base()

    # Test retrieval
    results = query_kb("senior software engineer microservices AWS")
    print("\nSample retrieval:")
    for i, r in enumerate(results):
        print(f"\n[{i+1}] {r[:200]}...")
```

**Run:**
```bash
# build the knowledge base (run once)
python utils/build_kb.py
```

**Done when:** ChromaDB folder created in `data/chroma_db/`, retrieval returns relevant JD patterns for a test query.

---

## Day 6 — Rewriter Agent

**Goal:** Rewrite weak resume bullets using RAG-retrieved patterns. Inject missing keywords naturally. Never hallucinate.

**Concepts:** RAG retrieval, prompt guardrails, before/after transformation

**Tasks:**
1. Write `agents/rewriter.py`
2. Before rewriting, query ChromaDB for patterns from similar JDs
3. System prompt must enforce: only use candidate's real experience, no invention
4. Rewrite each weak bullet to include missing keywords naturally
5. Return before/after pairs with a reason for each change

**Code:**
```python
# agents/rewriter.py
from pydantic import BaseModel
from langchain_openai import ChatOpenAI
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
from dotenv import load_dotenv

load_dotenv()

CHROMA_DIR = "data/chroma_db"

class RewrittenBullet(BaseModel):
    original: str
    rewritten: str
    reason: str
    keywords_added: list[str]

class RewriteResult(BaseModel):
    rewritten_bullets: list[RewrittenBullet]
    new_summary: str
    overall_changes: str

def rewrite_resume(
    parsed_resume: dict,
    gap_report: dict,
    parsed_jd: dict
) -> RewriteResult:

    # RAG: retrieve relevant JD patterns
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    vectorstore = Chroma(
        persist_directory=CHROMA_DIR,
        embedding_function=embeddings
    )

    query = f"{parsed_jd.get('job_title')} {' '.join(parsed_jd.get('required_skills', []))}"
    patterns = vectorstore.similarity_search(query, k=3)
    pattern_text = "\n---\n".join([p.page_content for p in patterns])

    llm = ChatOpenAI(model="gpt-4o", temperature=0.3)
    structured_llm = llm.with_structured_output(RewriteResult)

    system_prompt = """
    You are an expert resume writer. Your rules are absolute:
    1. NEVER invent experience, skills, or achievements the candidate doesn't have
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

    INDUSTRY LANGUAGE PATTERNS (from similar JDs):
    {pattern_text}

    Rewrite each bullet in weak_sections. Return before/after pairs with reasons.
    """

    return structured_llm.invoke([
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt}
    ])

if __name__ == "__main__":
    from agents.parser import parse_resume
    from agents.jd_parser import parse_jd
    from agents.gap_analyzer import analyze_gaps
    from utils.pdf_reader import extract_text

    resume = parse_resume(extract_text("data/resume.pdf"))
    with open("data/job_description.txt") as f:
        jd = parse_jd(f.read())
    gaps = analyze_gaps(resume.model_dump(), jd.model_dump())
    result = rewrite_resume(resume.model_dump(), gaps.model_dump(), jd.model_dump())

    for bullet in result.rewritten_bullets:
        print(f"\nBEFORE: {bullet.original}")
        print(f"AFTER:  {bullet.rewritten}")
        print(f"WHY:    {bullet.reason}")
```

**Run:**
```bash
python agents/rewriter.py
```

**Done when:** Before/after bullets look genuinely improved, keywords are injected naturally, nothing is fabricated.

---

## Day 7 — Wire End-to-End Pipeline

**Goal:** Connect all agents in a single script. One command, full output.

**Concepts:** Pipeline orchestration, JSON output, file saving

**Tasks:**
1. Write `optimize.py` — the main entry point
2. Call each agent in sequence: pdf → parse → jd → gaps → rewrite
3. Print a clean report to terminal
4. Save `output/result.json` with full structured data
5. Save `output/optimized_resume.txt` with the rewritten resume
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

def run_pipeline(resume_path: str, jd_path: str):
    os.makedirs("output", exist_ok=True)

    print("\n── ATS RESUME OPTIMIZER ──────────────────")
    print(f"Resume: {resume_path}")
    print(f"JD:     {jd_path}")
    print("──────────────────────────────────────────\n")

    print("Step 1/4  Parsing resume...")
    resume_text = extract_text(resume_path)
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
    print(f"          ✗ Missing skills: {', '.join(gaps.missing_skills[:3])}\n")

    print("Step 4/4  Rewriting resume...")
    rewrite = rewrite_resume(
        parsed_resume.model_dump(),
        gaps.model_dump(),
        parsed_jd.model_dump()
    )
    print(f"          ✓ {len(rewrite.rewritten_bullets)} bullets rewritten\n")

    # Print report
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

    # Save outputs
    result = {
        "ats_score": gaps.ats_score,
        "parsed_resume": parsed_resume.model_dump(),
        "parsed_jd": parsed_jd.model_dump(),
        "gaps": gaps.model_dump(),
        "rewrites": rewrite.model_dump()
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
    run_pipeline("data/resume.pdf", "data/job_description.txt")
```

**Run:**
```bash
python optimize.py
```

**Done when:** Full terminal report prints, both output files are saved, score makes sense.

---

### ✅ Week 1 Gate

> You can run `python optimize.py` and get: ATS score, gap list, rewritten bullets — all from one command. The pipeline works end to end.

---

# WEEK 2 — Make it Smart

> Goal: Convert the sequential pipeline into a stateful LangGraph agent with self-correction, checkpointing, and human approval.

---

## Day 8 — Convert to LangGraph StateGraph

**Goal:** Replace the sequential `optimize.py` script with a proper LangGraph state machine.

**Concepts:** StateGraph, TypedDict state, nodes, edges, graph compilation

**Tasks:**
1. Define `ATSState` TypedDict with all fields
2. Convert each agent function into a node function (takes state, returns partial state)
3. Create `graph/workflow.py` with the StateGraph definition
4. Add edges connecting all nodes in sequence
5. Compile and invoke with initial state, confirm same output as Day 7

**Code:**
```python
# graph/workflow.py
from typing import TypedDict, Optional
from langgraph.graph import StateGraph, END
from agents.parser import parse_resume
from agents.jd_parser import parse_jd
from agents.gap_analyzer import analyze_gaps
from agents.rewriter import rewrite_resume
from utils.pdf_reader import extract_text

class ATSState(TypedDict):
    resume_path: str
    jd_path: str
    resume_text: str
    jd_text: str
    parsed_resume: Optional[dict]
    parsed_jd: Optional[dict]
    ats_score: int
    gaps: Optional[dict]
    rewritten: Optional[dict]
    iterations: int
    approved: bool

# Node functions — each takes full state, returns partial update
def node_load_resume(state: ATSState) -> dict:
    return {"resume_text": extract_text(state["resume_path"])}

def node_parse_resume(state: ATSState) -> dict:
    parsed = parse_resume(state["resume_text"])
    return {"parsed_resume": parsed.model_dump()}

def node_parse_jd(state: ATSState) -> dict:
    with open(state["jd_path"]) as f:
        jd_text = f.read()
    parsed = parse_jd(jd_text)
    return {"jd_text": jd_text, "parsed_jd": parsed.model_dump()}

def node_analyze_gaps(state: ATSState) -> dict:
    gaps = analyze_gaps(state["parsed_resume"], state["parsed_jd"])
    return {"gaps": gaps.model_dump(), "ats_score": gaps.ats_score}

def node_rewrite(state: ATSState) -> dict:
    result = rewrite_resume(state["parsed_resume"], state["gaps"], state["parsed_jd"])
    return {
        "rewritten": result.model_dump(),
        "iterations": state.get("iterations", 0) + 1
    }

def node_rescore(state: ATSState) -> dict:
    # Re-run gap analysis on rewritten resume to get new score
    gaps = analyze_gaps(state["rewritten"], state["parsed_jd"])
    return {"ats_score": gaps.ats_score, "gaps": gaps.model_dump()}

# Build graph
def build_graph():
    graph = StateGraph(ATSState)

    graph.add_node("load_resume", node_load_resume)
    graph.add_node("parse_resume", node_parse_resume)
    graph.add_node("parse_jd", node_parse_jd)
    graph.add_node("analyze_gaps", node_analyze_gaps)
    graph.add_node("rewrite", node_rewrite)
    graph.add_node("rescore", node_rescore)

    graph.set_entry_point("load_resume")
    graph.add_edge("load_resume", "parse_resume")
    graph.add_edge("parse_resume", "parse_jd")
    graph.add_edge("parse_jd", "analyze_gaps")
    graph.add_edge("analyze_gaps", "rewrite")
    graph.add_edge("rewrite", "rescore")
    graph.add_edge("rescore", END)

    return graph.compile()
```

**Run:**
```bash
python -c "
from graph.workflow import build_graph
app = build_graph()
result = app.invoke({'resume_path': 'data/resume.pdf', 'jd_path': 'data/job_description.txt', 'iterations': 0, 'approved': False})
print('Score:', result['ats_score'])
"
```

**Done when:** Graph runs to completion, same output as Day 7, no errors.

---

## Day 9 — Conditional Routing + Self-Correction Loop

**Goal:** Graph automatically retries rewriting if score is too low. Stop after 3 attempts.

**Concepts:** Conditional edges, routing functions, loop prevention

**Tasks:**
1. Write a router function that checks score and iteration count
2. Add `add_conditional_edges` after `rescore` node
3. If score ≥ 70 OR iterations ≥ 3 → proceed to end
4. If score < 70 AND iterations < 3 → route back to rewrite
5. Test: use a resume that scores low, confirm it loops and improves

**Code — add to `graph/workflow.py`:**
```python
def route_after_score(state: ATSState) -> str:
    score = state.get("ats_score", 0)
    iterations = state.get("iterations", 0)

    if score >= 70 or iterations >= 3:
        print(f"  → Score {score}/100 after {iterations} iteration(s). Proceeding.")
        return "done"
    else:
        print(f"  → Score {score}/100. Retrying rewrite (attempt {iterations + 1}/3)...")
        return "retry"

# Replace the rescore → END edge with:
graph.add_conditional_edges(
    "rescore",
    route_after_score,
    {
        "retry": "rewrite",
        "done": END
    }
)
```

**Done when:** A low-scoring resume loops 1–3 times and the score improves each iteration.

---

## Day 10 — Checkpointing + State Persistence

**Goal:** Every graph run is saved to SQLite. Interrupted runs can be resumed. State is inspectable.

**Concepts:** LangGraph checkpointing, thread IDs, state snapshots

**Tasks:**
1. Add `SqliteSaver` checkpointer to graph compile
2. Every run gets a `thread_id` (based on resume filename + timestamp)
3. Add `--thread-id` CLI flag to resume a specific run
4. Print checkpoint summary after each run
5. Test: interrupt a run mid-way, resume it

**Code — update `graph/workflow.py`:**
```python
from langgraph.checkpoint.sqlite import SqliteSaver

def build_graph():
    # ... (same nodes and edges) ...

    checkpointer = SqliteSaver.from_conn_string("runs.db")
    return graph.compile(checkpointer=checkpointer)
```

**Code — update `optimize.py`:**
```python
import sys
import time

thread_id = sys.argv[1] if len(sys.argv) > 1 else f"run_{int(time.time())}"
config = {"configurable": {"thread_id": thread_id}}

print(f"Thread ID: {thread_id}")

result = app.invoke(initial_state, config=config)
```

**Run:**
```bash
# new run
python optimize.py

# resume specific run
python optimize.py run_1234567890
```

**Done when:** `runs.db` file created after first run, re-running with same thread_id resumes from last checkpoint.

---

## Day 11 — Human-in-the-Loop Approval

**Goal:** Pause the graph after rewriting. Show the user the changes. Ask for approval before saving.

**Concepts:** `interrupt_before`, graph resumption, human feedback injection

**Tasks:**
1. Add `save_output` node to the graph
2. Compile graph with `interrupt_before=["save_output"]`
3. After graph pauses, print rewritten bullets to terminal
4. Prompt user: approve (y), reject (n), or request another rewrite (r)
5. Resume graph with user's decision injected into state

**Code:**
```python
# add to graph/workflow.py
def node_save_output(state: ATSState) -> dict:
    import json, os
    os.makedirs("output", exist_ok=True)
    with open("output/result.json", "w") as f:
        json.dump(state, f, indent=2, default=str)
    return {}

graph.add_node("save_output", node_save_output)
# replace END edge with:
graph.add_edge("rescore_done_path", "save_output")
graph.add_edge("save_output", END)

# compile with interrupt
return graph.compile(
    checkpointer=checkpointer,
    interrupt_before=["save_output"]
)
```

**Code — in `optimize.py`:**
```python
# Run until interrupt
result = app.invoke(initial_state, config=config)

# Graph paused — show user the rewrites
print("\n══ REVIEW CHANGES ══════════════════════")
for b in result["rewritten"]["rewritten_bullets"]:
    print(f"\n  BEFORE: {b['original']}")
    print(f"  AFTER:  {b['rewritten']}")

# Ask for approval
decision = input("\nApprove these changes? [y/n/r]: ").strip().lower()

if decision == "y":
    # Resume graph — proceeds to save_output node
    app.invoke(None, config=config)
    print("✓ Saved.")
elif decision == "r":
    # Force another rewrite iteration
    app.update_state(config, {"iterations": 0, "ats_score": 0})
    app.invoke(None, config=config)
```

**Done when:** Graph pauses, you see the rewrites, your y/n decision controls whether output is saved.

---

## Day 12 — Output Formatter

**Goal:** Make the terminal output clean, readable, and impressive to show in a demo.

**Concepts:** Terminal formatting, structured reporting, file output

**Tasks:**
1. Write `utils/formatter.py` with a clean report printer
2. Show ATS score as a visual progress bar
3. Show before/after bullets side by side with change reasons
4. Save `output/optimized_resume.txt` in clean copy-paste format
5. Show improvement delta: "Score improved from X to Y (+Z)"

**Code:**
```python
# utils/formatter.py

def score_bar(score: int, width: int = 20) -> str:
    filled = int((score / 100) * width)
    bar = "█" * filled + "░" * (width - filled)
    return f"{bar}  {score}/100"

def print_report(initial_score: int, final_score: int, gaps: dict, rewrites: dict):
    delta = final_score - initial_score
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

def save_optimized_resume(parsed_resume: dict, rewrites: dict, output_path: str):
    bullet_map = {b["original"]: b["rewritten"]
                  for b in rewrites["rewritten_bullets"]}

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

**Done when:** Terminal output looks polished with score bar, `optimized_resume.txt` is clean and copy-pasteable.

---

## Day 13 — Test with 5 Real JDs

**Goal:** Validate quality across different roles. Find and fix weak prompts.

**Concepts:** Evaluation, prompt iteration, edge case handling

**Tasks:**
1. Pick 5 real JDs: 2× Senior Software Engineer, 2× AI/ML Engineer, 1× Tech Lead
2. Run the full pipeline on each
3. For each run record: initial score, final score, rewrite quality (1-5 subjective)
4. Identify which prompts produce weak output
5. Tune prompts and re-run problem cases

**Test script:**
```bash
# create 5 JD files
ls data/jds/
# jd_senior_swe_grab.txt
# jd_senior_swe_sysco.txt
# jd_ai_engineer_netflix.txt
# jd_ai_engineer_wso2.txt
# jd_tech_lead_99x.txt

# run each
python optimize.py --jd data/jds/jd_ai_engineer_netflix.txt
python optimize.py --jd data/jds/jd_senior_swe_grab.txt
# etc.
```

**Evaluation checklist per run:**
- [ ] Score is realistic (not 95+ unless resume is genuinely strong)
- [ ] Missing skills are real gaps, not hallucinated
- [ ] Rewritten bullets sound natural, not robotic
- [ ] No invented experience or skills
- [ ] Keywords are relevant to the JD, not generic

**Done when:** 4/5 runs produce output you'd be comfortable submitting to a real employer.

---

## Day 14 — README + Portfolio Polish

**Goal:** Document the project so you can explain every decision in an interview.

**Concepts:** Technical writing, architecture documentation, portfolio presentation

**Tasks:**
1. Update `README.md` — what it does, setup, usage, example output
2. Write `ARCHITECTURE.md` — explain each agent, why LangGraph, how RAG works
3. Add a clean example output section to README (copy from a real run)
4. Write 3 "what's next" bullet points showing product thinking
5. Clean commit history, push to GitHub

Day 15 — MCP Server
Goal: Expose your entire pipeline as an MCP server so Claude Desktop can run it from a natural language conversation. Zero UI needed.
Concepts: MCP protocol, tool definitions, JSON-RPC, Claude Desktop integration

Install
Add to requirements.txt:
mcp
fastmcp
Then install:
bashpip install mcp fastmcp

Tasks

Create server.py in project root
Expose 3 tools: optimize_resume, get_ats_score, get_gap_report
Add server to claude_desktop_config.json
Restart Claude Desktop
Test with a real resume + JD pasted in chat


Code
python# server.py
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

from agents.parser import parse_resume
from agents.jd_parser import parse_jd
from agents.gap_analyzer import analyze_gaps
from agents.rewriter import rewrite_resume

load_dotenv()

mcp = FastMCP("ATS Resume Optimizer")


@mcp.tool()
def optimize_resume(resume_text: str, jd_text: str) -> dict:
    """
    Full ATS optimization pipeline.
    Takes raw resume text and job description text.
    Returns ATS score, missing skills, gap report,
    and rewritten bullets tailored to the JD.
    Use this when the user wants their resume optimized
    for a specific job.
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
                        parsed_jd.model_dump()
                    )
    return {
        "ats_score":         gaps.ats_score,
        "missing_skills":    gaps.missing_skills,
        "weak_sections":     gaps.weak_sections,
        "rewritten_bullets": rewrite.model_dump()
    }


@mcp.tool()
def get_ats_score(resume_text: str, jd_text: str) -> dict:
    """
    Quick ATS score only. No rewriting.
    Takes raw resume text and job description text.
    Returns alignment score from 0-100 and missing skills.
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
def get_gap_report(resume_text: str, jd_text: str) -> dict:
    """
    Detailed gap analysis only. No rewriting.
    Takes raw resume text and job description text.
    Returns score, missing skills, weak sections,
    missing keywords, and specific recommendations.
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


if __name__ == "__main__":
    mcp.run()

Connect to Claude Desktop
Find your Claude Desktop config file:
bash# mac
~/Library/Application Support/Claude/claude_desktop_config.json

# windows
%APPDATA%\Claude\claude_desktop_config.json
Add your server:
json{
  "mcpServers": {
    "ats-optimizer": {
      "command": "python",
      "args": ["/Users/susith/Projects/ATSLLM/server.py"]
    }
  }
}
Replace the path with your actual project path:
bash# get your full path
pwd
# /Users/susith/Projects/ATSLLM
Restart Claude Desktop completely after saving the config.

Verify Tools Are Registered
After restarting Claude Desktop, click the hammer icon (🔨) in the chat input. You should see:
ats-optimizer
  • optimize_resume
  • get_ats_score
  • get_gap_report
If tools don't appear check:

Path in config is absolute and correct
.venv is active when server starts
No syntax errors in server.py — run python server.py directly to test


Test It
Open Claude Desktop and paste this:
Here is my resume:
[paste your full resume text]

Here is the job description I am targeting:
[paste JD text]

Please optimize my resume for this role.
Claude will:

Recognise the intent
Call optimize_resume() automatically
Run your full LangGraph pipeline
Return the ATS score, gaps, and rewritten bullets
Explain the results to you in plain English


Test Each Tool Separately
# triggers get_ats_score
"What is my ATS score for this role?
 Resume: [paste]
 JD: [paste]"


# triggers get_gap_report
"What is missing from my resume for this job?
 Don't rewrite anything yet, just tell me the gaps.
 Resume: [paste]
 JD: [paste]"


# triggers optimize_resume
"Rewrite my resume to match this job description.
 Resume: [paste]
 JD: [paste]"

Updated Project Structure
ats-optimizer/
│
├── server.py               ← NEW — MCP entry point
├── optimize.py             ← KEEP — CLI still works
├── requirements.txt        ← updated with mcp + fastmcp
│
├── agents/                 ← UNCHANGED
│   ├── parser.py
│   ├── jd_parser.py
│   ├── gap_analyzer.py
│   └── rewriter.py
│
├── graph/                  ← UNCHANGED
│   └── workflow.py
│
└── utils/                  ← UNCHANGED
    ├── pdf_reader.py
    ├── build_kb.py
    └── formatter.py
One file added. Nothing else touched.

DAY 16 - ADD FAST API TO CALL FROM WEB

postman check - with plain text copied resume cause difficult to attach and test PDF


**Commit structure:**
```bash
git add .
git commit -m "day-1: pdf reader"
git commit -m "day-2: resume parser with structured output"
git commit -m "day-3: jd parser"
git commit -m "day-4: gap analyzer with ats scoring"
git commit -m "day-5: rag knowledge base with chromadb"
git commit -m "day-6: rewriter agent with rag retrieval"
git commit -m "day-7: end-to-end pipeline"
git commit -m "day-8: convert to langgraph stategraph"
git commit -m "day-9: self-correction loop with conditional routing"
git commit -m "day-10: sqlite checkpointing"
git commit -m "day-11: human-in-the-loop approval"
git commit -m "day-12: output formatter"
git commit -m "day-13: tested against 5 real jds"
git commit -m "day-14: readme, architecture docs, portfolio polish"
```

**Interview talking points to document in ARCHITECTURE.md:**
- "Why LangGraph instead of a simple script?" → Needed the self-correction loop, checkpointing, and human-in-the-loop pause — impossible cleanly without a graph
- "Why RAG for the rewriter?" → Generic rewrites are weak. Retrieving patterns from 20 real JDs grounds the rewriter in industry-standard language for the target role
- "How do you prevent hallucination?" → System prompt guardrails + Pydantic structured output + human approval gate

**Done when:** GitHub repo is public, README explains everything clearly, you can demo it in 3 minutes.

---

### 🚀 Week 2 Gate

> Self-correcting LangGraph agent with RAG-powered rewriting, human-in-the-loop approval, SQLite checkpointing, tested against 5 real JDs, clean GitHub repo. Interview-ready.

---

## What You Can Say in Interviews

After 14 days, you can walk through all of this without notes:

```
"I built a multi-agent resume optimizer using LangGraph.

The pipeline has 5 nodes: resume parser, JD parser,
gap analyzer, RAG-powered rewriter, and a scorer.

I used ChromaDB to store 20 real JDs as embeddings.
Before each rewrite, the agent retrieves the most
similar JD patterns so the output matches industry
language for the target role.

If the ATS score after rewriting is below 70,
the graph loops back to the rewriter — max 3 iterations.

I added SQLite checkpointing so any run can be resumed,
and a human-in-the-loop interrupt so the user approves
changes before they're saved."
```

That's every major GenAI concept covered in one 45-second explanation.

---

## Quick Reference

```bash
# install
pip install -r requirements.txt

# build knowledge base (once)
python utils/build_kb.py

# run optimizer
python optimize.py

# run with specific JD
python optimize.py --jd data/jds/ai_engineer.txt

# resume interrupted run
python optimize.py --thread-id run_1234567890

# smoke test
python test.py
```