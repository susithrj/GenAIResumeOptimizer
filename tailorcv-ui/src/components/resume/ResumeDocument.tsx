import type { ResumeDoc } from '../../lib/resume/types'

const DIFF_ADD = '\uE000'
const DIFF_DEL = '\uE002'
const DIFF_END = '\uE001'

type ResumeDocumentProps = {
  doc: ResumeDoc
}

function splitInlineDiffTokens(text: string): Array<{ kind: 'text' | 'add' | 'del'; text: string }> {
  if (!text) return []

  const out: Array<{ kind: 'text' | 'add' | 'del'; text: string }> = []
  let i = 0
  let mode: 'text' | 'add' | 'del' = 'text'
  let buf = ''

  const flush = () => {
    if (!buf) return
    out.push({ kind: mode, text: buf })
    buf = ''
  }

  while (i < text.length) {
    const ch = text[i]
    if (ch === DIFF_ADD) {
      flush()
      mode = 'add'
      i += 1
      continue
    }
    if (ch === DIFF_DEL) {
      flush()
      mode = 'del'
      i += 1
      continue
    }
    if (ch === DIFF_END) {
      flush()
      mode = 'text'
      i += 1
      continue
    }
    buf += ch
    i += 1
  }
  flush()
  return out
}

function InlineText({ text }: { text: string }) {
  const parts = splitInlineDiffTokens(text)
  if (parts.length === 0) return null
  return (
    <>
      {parts.map((p, idx) => {
        if (p.kind === 'add') return <span key={idx} className="diff-add">{p.text}</span>
        if (p.kind === 'del') return <span key={idx} className="diff-del">{p.text}</span>
        return <span key={idx}>{p.text}</span>
      })}
    </>
  )
}

export function ResumeDocument({ doc }: ResumeDocumentProps) {
  return (
    <article className="resume-shell">
      {doc.name ? <h1 className="resume-name"><InlineText text={doc.name} /></h1> : null}
      {doc.summaryLines.length > 0 ? (
        <div className="resume-summary">
          {doc.summaryLines.map((l, idx) => (
            <p key={idx} className="resume-paragraph">
              <InlineText text={l} />
            </p>
          ))}
        </div>
      ) : null}

      {doc.contactLines.length > 0 ? (
        <div className="resume-contact">
          {doc.contactLines.map((l, idx) => (
            <div key={idx} className="resume-contact-line">
              <InlineText text={l} />
            </div>
          ))}
        </div>
      ) : null}

      {doc.sections.map((section, idx) => (
        <section key={`${idx}-${section.title}`} className="resume-section">
          <h2 className="resume-section-title">
            <InlineText text={section.title} />
          </h2>

          {section.blocks.map((b, bIdx) => {
            if (b.type === 'paragraph') {
              return (
                <p key={bIdx} className="resume-paragraph">
                  <InlineText text={b.text} />
                </p>
              )
            }
            return (
              <ul key={bIdx} className="resume-bullets">
                {b.items.map((it, itIdx) => (
                  <li key={itIdx}>
                    <InlineText text={it} />
                  </li>
                ))}
              </ul>
            )
          })}
        </section>
      ))}
    </article>
  )
}

