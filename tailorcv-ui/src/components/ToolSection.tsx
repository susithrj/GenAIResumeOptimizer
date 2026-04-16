import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { optimizeResume } from '../api/optimize'
import type { KeywordChip, OptimizeResponse } from '../types/api'
import { ResumeDocument } from './resume/ResumeDocument'
import { parseResumeText } from '../lib/resume/parseResumeText'
import { annotateDiffText } from '../lib/diff/annotateDiffText'
import type { ResumeDoc } from '../lib/resume/types'

const CV_PLACEHOLDER = `Paste your CV text here...

Example:
Experienced backend engineer with 4 years in Java and Spring Boot. Built microservices for fintech platform handling 50k daily transactions. Led team of 3 engineers to ship production-grade services...`

const JD_PLACEHOLDER = `Paste the job description here...

Example:
Senior Full Stack Engineer

We're looking for:
• 3+ years with React and TypeScript
• Experience with microservices architecture
• Strong knowledge of CI/CD pipelines
• AWS or GCP cloud experience`

const KW_STATUS_LABEL: Record<string, string> = {
  added: '+ Added',
  found: '✓ Found',
  missing: '✗ Missing',
  partial: '~ Partial',
}

type ToolSectionProps = {
  onToast: (msg: string) => void
}

export function ToolSection({ onToast }: ToolSectionProps) {
  const [cv, setCv] = useState('')
  const [jd, setJd] = useState('')
  const [targetRole, setTargetRole] = useState('java_developer')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<OptimizeResponse | null>(null)
  const [copyLabel, setCopyLabel] = useState('⎘ Copy optimized CV')
  const [outputTab, setOutputTab] = useState<'compare' | 'keywords'>('compare')

  const [cvViewMode, setCvViewMode] = useState<'preview' | 'edit'>('edit')
  const [showOutput, setShowOutput] = useState(false)
  const [staleMessage, setStaleMessage] = useState<string | null>(null)

  const optimizedSnapshotCv = useRef<string>('') // CV at the moment Optimize was clicked
  const originalPanelBodyRef = useRef<HTMLDivElement | null>(null)
  const optimizedPanelBodyRef = useRef<HTMLDivElement | null>(null)

  const cvReady = cv.trim().length > 0
  const jdReady = jd.trim().length > 0
  const optimizedReady = (result?.rewritten_resume_text?.trim()?.length ?? 0) > 0

  const originalDoc = useMemo(() => (cvReady ? parseResumeText(cv) : null), [cv, cvReady])

  const optimizedAnnotatedText = useMemo(() => {
    if (!optimizedReady) return null
    const base = optimizedSnapshotCv.current?.trim() ? optimizedSnapshotCv.current : cv
    return annotateDiffText(base, result!.rewritten_resume_text)
  }, [cv, optimizedReady, result])

  const optimizedDoc = useMemo(() => {
    if (!optimizedAnnotatedText) return null
    return parseResumeText(optimizedAnnotatedText)
  }, [optimizedAnnotatedText])

  const optimizedDocWithHeader = useMemo(() => {
    if (!optimizedDoc) return null
    if (!originalDoc) return optimizedDoc
    return mergeHeader(originalDoc, optimizedDoc)
  }, [optimizedDoc, originalDoc])

  const runAnalysis = useCallback(async () => {
    if (!cv.trim() || !jd.trim()) {
      onToast(`Please paste your ${!cv.trim() ? 'CV' : 'job description'} first`)
      return
    }
    setLoading(true)
    setResult(null)
    setOutputTab('compare')
    setStaleMessage(null)
    optimizedSnapshotCv.current = cv.trim()
    try {
      const data = await optimizeResume({
        resume_text: cv.trim(),
        job_description: jd.trim(),
        target_role: targetRole.trim() || 'java_developer',
      })
      setResult(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong — please try again'
      onToast(msg)
    } finally {
      setLoading(false)
    }
  }, [cv, jd, targetRole, onToast])

  const copyOutput = useCallback(() => {
    const text = result?.rewritten_resume_text?.trim() ?? ''
    if (!text) {
      onToast('Nothing to copy yet — run analysis first')
      return
    }
    void navigator.clipboard.writeText(text).then(() => {
      setCopyLabel('✓ Copied!')
      setTimeout(() => setCopyLabel('⎘ Copy optimized CV'), 2000)
    })
  }, [result, onToast])

  const clearAll = useCallback(() => {
    setCv('')
    setJd('')
    setResult(null)
    setCopyLabel('⎘ Copy optimized CV')
    setOutputTab('compare')
    setCvViewMode('edit')
    setShowOutput(false)
    setStaleMessage(null)
    optimizedSnapshotCv.current = ''
  }, [])

  const scoreLabel =
    result != null
      ? `ATS alignment: ${result.ats_score}%`
      : 'ATS alignment'
  const scoreSub =
    result != null
      ? 'Score reflects your pasted CV vs this job description (see rewritten output below).'
      : 'Run analysis to see your score'

  const scoreCircleClass =
    loading ? 'score-circle scoring' : result != null ? 'score-circle scored' : 'score-circle'
  const scoreCircleText = loading ? '' : result != null ? `${result.ats_score}%` : '—'

  const statusBadge =
    loading ? 'Processing…' : result != null ? '✓ Optimized' : 'Waiting for input'
  const statusClass =
    loading ? 'output-status-badge' : result != null ? 'output-status-badge ready' : 'output-status-badge'

  useEffect(() => {
    if (!cvReady) return
    setShowOutput(true)
    setCvViewMode('preview')
  }, [cvReady])

  useEffect(() => {
    if (outputTab !== 'compare') return
    // Ensure the user sees the resume header first (name/contact).
    const a = originalPanelBodyRef.current
    const b = optimizedPanelBodyRef.current
    if (a) a.scrollTop = 0
    if (b) b.scrollTop = 0
  }, [outputTab, cvViewMode, originalDoc, optimizedDocWithHeader])

  return (
    <section className="tool-section" id="tool">
      <div className="tool-section-label">Try it now — no account needed</div>

      <div className="input-grid">
        <div className={`input-panel${cvReady ? ' has-content' : ''}`}>
          <div className="input-panel-header">
            <div className="input-panel-label">Your CV</div>
            <div className={cvReady ? 'input-panel-badge ready' : 'input-panel-badge'}>
              {cvReady ? 'Ready ✓' : 'Paste below'}
            </div>
          </div>
          <textarea
            id="cv-input"
            value={cv}
            onChange={(e) => setCv(e.target.value)}
            onPaste={() => {
              // Resume preview should appear immediately on paste.
              setShowOutput(true)
              setCvViewMode('preview')
            }}
            placeholder={CV_PLACEHOLDER}
            aria-label="Your CV"
          />
        </div>

        <div className={`input-panel${jdReady ? ' has-content' : ''}`}>
          <div className="input-panel-header">
            <div className="input-panel-label">Job Description</div>
            <div className={jdReady ? 'input-panel-badge ready' : 'input-panel-badge'}>
              {jdReady ? 'Ready ✓' : 'Paste below'}
            </div>
          </div>
          <textarea
            id="jd-input"
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder={JD_PLACEHOLDER}
            aria-label="Job description"
          />
        </div>
      </div>

      <div style={{ marginTop: 10, marginBottom: 4 }}>
        <label htmlFor="target-role" className="input-panel-label" style={{ display: 'block', marginBottom: 6 }}>
          RAG role collection (Chroma)
        </label>
        <input
          id="target-role"
          type="text"
          value={targetRole}
          onChange={(e) => setTargetRole(e.target.value)}
          className="btn-outline"
          style={{
            width: '100%',
            maxWidth: 320,
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 13,
          }}
          placeholder="e.g. java_developer"
          title="Must match a folder under data/jds/ used when building the KB"
        />
      </div>

      <div className="action-bar">
        <div className="score-display">
          <div className={scoreCircleClass} id="score-circle" aria-hidden={loading}>
            {scoreCircleText}
          </div>
          <div className="score-info">
            <strong id="score-label-main">{scoreLabel}</strong>
            <span id="score-label-sub">{scoreSub}</span>
          </div>
        </div>
        <button
          type="button"
          className="btn-analyze"
          id="analyze-btn"
          disabled={loading}
          onClick={() => void runAnalysis()}
        >
          {loading ? 'Analyzing…' : result != null ? '✦ Optimize again' : '✦ Optimize my CV'}
        </button>
      </div>

      <div className="loading-bar">
        <div
          className={loading ? 'loading-bar-inner indeterminate' : 'loading-bar-inner'}
          id="loading-bar-inner"
        />
      </div>

      <div className="output-panel">
        <div className="output-header">
          <div className="output-tabs">
            <button
              type="button"
              className={outputTab === 'compare' ? 'tab-btn active' : 'tab-btn'}
              onClick={() => setOutputTab('compare')}
            >
              Compare
            </button>
            <button
              type="button"
              className={outputTab === 'keywords' ? 'tab-btn active' : 'tab-btn'}
              onClick={() => setOutputTab('keywords')}
            >
              Keyword Analysis
            </button>
          </div>
          <div className={statusClass} id="output-status">
            {statusBadge}
          </div>
        </div>

        {outputTab === 'compare' ? (
          <div className="compare-body">
            {!showOutput ? (
              <div className="output-placeholder">
                <div className="icon">✦</div>
                <p>Your resume preview will appear here</p>
                <small>Paste your CV above to see the structured preview instantly</small>
              </div>
            ) : (
              <div className="compare-grid">
                <div className="compare-panel">
                  <div className="panel-stats">
                    <div className="panel-title">Original</div>
                    <div className="panel-metrics">{cvReady ? `${countWords(cv)} words` : '—'}</div>
                    <div className="panel-actions">
                      {cvViewMode === 'preview' ? (
                        <button
                          type="button"
                          className="btn-outline btn-sm"
                          onClick={() => {
                            setCvViewMode('edit')
                            if (result != null) {
                              setResult(null)
                              setStaleMessage('Re-optimize to see updated results')
                              setCopyLabel('⎘ Copy optimized CV')
                            }
                          }}
                        >
                          Edit
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-outline btn-sm"
                          onClick={() => {
                            setCvViewMode('preview')
                            setShowOutput(true)
                          }}
                        >
                          Done
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="panel-body" ref={cvViewMode === 'preview' ? originalPanelBodyRef : undefined}>
                    {cvViewMode === 'edit' ? (
                      <textarea
                        className="panel-editor"
                        value={cv}
                        onChange={(e) => setCv(e.target.value)}
                        placeholder={CV_PLACEHOLDER}
                        aria-label="Edit resume text"
                      />
                    ) : originalDoc ? (
                      <ResumeDocument doc={originalDoc} />
                    ) : (
                      <div className="panel-empty">Paste your CV above to preview it here.</div>
                    )}
                  </div>
                </div>

                <div className="compare-panel">
                  <div className="panel-stats">
                    <div className="panel-title">Optimized</div>
                    <div className="panel-metrics">
                      {result != null ? (
                        <>
                          <span>{`${countAddedKeywords(result.keywords)} keywords added`}</span>
                          <span className="dot">•</span>
                          <span>{`${result.ats_score}% ATS`}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </div>
                    <div className="panel-actions">
                      <button
                        type="button"
                        className={`btn-copy btn-sm${copyLabel.startsWith('✓') ? ' copied' : ''}`}
                        onClick={copyOutput}
                        disabled={result == null}
                        title={result == null ? 'Run Optimize to enable copy' : 'Copy optimized resume text'}
                      >
                        {copyLabel}
                      </button>
                    </div>
                  </div>

                  <div className="panel-body" ref={result != null ? optimizedPanelBodyRef : undefined}>
                    {result == null ? (
                      <div className="panel-stale">
                        <div className="panel-stale-title">
                          {staleMessage ?? 'Optimize to see your improved resume'}
                        </div>
                        <div className="panel-stale-sub">
                          Paste your job description above, then click Optimize.
                        </div>
                      </div>
                    ) : optimizedDoc ? (
                      <ResumeDocument doc={optimizedDocWithHeader ?? optimizedDoc} />
                    ) : (
                      <div className="panel-empty">Generating optimized preview…</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="keywords-body">
            <KeywordSidebar chips={result?.keywords ?? null} />
          </div>
        )}

        <div className="output-actions">
          <button type="button" className="btn-clear" onClick={clearAll}>
            ↺ Start over
          </button>
        </div>
      </div>
    </section>
  )
}

function KeywordSidebar({ chips }: { chips: KeywordChip[] | null }) {
  if (chips == null || chips.length === 0) {
    return (
      <div className="keyword-sidebar" id="keyword-sidebar">
        <div className="sidebar-title">Keywords</div>
        <div className="sidebar-placeholder">
          <div className="sidebar-placeholder-icon">◈</div>
          <p>Keyword analysis will appear here after you paste your CV and run optimization</p>
        </div>
        <div className="kw-skeleton" />
        <div className="kw-skeleton" />
        <div className="kw-skeleton" />
        <div className="kw-skeleton" />
      </div>
    )
  }

  return (
    <div className="keyword-sidebar" id="keyword-sidebar">
      <div className="sidebar-title">Keywords</div>
      {chips.map((kw, i) => (
        <div key={`${i}-${kw.word}-${kw.status}`} className={`kw-chip ${kw.status}`}>
          <span className="kw-word">{kw.word}</span>
          <span className="kw-status">{KW_STATUS_LABEL[kw.status] ?? kw.status}</span>
        </div>
      ))}
    </div>
  )
}

function countWords(text: string): number {
  const t = text.trim()
  if (!t) return 0
  return t.split(/\s+/).filter(Boolean).length
}

function countAddedKeywords(chips: KeywordChip[]): number {
  const unique = new Set(chips.filter((k) => k.status === 'added').map((k) => k.word.trim().toLowerCase()).filter(Boolean))
  return unique.size
}

function mergeHeader(original: ResumeDoc, optimized: ResumeDoc): ResumeDoc {
  const name = optimized.name?.trim() ? optimized.name : original.name

  const contactLines =
    optimized.contactLines.length > 0 ? optimized.contactLines : original.contactLines

  const summaryLines =
    optimized.summaryLines.length > 0 ? optimized.summaryLines : original.summaryLines

  // Avoid accidental duplication when optimized already contains identical header lines.
  const dedupe = (xs: string[]) => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const x of xs) {
      const k = x.trim()
      if (!k) continue
      const key = k.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(x)
    }
    return out
  }

  return {
    ...optimized,
    name,
    contactLines: dedupe(contactLines),
    summaryLines: dedupe(summaryLines),
  }
}
