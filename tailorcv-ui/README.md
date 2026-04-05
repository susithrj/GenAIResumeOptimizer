# TailorCV UI

React + Vite + TypeScript front end for the ATS resume optimizer. Visual design matches [`../frontend-designs/tailorcv-design-final.html`](../frontend-designs/tailorcv-design-final.html).

## API contract

`POST {VITE_API_BASE_URL}/api/optimize` with JSON body:

```json
{
  "resume_text": "...",
  "job_description": "...",
  "target_role": "java_developer"
}
```

Response shape is defined in [`src/types/api.ts`](src/types/api.ts) and produced by [`../tailorcv-mcp/api.py`](../tailorcv-mcp/api.py).

- **ATS score** is alignment of your **pasted** CV to the JD (not a separate “after rewrite” score unless the backend adds re-scoring later).
- **Rewritten body** (`rewritten_resume_text`) is your **full pasted resume** with **surgical** bullet (and optional summary) replacements; line breaks and section order are preserved as far as substring/line matching allows. The UI applies **keyword highlights** client-side from `keywords` with status `added` or `found` (HTML-escaped first).

## Run

```bash
npm install
npm run dev
```

Ensure [`../tailorcv-mcp/api.py`](../tailorcv-mcp/api.py) is running (`uvicorn api:app --reload` from `tailorcv-mcp`).

Optional: copy `.env.example` to `.env` and set `VITE_API_BASE_URL`.

## Mobile tabs

On narrow viewports, **Rewritten CV** vs **Keyword Analysis** switches the visible column (sidebar vs main output). On wider screens, both show at once.
