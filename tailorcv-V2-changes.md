# TailorCV — UX Enhancement Requirements

## Background

TailorCV is an AI-powered ATS resume optimizer. User pastes their resume + job description, the backend rewrites the resume with missing keywords inserted, and the frontend displays the result.

**Current problem:** Output is rendered as raw plain text. No formatting, no structure, no visual hierarchy. Looks like a notepad dump. This kills user trust and the product feels unfinished.

---

## User Flow (Critical — Follow Exactly)

### Step 1 — Paste
User pastes their resume text into the input area.

**Immediately on paste** — before the user clicks anything — the input textarea is replaced by a structured rendered preview of their resume in the left panel. The parser runs instantly on paste and renders the resume as a formatted document: name large at top, section headers distinct, bullets indented.

This is the first "wow" moment. The user sees their resume go from raw text to a clean structured document automatically. It signals that the tool understands resumes.

### Step 2 — Edit Mode (Optional)
The left panel has a persistent **Edit** button in the top-right corner, always visible.

Clicking Edit flips the left panel back to the raw textarea, pre-filled with the current resume text. The user can make any changes they want.

Clicking **Done** re-runs the parser and re-renders the structured preview.

If the user had already optimized and then edits, the right panel must be cleared and show a message: *"Re-optimize to see updated results"* — so the user knows the current diff is stale and needs to be re-run.

### Step 3 — Optimize
User clicks the Optimize button. The right panel appears with the AI-optimized resume, rendered in the same identical structured format as the left panel, with diff highlights applied.

This is the second "wow" moment — they see exactly what the AI changed, word by word.

---

## What Needs to Be Built

### 1. Resume Structure Parser

Automatically detect and classify resume structure from plain text — name, contact info, section headers, job titles, bullet points, body text. Runs instantly on paste. No user input required. Must handle the typical resume format that 80% of users will paste.

### 2. Styled Resume Renderer

Both panels render as a visually formatted document using the existing dark theme design tokens. Structure should look like a real resume: name prominent at top, section headers visually distinct, bullets properly indented, body text readable.

### 3. Side-by-Side Diff View

Replace the current single output panel with a split view:
- **Left panel** — original resume, rendered clean with no highlights, with Edit button
- **Right panel** — optimized resume, same identical layout and formatting as the left

Both panels must be pixel-identical in structure. The only difference between them is the highlights.

### 4. Edit / Preview Toggle on Left Panel

The left panel has two states:
- **Preview mode** (default after paste) — structured rendered resume, Edit button visible
- **Edit mode** — raw textarea with the resume text, Done button to return to preview

Switching to Edit mode after an optimization has already run must clear the right panel and show a stale state message.

### 5. Diff Highlighting

Use **diff-match-patch** (Google's open source diffing library) to compute word-level differences between the original and optimized text.

- Words added by AI → highlight green
- Words removed by AI → red strikethrough
- Highlights appear only on the right (optimized) panel
- Left panel always renders clean

This should feel like a code diff tool, but for resume text.

### 6. Panel Stats Bar

Above each panel show a minimal info bar:
- Left: word count of original
- Right: number of keywords added, ATS score percentage

### 7. Copy Button

On the optimized panel, a copy button that copies plain text only — no HTML, no markup, no highlights. Just the clean optimized resume text ready to paste anywhere.

---

## What Must NOT Change

- The input section (paste areas for resume and job description)
- The FastAPI backend and its API contract
- The existing dark theme and design tokens
- Nav, landing page sections, pricing, footer
- Skeleton loading animation during API call

---

## Mobile Behaviour

On small screens, stack the two panels vertically. Show optimized panel first, original below it.

---

## Libraries to Use

- **diff-match-patch** for word-level diffing
- No other new dependencies needed — use what's already in the React project
