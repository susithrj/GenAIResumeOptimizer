export function PricingSection() {
  return (
    <section className="pricing-section" id="pricing">
      <div className="section-eyebrow">Pricing</div>
      <h2 className="section-title">
        Simple.
        <br />
        No surprises.
      </h2>
      <div className="pricing-grid">
        <div className="price-card">
          <div className="price-tier">Free</div>
          <div className="price-amount">$0</div>
          <div className="price-period">Forever free</div>
          <div className="price-feat">
            <span className="pf-check">✓</span> Paste CV + JD optimizations
          </div>
          <div className="price-feat">
            <span className="pf-check">✓</span> ATS alignment + keyword chips
          </div>
          <div className="price-feat">
            <span className="pf-check">✓</span> Full AI rewrite output
          </div>
          <div className="price-feat">
            <span className="pf-dash">—</span> DOCX upload &amp; download
          </div>
          <div className="price-feat">
            <span className="pf-dash">—</span> Unlimited optimizations
          </div>
          <a href="#tool" className="btn-outline price-cta" style={{ textAlign: 'center' }}>
            Start free
          </a>
        </div>
        <div className="price-card featured">
          <div className="price-tier">Pro</div>
          <div className="price-amount">$9</div>
          <div className="price-period">per month · cancel anytime</div>
          <div className="price-feat">
            <span className="pf-check">✓</span> Unlimited optimizations
          </div>
          <div className="price-feat">
            <span className="pf-check">✓</span> ATS alignment + keyword chips
          </div>
          <div className="price-feat">
            <span className="pf-check">✓</span> Full AI rewrite
          </div>
          <div className="price-feat">
            <span className="pf-check">✓</span> DOCX upload &amp; download
          </div>
          <div className="price-feat">
            <span className="pf-check">✓</span> Priority support
          </div>
          <span className="btn-primary price-cta" style={{ display: 'block', textAlign: 'center', opacity: 0.7 }} title="Coming soon">
            Get Pro →
          </span>
        </div>
      </div>
    </section>
  )
}
