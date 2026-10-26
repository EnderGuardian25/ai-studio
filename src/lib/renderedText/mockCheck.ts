// The text stand-in for the headline check under MOCK_PUPPETEER (030 FR-10,
// design 3.3). It sees text, not CSS, so only the sentinel yields `not-visible`
// (known limit L4). Pure.
import { normaliseHeadline } from './normalise'
import type { HeadlineCheck } from './vocab'

export const MOCK_HEADLINE_HIDDEN = '__MOCK_HEADLINE_HIDDEN__'

// `&amp;` goes last so "&amp;lt;" decodes once, to "&lt;".
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

// Whole-text occurrences: bounded by a string end or a space on both sides.
function countWhole(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) return count
    const end = at + needle.length
    const before = at === 0 || haystack[at - 1] === ' '
    const after = end === haystack.length || haystack[end] === ' '
    if (before && after) count++
    from = end
  }
}

export function mockHeadlineCheck(html: string, headline: string): HeadlineCheck {
  if (html.includes(MOCK_HEADLINE_HIDDEN)) return 'not-visible'
  const text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<head\b[\s\S]*?<\/head\s*>/gi, ' ')
    .replace(/<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
  const count = countWhole(normaliseHeadline(decodeEntities(text)), normaliseHeadline(headline))
  if (count === 0) return 'not-found'
  return count === 1 ? 'painted' : 'ambiguous'
}
