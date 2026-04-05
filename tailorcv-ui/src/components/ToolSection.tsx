import { useCallback, useEffect, useMemo, useState } from 'react'
import { optimizeResume } from '../api/optimize'
import { buildHighlightedHtml } from '../lib/highlight'
import type { KeywordChip, OptimizeResponse } from '../types/api'

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
  const [outputTab, setOutputTab] = useState<'rewritten' | 'keywords'>('rewritten')
  const [highlightsOn, setHighlightsOn] = useState(true)
  const [copyLabel, setCopyLabel] = useState('⎘ Copy optimized CV')

  const cvReady = cv.trim().length > 0
  const jdReady = jd.trim().length > 0

  const wordsToHighlight = useMemo(() => {
    if (!result) return []
    return result.keywords.filter((k) => k.status === 'added' || k.status === 'found').map((k) => k.word)
  }, [result])

  const displayHtml = useMemo(() => {
    if (!result?.rewritten_resume_text) return ''
    const plain = result.rewritten_resume_text
    if (!highlightsOn || wordsToHighlight.length === 0) {
      return plain.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')
    }
    return buildHighlightedHtml(plain, wordsToHighlight).replace(/\n/g, '<br/>')
  }, [result, highlightsOn, wordsToHighlight])

  const runAnalysis = useCallback(async () => {
    if (!cv.trim() || !jd.trim()) {
      onToast(`Please paste your ${!cv.trim() ? 'CV' : 'job description'} first`)
      return
    }
    setLoading(true)
    setResult(null)
    setOutputTab('rewritten')
    try {
      const data = await optimizeResume({
        resume_text: cv.trim(),
        job_description: jd.trim(),
        target_role: targetRole.trim() || 'java_developer',
      })
      setResult(data)
      const canHighlight = data.keywords.some((k) => k.status === 'added' || k.status === 'found')
      setHighlightsOn(canHighlight)
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
    setOutputTab('rewritten')
    setHighlightsOn(true)
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
    if (result && wordsToHighlight.length === 0) {
      setHighlightsOn(false)
    }
  }, [result, wordsToHighlight.length])

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
              className={outputTab === 'rewritten' ? 'tab-btn active' : 'tab-btn'}
              onClick={() => setOutputTab('rewritten')}
            >
              Rewritten CV
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

        <div className={`output-body tab-${outputTab}`}>
          <div
            className="output-text"
            id="output-text"
            style={{ whiteSpace: 'pre-wrap' as const }}
          >
            {result == null ? (
              <div className="output-placeholder">
                <div className="icon">✦</div>
                <p>Your optimized CV will appear here</p>
                <small>Paste your CV and job description above, then click Optimize</small>
              </div>
            ) : (
              <div dangerouslySetInnerHTML={{ __html: displayHtml }} />
            )}
          </div>

          <KeywordSidebar chips={result?.keywords ?? null} />
        </div>

        <div className="output-actions">
          <button
            type="button"
            className={`btn-copy${copyLabel.startsWith('✓') ? ' copied' : ''}`}
            id="copy-btn"
            onClick={copyOutput}
          >
            {copyLabel}
          </button>
          {result != null && wordsToHighlight.length > 0 ? (
            <button
              type="button"
              className={highlightsOn ? 'highlight-toggle active' : 'highlight-toggle'}
              id="highlight-toggle"
              onClick={() => setHighlightsOn((v) => !v)}
            >
              <span className="dot" />
              {highlightsOn ? 'Highlights on' : 'Highlights off'}
            </button>
          ) : null}
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
