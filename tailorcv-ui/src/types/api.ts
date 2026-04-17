/** Mirrors POST /api/optimize response from tailorcv-mcp/api.py */

export type KeywordStatus = 'added' | 'found' | 'missing' | 'partial'

export interface KeywordChip {
  word: string
  status: KeywordStatus
}

export interface RewrittenBullet {
  original: string
  rewritten: string
  reason: string
  keywords_added: string[]
}

export interface OptimizeResponse {
  ats_score: number
  missing_skills: string[]
  weak_sections: string[]
  matched_skills: string[]
  missing_keywords: string[]
  recommendations: string[]
  rewritten_bullets: RewrittenBullet[]
  new_summary: string
  overall_changes: string
  rewritten_resume_text: string
  keywords: KeywordChip[]
}

/** Mirrors POST /api/score response from tailorcv-mcp/api.py */
export interface ScoreResponse {
  ats_score: number
  covered: string[]
  missing: string[]
  phrase_count: number
  covered_count: number
  threshold: number
}
