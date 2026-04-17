import type { ScoreResponse } from '../types/api'
import { getApiBase } from './optimize'

export async function scoreResume(body: {
  resume_text: string
  job_description: string
}): Promise<ScoreResponse> {
  const res = await fetch(`${getApiBase()}/api/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resume_text: body.resume_text,
      job_description: body.job_description,
    }),
  })

  if (!res.ok) {
    let detail = res.statusText
    try {
      const err = await res.json()
      if (typeof err?.detail === 'string') detail = err.detail
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Request failed (${res.status})`)
  }

  return res.json() as Promise<ScoreResponse>
}

