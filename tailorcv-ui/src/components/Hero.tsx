export function Hero() {
  return (
    <section className="hero">
      <div className="badge">
        <div className="badge-dot" aria-hidden />
        Stop losing jobs to ATS bots
      </div>
      <h1>
        Jobscan tells you
        <br />
        what&apos;s missing.
        <br />
        <em>We fix it for you.</em>
      </h1>
      <p className="hero-sub">
        Paste your CV and the job description. Get a fully rewritten, ATS-optimized CV back — keywords
        grounded in the role, no manual merging.
      </p>
      <div className="cta-row">
        <a href="#tool" className="btn-hero">
          Optimize my CV free →
        </a>
        <a href="#how" className="btn-ghost">
          See how it works
        </a>
      </div>
      <p className="hero-footnote">
        Free to start &nbsp;·&nbsp; No credit card &nbsp;·&nbsp; API-powered analysis
      </p>
    </section>
  )
}
