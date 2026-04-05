import { useEffect, useRef } from 'react'

const STEPS = [
  {
    title: 'Paste your CV',
    body: 'Copy your existing CV text and paste it into the left panel. No formatting needed — plain text works perfectly.',
  },
  {
    title: 'Add the job description',
    body: "Paste the job posting you're applying for. The pipeline extracts keywords and requirements recruiters scan for.",
  },
  {
    title: 'Copy your optimized CV',
    body: 'Get rewritten bullets and a summary with keywords reflected naturally. See your ATS alignment score and keyword chips — then copy the result.',
  },
] as const

export function HowSection() {
  const stepRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const idx = stepRefs.current.findIndex((el) => el === entry.target)
          const delay = idx >= 0 ? idx * 120 : 0
          window.setTimeout(() => {
            entry.target.classList.add('visible')
          }, delay)
        })
      },
      { threshold: 0.2 },
    )

    stepRefs.current.forEach((el) => {
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [])

  return (
    <section className="how-section" id="how">
      <div className="how-inner">
        <div className="section-eyebrow">How it works</div>
        <h2 className="section-title">
          Three steps.
          <br />
          One run. Done.
        </h2>
        <div className="steps">
          {STEPS.map((s, i) => (
            <div
              key={s.title}
              className="step"
              ref={(el) => {
                stepRefs.current[i] = el
              }}
            >
              <div className="step-num">{i + 1}</div>
              <div className="step-content">
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
