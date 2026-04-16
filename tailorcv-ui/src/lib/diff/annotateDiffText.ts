/**
 * Produces an "optimized text" annotated with private-use markers so the UI can render
 * diff-like highlights while still parsing the resume into identical structure.
 *
 * Markers are:
 * - \uE000 ... \uE001 for additions (green highlight)
 * - \uE002 ... \uE001 for deletions (red strikethrough)
 *
 * These are intended for UI only and should never be copied out.
 */

import { diff_match_patch, DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT } from 'diff-match-patch'

const DIFF_ADD = '\uE000'
const DIFF_DEL = '\uE002'
const DIFF_END = '\uE001'

function normalizeForDiff(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function isWordChar(ch: string): boolean {
  return /[A-Za-z0-9]/.test(ch)
}

function wordTokenize(s: string): string[] {
  const out: string[] = []
  let buf = ''
  let mode: 'word' | 'space' | 'punct' | null = null

  const flush = () => {
    if (!buf) return
    out.push(buf)
    buf = ''
    mode = null
  }

  for (const ch of s) {
    if (/\s/.test(ch)) {
      if (mode !== 'space') flush()
      mode = 'space'
      buf += ch
      continue
    }
    if (isWordChar(ch)) {
      if (mode !== 'word') flush()
      mode = 'word'
      buf += ch
      continue
    }
    if (mode !== 'punct') flush()
    mode = 'punct'
    buf += ch
  }
  flush()
  return out
}

function tokensToText(tokens: string[]): string {
  return tokens.join('')
}

export function annotateDiffText(originalText: string, optimizedText: string): string {
  const o = normalizeForDiff(originalText)
  const n = normalizeForDiff(optimizedText)

  const oTokens = wordTokenize(o)
  const nTokens = wordTokenize(n)

  // diff-match-patch operates on strings; we encode tokens into a single string separated by \u0001.
  const SEP = '\u0001'
  const a = oTokens.join(SEP)
  const b = nTokens.join(SEP)

  const dmp = new diff_match_patch()
  const diffs = dmp.diff_main(a, b, false)
  dmp.diff_cleanupSemantic(diffs)

  let out = ''
  for (const [op, chunk] of diffs) {
    if (!chunk) continue
    const toks = chunk.split(SEP)
    const txt = tokensToText(toks)
    if (op === DIFF_EQUAL) {
      out += txt
    } else if (op === DIFF_INSERT) {
      out += `${DIFF_ADD}${txt}${DIFF_END}`
    } else if (op === DIFF_DELETE) {
      out += `${DIFF_DEL}${txt}${DIFF_END}`
    }
  }

  // Preserve trailing newline behavior closer to the optimized input.
  if (/\n$/.test(optimizedText) && !/\n$/.test(out)) out += '\n'
  return out
}

