import type { ResumeDoc, ResumeSection } from './types'

const KNOWN_SECTION_TITLES = new Set([
  'experience',
  'work experience',
  'professional experience',
  'employment',
  'projects',
  'project experience',
  'skills',
  'technical skills',
  'education',
  'certifications',
  'certification',
  'summary',
  'professional summary',
  'profile',
  'objective',
  'publications',
  'awards',
  'volunteering',
  'volunteer experience',
  'open source',
  'interests',
  'languages',
])

const SECTION_KEYWORDS = [
  'experience',
  'employment',
  'projects',
  'skills',
  'education',
  'certification',
  'certifications',
  'summary',
  'profile',
  'objective',
  'publications',
  'awards',
  'volunteer',
  'volunteering',
  'interests',
  'languages',
  'achievements',
  'highlights',
]

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function isLikelyContactLine(line: string): boolean {
  const l = line.toLowerCase()
  return (
    l.includes('@') ||
    l.includes('linkedin') ||
    l.includes('github') ||
    l.includes('portfolio') ||
    l.includes('http://') ||
    l.includes('https://') ||
    /\b\d{3}[-.\s)]*\d{3}[-.\s]*\d{4}\b/.test(l)
  )
}

function isSectionHeader(line: string): boolean {
  const raw = line.trim()
  if (!raw) return false
  if (raw.length > 60) return false

  const cleaned = raw.replace(/[:\-–—]+$/, '').trim()
  const lc = cleaned.toLowerCase()
  if (KNOWN_SECTION_TITLES.has(lc)) return true

  const lettersOnly = cleaned.replace(/[^a-zA-Z]/g, '')
  const upper = lettersOnly && lettersOnly === lettersOnly.toUpperCase()
  if (upper && lettersOnly.length >= 5) {
    // Avoid misclassifying ALL-CAPS names as section headers.
    // Only treat ALL-CAPS lines as section headers if they contain known section keywords.
    const hasKeyword = SECTION_KEYWORDS.some((k) => lc.includes(k))
    if (hasKeyword) return true
  }

  // Avoid misclassifying person names as section headers (Title Case or ALL CAPS).
  // Examples: "SUSITH HEMATHILAKA", "John Smith"
  const nameWords = cleaned.split(/\s+/).filter(Boolean)
  const looksLikeAllCapsName =
    nameWords.length >= 2 &&
    nameWords.length <= 5 &&
    nameWords.every((w) => /^[A-Z]{2,}$/.test(w)) &&
    !SECTION_KEYWORDS.some((k) => lc.includes(k))
  if (looksLikeAllCapsName) return false

  const looksLikeTitleCaseName =
    nameWords.length >= 2 &&
    nameWords.length <= 5 &&
    nameWords.every((w) => /^[A-Z][a-z'.-]+$/.test(w)) &&
    !SECTION_KEYWORDS.some((k) => lc.includes(k))
  if (looksLikeTitleCaseName) return false

  // Title Case heuristic: most words start with capital letters and it isn't a sentence.
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length >= 1 && words.length <= 5 && !/[.!?]$/.test(cleaned)) {
    const titleish = words.every((w) => /^[A-Z][a-zA-Z]+$/.test(w) || /^[A-Z]{2,}$/.test(w))
    if (titleish) return true
  }

  return false
}

function isBulletLine(line: string): boolean {
  return /^\s*([•*-]|\u2022)\s+/.test(line)
}

function stripBulletPrefix(line: string): string {
  return line.replace(/^\s*([•*-]|\u2022)\s+/, '').trim()
}

function extractLikelyName(line: string): string | null {
  const isLikelyNameCore = (rawLine: string): boolean => {
    const raw = rawLine.trim()
    if (!raw) return false
    if (raw.length > 60) return false
    // Don't treat well-known section headers as names.
    const lc = raw.replace(/[:\-–—]+$/, '').trim().toLowerCase()
    if (KNOWN_SECTION_TITLES.has(lc)) return false
    if (SECTION_KEYWORDS.some((k) => lc.includes(k))) return false
    if (isLikelyContactLine(raw)) return false
    if (/\d/.test(raw)) return false
    const words = raw.split(/\s+/).filter(Boolean)
    if (words.length < 2 || words.length > 5) return false
    const titleCase = words.every((w) => /^[A-Z][a-z'.-]+$/.test(w))
    if (titleCase) return true

    // Accept ALL-CAPS names like "SUSITH HEMATHILAKA"
    const lettersOnly = raw.replace(/[^A-Za-z]/g, '')
    const allCaps = lettersOnly.length >= 6 && lettersOnly === lettersOnly.toUpperCase()
    if (allCaps) return true

    return false
  }

  const raw = line.trim()
  if (!raw) return null

  // Common pattern: "NAME | Senior Backend Engineer | ..."
  // Extract the left-most segment and treat that as the candidate name.
  const firstSegment = raw.split(/[|]/)[0]?.trim()
  if (firstSegment && firstSegment !== raw && isLikelyNameCore(firstSegment)) return firstSegment

  // Common pattern: "NAME — Senior Backend Engineer" / "NAME - Senior Backend Engineer"
  const dashSplit = raw.split(/\s+[–—-]\s+/)[0]?.trim()
  if (dashSplit && dashSplit !== raw && isLikelyNameCore(dashSplit)) return dashSplit

  return isLikelyNameCore(raw) ? raw : null
}

function isMonthToken(s: string): boolean {
  return /^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(tember)?|oct(ober)?|nov(ember)?|dec(ember)?)\.?$/i.test(
    s,
  )
}

function looksLikeDateRange(line: string): boolean {
  const l = line.toLowerCase()
  if (/\bpresent\b/.test(l)) return true
  if (/\b(19|20)\d{2}\b/.test(l) && /[-–—]/.test(l)) return true
  // e.g. "February 2025 – Present"
  const parts = l.replace(/[|·]/g, ' ').split(/\s+/).filter(Boolean)
  for (let i = 0; i < parts.length - 1; i++) {
    if (isMonthToken(parts[i]) && /^\d{4}$/.test(parts[i + 1])) return true
  }
  return false
}

function looksLikeJobHeader(line: string): boolean {
  const raw = line.trim()
  if (!raw) return false
  // Common resume role header patterns: "Role | Feb 2025 – Present"
  if ((raw.includes('|') || raw.includes('·')) && looksLikeDateRange(raw)) return true
  // "Associate Technical Lead | February 2025 – Present Sysco LABS, Sri Lanka"
  if (looksLikeDateRange(raw) && raw.length <= 120) return true
  return false
}

function looksLikeStandaloneLine(line: string): boolean {
  const raw = line.trim()
  if (!raw) return false
  if (looksLikeJobHeader(raw)) return true
  if (isLikelyContactLine(raw)) return true
  // Short, title-like lines should remain as their own blocks (company lines, locations, headings).
  if (raw.length <= 70 && !/[.!?]$/.test(raw)) {
    const words = raw.split(/\s+/).filter(Boolean)
    const titleish =
      words.length <= 8 &&
      words.length >= 2 &&
      words.filter((w) => /^[A-Z]/.test(w)).length >= Math.ceil(words.length * 0.6)
    if (titleish) return true
  }
  return false
}

function looksLikeSentenceContinuation(prevLine: string, nextLine: string): boolean {
  const prev = prevLine.trim()
  const next = nextLine.trim()
  if (!prev || !next) return false
  // If previous line ends with comma/colon/semicolon, it likely continues.
  if (/[,:;]$/.test(prev)) return true
  // If previous line doesn't end with terminal punctuation and next starts lowercase, it likely continues.
  if (!/[.!?]$/.test(prev) && /^[a-z]/.test(next)) return true
  // If previous line ends with a word that often continues, treat as continuation.
  if (/\b(and|or|with|using|including)$/i.test(prev)) return true
  return false
}

function pushParagraph(section: ResumeSection, lines: string[]) {
  const text = lines.join(' ').trim()
  if (!text) return
  section.blocks.push({ type: 'paragraph', text })
}

function pushBullets(section: ResumeSection, items: string[]) {
  const clean = items.map((x) => x.trim()).filter(Boolean)
  if (clean.length === 0) return
  section.blocks.push({ type: 'bullets', items: clean })
}

function ensureSection(sections: ResumeSection[], title: string): ResumeSection {
  const existing = sections[sections.length - 1]
  if (existing && existing.title.toLowerCase() === title.toLowerCase()) return existing
  const s: ResumeSection = { title, blocks: [] }
  sections.push(s)
  return s
}

export function parseResumeText(input: string): ResumeDoc {
  const text = normalizeText(input)
  const rawLines = text.split('\n').map((l) => l.replace(/\t/g, '  '))

  // Remove excessive consecutive blank lines but keep separation.
  const lines: string[] = []
  for (const l of rawLines) {
    const prev = lines[lines.length - 1]
    if (!l.trim() && prev != null && !prev.trim()) continue
    lines.push(l)
  }

  const firstNonEmptyIdx = lines.findIndex((l) => l.trim().length > 0)
  const firstLine = firstNonEmptyIdx >= 0 ? lines[firstNonEmptyIdx].trim() : ''
  const firstName = extractLikelyName(firstLine)

  const doc: ResumeDoc = {
    name: firstName ?? undefined,
    contactLines: [],
    summaryLines: [],
    sections: [],
  }

  const startIdx = firstNonEmptyIdx >= 0 ? firstNonEmptyIdx + 1 : 0

  // Header parsing: collect name (if not already), contact-ish lines, and a short headline block
  // until the first section header.
  const firstSectionHeaderIdx = lines.findIndex((l, idx) => idx >= (firstNonEmptyIdx >= 0 ? firstNonEmptyIdx : 0) && isSectionHeader(l.trim()))

  const headerEndIdx = firstSectionHeaderIdx >= 0 ? firstSectionHeaderIdx : lines.length
  for (let i = firstNonEmptyIdx >= 0 ? firstNonEmptyIdx : 0; i < headerEndIdx; i++) {
    const l = (lines[i] ?? '').trim()
    if (!l) continue

    const extracted = extractLikelyName(l)
    if (!doc.name && extracted) {
      doc.name = extracted
      continue
    }

    if (isLikelyContactLine(l) || (doc.contactLines.length > 0 && doc.contactLines.length < 4)) {
      if (!doc.contactLines.includes(l)) doc.contactLines.push(l)
      continue
    }

    // Everything else in the header block is treated as a short headline/tagline (NOT a "Summary" section).
    if (doc.summaryLines.length < 4 && !doc.summaryLines.includes(l) && l !== doc.name) {
      doc.summaryLines.push(l)
    }
  }

  let i = startIdx
  let current: ResumeSection | null = null
  let paragraphBuf: string[] = []
  let bulletBuf: string[] = []
  let lastTextLine: string | null = null

  const flushBuffers = () => {
    if (!current) {
      bulletBuf = []
      paragraphBuf = []
      return
    }
    if (bulletBuf.length > 0) {
      pushBullets(current, bulletBuf)
      bulletBuf = []
    }
    if (paragraphBuf.length > 0) {
      pushParagraph(current, paragraphBuf)
      paragraphBuf = []
    }
  }

  for (; i < lines.length; i++) {
    const raw = lines[i] ?? ''
    const line = raw.trim()

    if (!line) {
      flushBuffers()
      lastTextLine = null
      continue
    }

    if (doc.name && line === doc.name) continue
    if (doc.contactLines.includes(line)) continue
    if (doc.summaryLines.includes(line) && (firstSectionHeaderIdx < 0 || i < firstSectionHeaderIdx)) continue

    if (isSectionHeader(line)) {
      flushBuffers()
      const title = line.replace(/[:\-–—]+$/, '').trim()
      current = ensureSection(doc.sections, title)
      continue
    }

    if (isBulletLine(raw)) {
      // Bullet belongs to the current section. If we were in paragraph mode, flush it first.
      if (!current) continue
      if (paragraphBuf.length > 0) {
        pushParagraph(current, paragraphBuf)
        paragraphBuf = []
      }
      bulletBuf.push(stripBulletPrefix(raw))
      lastTextLine = null
      continue
    }

    // If we were in bullets and now we're in normal text, flush bullets first.
    if (bulletBuf.length > 0) {
      if (!current) {
        bulletBuf = []
      } else {
      pushBullets(current, bulletBuf)
      bulletBuf = []
      }
    }

    // Ignore pre-section body text; we only start collecting structured blocks after first section header.
    if (!current) continue

    // Preserve resume-like line breaks by splitting standalone lines into their own paragraph blocks.
    if (looksLikeStandaloneLine(line)) {
      if (paragraphBuf.length > 0) {
        pushParagraph(current, paragraphBuf)
        paragraphBuf = []
      }
      pushParagraph(current, [line])
      lastTextLine = line
      continue
    }

    if (paragraphBuf.length === 0) {
      paragraphBuf.push(line)
      lastTextLine = line
      continue
    }

    const prev = lastTextLine ?? paragraphBuf[paragraphBuf.length - 1] ?? ''
    if (looksLikeSentenceContinuation(prev, line)) {
      paragraphBuf.push(line)
    } else {
      pushParagraph(current, paragraphBuf)
      paragraphBuf = [line]
    }
    lastTextLine = line
  }

  flushBuffers()

  // Basic cleanup: remove empty sections.
  doc.sections = doc.sections.filter((s) => s.blocks.length > 0)

  return doc
}

