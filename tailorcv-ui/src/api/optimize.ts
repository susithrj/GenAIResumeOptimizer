import type { OptimizeResponse } from '../types/api'

const defaultBase = 'http://127.0.0.1:8000'

export function getApiBase(): string {
  const v = import.meta.env.VITE_API_BASE_URL
  return (typeof v === 'string' && v.trim()) ? v.trim().replace(/\/$/, '') : defaultBase
}

export async function optimizeResume(body: {
  resume_text: string
  job_description: string
  target_role?: string
}): Promise<OptimizeResponse> {
  const res = await fetch(`${getApiBase()}/api/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resume_text: body.resume_text,
      job_description: body.job_description,
      target_role: body.target_role ?? 'java_developer',
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

  return res.json() as Promise<OptimizeResponse>
}
