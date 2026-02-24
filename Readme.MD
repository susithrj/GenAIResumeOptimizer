# ATS Resume Optimizer 🎯

> A multi-agent CLI pipeline that analyzes your resume against a job description, scores ATS alignment, identifies gaps, and rewrites your bullets — powered by LangGraph, RAG, and GPT-4o.

---

## What It Does

Feed it a resume PDF and a job description. Get back:

- **ATS Score** (0–100) — how well your resume matches the JD
- **Gap Report** — missing skills, weak sections, misaligned keywords
- **Rewritten Bullets** — your experience rewritten to match JD tone, with keywords injected naturally
- **Change Log** — exactly what was changed and why
- **Optimized Resume** — saved as `output/optimized_resume.txt`

```
$ python optimize.py --resume data/resume.pdf --jd data/job_description.txt

Parsing resume...          ✓
Parsing job description... ✓
Analyzing gaps...          ✓

ATS Score  ████████░░  82/100  (+14 from original)

Missing skills:  Docker, CI/CD, Kubernetes
Weak sections:   Summary, Skills header

Rewriting bullets... (iteration 1/3)
Score after rewrite: 82/100 ✓ threshold met

Review changes? [y/n]: y
...
Saved → output/optimized_resume.txt
Saved → output/result.json
```

---

## Architecture

```
resume.pdf + job_description.txt
            │
            ▼
┌───────────────────────────────────────────────┐
│              LangGraph StateGraph              │
│                                               │
│  ┌──────────┐    ┌──────────┐                 │
│  │  Parse   │───▶│  Parse   │                 │
│  │ Resume   │    │    JD    │                 │
│  └──────────┘    └────┬─────┘                 │
│                       │                       │
│                       ▼                       │
│               ┌──────────────┐                │
│               │  Gap Analyzer│                │
│               │  (RAG-powered│                │
│               │  ATS Score)  │                │
│               └──────┬───────┘                │
│                      │                        │
│                      ▼                        │
│               ┌──────────────┐                │
│               │   Rewriter   │◀── ChromaDB    │
│               │    Agent     │    (JD RAG KB) │
│               └──────┬───────┘                │
│                      │                        │
│               ┌──────▼───────┐                │
│               │ Score Check  │                │
│               │  score ≥ 70? │                │
│               └──┬───────┬───┘                │
│                  │ yes   │ no (max 3 iters)   │
│                  ▼       └──▶ Rewriter        │
│            ┌─────────┐                        │
│            │  Human  │  ← approve/reject      │
│            │Approval │                        │
│            └────┬────┘                        │
│                 ▼                             │
│          ┌────────────┐                       │
│          │Save Output │                       │
│          └────────────┘                       │
└───────────────────────────────────────────────┘
```

### Agents

| Agent | File | Role |
|---|---|---|
| Resume Parser | `agents/parser.py` | Extracts structured sections from PDF |
| JD Parser | `agents/jd_parser.py` | Extracts required skills, keywords, seniority |
| Gap Analyzer | `agents/gap_analyzer.py` | Scores alignment, identifies missing skills |
| Rewriter | `agents/rewriter.py` | Rewrites bullets using RAG-retrieved JD patterns |
| Formatter | `utils/formatter.py` | Formats terminal output + saves files |

---

## GenAI Concepts Demonstrated

| Concept | Implementation |
|---|---|
| **LLM** | GPT-4o rewrites resume sections and scores alignment |
| **RAG** | ChromaDB stores 20+ real JDs; rewriter retrieves patterns before rewriting |
| **LangGraph** | StateGraph orchestrates all 5 agents with conditional routing |
| **Self-Correction Loop** | If ATS score < 70 after rewrite → loop back, max 3 iterations |
| **Structured Output** | Pydantic schemas enforce JSON output from every agent |
| **Prompt Engineering** | System prompts enforce truthfulness — no hallucinated skills |
| **Human-in-the-Loop** | User reviews and approves rewrites before saving |
| **Checkpointing** | SQLite checkpointer saves state — resume interrupted runs |
| **Tool Calling** | PDF extraction, scoring function, formatter as callable tools |

---

## Project Structure

```
ats-optimizer/
│
├── optimize.py             # main entry point
├── .env                    # API keys (never commit)
├── .gitignore
├── README.md
├── ARCHITECTURE.md
│
├── agents/
│   ├── parser.py           # resume section extractor
│   ├── jd_parser.py        # JD keyword + requirements extractor
│   ├── gap_analyzer.py     # ATS scorer + gap finder
│   └── rewriter.py         # RAG-powered bullet rewriter
│
├── graph/
│   └── workflow.py         # LangGraph StateGraph definition
│
├── utils/
│   ├── pdf_reader.py       # PDF → clean text
│   ├── build_kb.py         # embed JDs into ChromaDB
│   └── formatter.py        # terminal output + file saver
│
├── data/
│   ├── resume.pdf          # your resume
│   ├── job_description.txt # target JD
│   └── jds/                # knowledge base JDs (20+)
│
└── output/
    ├── result.json         # full structured output
    └── optimized_resume.txt
```

---

## Setup

**Requirements:** Python 3.10+, OpenAI API key

```bash
# 1. Clone and enter
git clone https://github.com/yourusername/ats-optimizer
cd ats-optimizer

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate        # mac/linux
venv\Scripts\activate           # windows

# 3. Install dependencies
pip install langchain langchain-openai langgraph
pip install pypdf chromadb python-dotenv tiktoken pydantic

# 4. Set API key
echo "OPENAI_API_KEY=sk-..." > .env

# 5. Build the JD knowledge base (run once)
python utils/build_kb.py

# 6. Smoke test
python test.py
```

---

## Usage

```bash
# Basic run
python optimize.py

# With explicit paths
python optimize.py --resume data/resume.pdf --jd data/job_description.txt

# Resume an interrupted run
python optimize.py --resume data/resume.pdf --jd data/jds/ai_engineer.txt --thread-id run_001
```

**Output files:**

```
output/result.json           # full structured data (score, gaps, rewrites, change log)
output/optimized_resume.txt  # clean resume text ready to paste
runs.db                      # SQLite checkpoint store
```

---

## State Schema

```python
class ATSState(TypedDict):
    resume_text: str           # raw PDF text
    jd_text: str               # raw JD text
    parsed_resume: dict        # structured resume sections
    parsed_jd: dict            # structured JD requirements
    ats_score: int             # 0-100 alignment score
    gaps: list[str]            # missing/weak areas
    rewritten_bullets: list    # improved experience bullets
    change_log: list           # what changed and why
    iterations: int            # rewrite loop counter
    approved: bool             # human approval flag
```

---

## How the Self-Correction Loop Works

```
After each rewrite, the graph re-scores the output.

score ≥ 70  →  route to human approval  →  save
score < 70  →  route back to rewriter (with feedback)
              max 3 iterations to prevent infinite loops
```

This is implemented as a conditional edge in LangGraph:

```python
def route_after_score(state: ATSState) -> str:
    if state["ats_score"] >= 70 or state["iterations"] >= 3:
        return "human_approval"
    return "rewrite"

graph.add_conditional_edges(
    "score_check",
    route_after_score,
    {"human_approval": "human_approval", "rewrite": "rewrite"}
)
```

---

## How RAG Powers the Rewriter

Before rewriting, the rewriter queries ChromaDB for similar JDs:

```
User JD: "Senior AI Engineer at fintech company"
         ↓
ChromaDB query: retrieve top-3 similar JDs from knowledge base
         ↓
Retrieved patterns injected into rewriter prompt:
"Here are examples of strong bullet points from similar roles: ..."
         ↓
LLM rewrites using candidate's real experience + retrieved patterns
```

This ensures rewrites match industry-standard language for the target role, not generic output.

---

## Example Output

```
══════════════════════════════════════════
 ATS RESUME OPTIMIZER — RESULT REPORT
══════════════════════════════════════════

 ATS Score  ████████░░  82/100  (+14 from original)

 GAPS FOUND (3)
 ✗ Docker          — required, not mentioned
 ✗ CI/CD pipelines — mentioned once, needs emphasis
 ✗ System design   — weak in experience section

 REWRITES (4 bullets changed)

 BEFORE: Built REST APIs for trading platform clients
 AFTER:  Designed and delivered RESTful microservices
         for high-frequency trading platforms serving
         50,000+ daily active users on AWS ECS

 BEFORE: Led team of junior developers
 AFTER:  Mentored and led a team of 4 junior engineers,
         conducting code reviews and driving adoption of
         clean architecture principles

 CHANGE LOG
 → Added "AWS ECS" to reflect existing cloud experience
 → Quantified user scale (from resume context)
 → Strengthened leadership language in team lead bullet
 → Added CI/CD reference to deployment bullet

══════════════════════════════════════════
 Approve these changes? [y/n/edit]:
```

---

## Build Plan

This project was built in 14 days following a structured day-by-day plan:

| Week | Focus | Gate |
|---|---|---|
| Week 1 (Days 1–7) | PDF reader → Parser → JD Parser → Gap Analyzer → RAG KB → Rewriter → Wire pipeline | Working end-to-end CLI |
| Week 2 (Days 8–14) | LangGraph conversion → Conditional routing → Checkpointing → Human-in-loop → Output formatter → Testing → Docs | Portfolio-ready project |

---

## What's Next

- [ ] Streamlit web UI — drag and drop resume + paste JD
- [ ] MCP server — connect to LinkedIn Jobs API for live JD fetching
- [ ] Multi-resume mode — optimize one resume for 5 JDs in batch
- [ ] Cover letter generator — generate tailored cover letter alongside resume
- [ ] LangSmith tracing — full observability on every agent run

---

## Tech Stack

| Layer | Technology |
|---|---|
| LLM | GPT-4o via LangChain |
| Orchestration | LangGraph (StateGraph) |
| RAG / Vector DB | ChromaDB (local) |
| Embeddings | OpenAI text-embedding-3-small |
| PDF Parsing | pypdf |
| Schema Validation | Pydantic v2 |
| State Persistence | SQLite (LangGraph checkpointer) |
| Config | python-dotenv |

---

## License

MIT

---

*Built as a GenAI portfolio project to demonstrate: LangGraph multi-agent orchestration, RAG pipelines, self-correction loops, structured output, and human-in-the-loop patterns.*