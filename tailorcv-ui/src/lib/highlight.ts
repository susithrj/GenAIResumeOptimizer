/**
 * Escape text for safe HTML, then wrap keyword matches in .kw-highlight spans.
 * Longest keywords first to reduce nested/partial matches.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildHighlightedHtml(
  plainText: string,
  keywordWords: string[],
): string {
  const escaped = escapeHtml(plainText)
  const unique = [...new Set(keywordWords.map((w) => w.trim()).filter(Boolean))]
  unique.sort((a, b) => b.length - a.length)

  let result = escaped
  for (const w of unique) {
    const re = new RegExp(escapeRegExp(w), 'gi')
    result = result.replace(re, (m) => `<span class="kw-highlight">${m}</span>`)
  }
  return result
}
