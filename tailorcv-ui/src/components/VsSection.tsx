export function VsSection() {
  return (
    <section className="vs-section">
      <div className="section-eyebrow">Why TailorCV</div>
      <h2 className="section-title">
        Minutes of manual edits
        <br />
        vs one optimized pass.
      </h2>
      <div className="compare-grid">
        <div className="compare-card">
          <div className="compare-header">
            <div className="compare-name">Keyword checkers</div>
            <div className="compare-price">Typical workflow</div>
          </div>
          <div className="compare-row">
            <div className="check check-yes">✓</div>
            Shows you missing keywords
          </div>
          <div className="compare-row">
            <div className="check check-no">✗</div>
            You manually insert every keyword
          </div>
          <div className="compare-row">
            <div className="check check-no">✗</div>
            Back-and-forth merging required
          </div>
          <div className="compare-row">
            <div className="check check-no">✗</div>
            Long session per application
          </div>
          <div className="compare-row">
            <div className="check check-no">✗</div>
            No full CV rewrite
          </div>
        </div>
        <div className="compare-card winner">
          <div className="compare-header">
            <div className="compare-name">TailorCV</div>
            <div className="winner-badge">Free to start</div>
          </div>
          <div className="compare-row">
            <div className="check check-yes">✓</div>
            Rewrites bullets with role-aware context
          </div>
          <div className="compare-row">
            <div className="check check-yes">✓</div>
            Full AI rewrite in one run
          </div>
          <div className="compare-row">
            <div className="check check-yes">✓</div>
            One click copy — done
          </div>
          <div className="compare-row">
            <div className="check check-yes">✓</div>
            Fast iteration per job posting
          </div>
          <div className="compare-row">
            <div className="check check-yes">✓</div>
            Keyword sidebar + alignment score
          </div>
        </div>
      </div>
    </section>
  )
}
