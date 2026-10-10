// Plans how one legacy caption (the pre-012 single `copyText` string) becomes
// per-channel caption rows (012 FR-05). The loader and the boot backfill own
// the writes; everything that decides WHAT to write lives here so it can be
// unit-tested without a database (same split as drafts/recovery.ts).
//
// The rule is conservative on purpose: a legacy caption is split only when its
// channel headers are unambiguous. Anything else falls back to what a pre-012
// publish would have sent — the whole text to Instagram and LinkedIn — and is
// flagged for review. The legacy text itself is never touched, so a better
// planner can re-plan later.
//
// Pure — no I/O. Imports the registry and the `Channel` type only.

import type { Channel } from '@prisma/client'
import { CAPTION_CHANNELS, captionSpec } from '@/lib/channels'

// Mirrors the `CaptionMigration` enum (FR-03) without importing Prisma values.
export type CaptionMigrationOutcome = 'SPLIT' | 'UNSPLIT_FALLBACK' | 'EMPTY'

export interface PlannedCaptionRow {
  channel: Channel
  text: string
  status: 'READY'
  needsReview: boolean
}

export interface CaptionMigrationPlan {
  outcome: CaptionMigrationOutcome
  /** One row per registry channel, in registry order. */
  rows: PlannedCaptionRow[]
}

// The channels a pre-012 publish sent the combined caption to. A split needs
// exactly one header for each; the fallback gives each the whole text.
const LEGACY_CHANNELS: readonly Channel[] = ['INSTAGRAM', 'LINKEDIN']

// The names a header may use per channel (regex source, matched
// case-insensitively). Typed over every Channel so a new enum value cannot be
// forgotten here.
const HEADER_NAMES: Record<Channel, readonly string[]> = {
  INSTAGRAM: ['instagram', 'ig'],
  LINKEDIN: ['linked ?in'],
  WHATSAPP: ['whatsapp'],
}

const NAME_TO_CHANNEL: ReadonlyArray<{ re: RegExp; channel: Channel }> = (
  Object.entries(HEADER_NAMES) as [Channel, readonly string[]][]
).flatMap(([channel, names]) => names.map((n) => ({ re: new RegExp(`^(?:${n})$`, 'i'), channel })))

// A header line: optional Markdown heading (`#`–`######` and a space, so a
// `#instagram` hashtag line is never a header), an optional `**`/`__` wrapper
// that must close with the same token, the channel name, an optional
// `caption`/`post`/`copy`, and an optional colon inside or outside the wrapper.
//
// Text may follow on the same line only after a colon: "Instagram is where…"
// is a sentence, not a header, and "ig: hi" is a header with a body.
const ALL_NAMES = Object.values(HEADER_NAMES).flat().join('|')
const HEADER_RE = new RegExp(
  `^[ \\t]*(?:#{1,6}[ \\t]+)?(\\*\\*|__)?[ \\t]*(${ALL_NAMES})(?:[ \\t]+(?:caption|post|copy))?[ \\t]*(:)?[ \\t]*\\1[ \\t]*(:)?(.*)$`,
  'i',
)

interface Header {
  channel: Channel
  line: number
  /** Text after the header's colon on the same line. */
  rest: string
}

function parseHeader(line: string, index: number): Header | null {
  const m = HEADER_RE.exec(line)
  if (!m) return null
  const [, , name, innerColon, outerColon, rest] = m
  if (!innerColon && !outerColon && rest.trim()) return null
  const channel = NAME_TO_CHANNEL.find((n) => n.re.test(name))!.channel
  return { channel, line: index, rest }
}

function rowsFrom(
  texts: Partial<Record<Channel, string>>,
  needsReview: (channel: Channel) => boolean,
): PlannedCaptionRow[] {
  return CAPTION_CHANNELS.map(({ channel }) => ({
    channel,
    text: texts[channel] ?? '',
    status: 'READY' as const,
    needsReview: needsReview(channel),
  }))
}

// The split sections, or null when the text does not meet every SPLIT
// condition: exactly one header per legacy channel, at most one for any other,
// nothing but whitespace before the first header, and no empty section.
function splitSections(legacyText: string): Partial<Record<Channel, string>> | null {
  const lines = legacyText.replaceAll('\r\n', '\n').split('\n')
  const headers = lines.flatMap((line, i) => parseHeader(line, i) ?? [])
  if (headers.length === 0) return null

  for (const { channel } of CAPTION_CHANNELS) {
    const n = headers.filter((h) => h.channel === channel).length
    if (LEGACY_CHANNELS.includes(channel) ? n !== 1 : n > 1) return null
  }
  if (lines.slice(0, headers[0].line).join('\n').trim()) return null

  const sections: Partial<Record<Channel, string>> = {}
  for (const [i, h] of headers.entries()) {
    const end = headers[i + 1]?.line ?? lines.length
    const body = [h.rest, ...lines.slice(h.line + 1, end)].join('\n')
    // Normalise first, then trim: a section of only `**` must count as empty.
    const text = captionSpec(h.channel).normalise(body).trim()
    if (!text) return null
    sections[h.channel] = text
  }
  return sections
}

export function planCaptionMigration(legacyText: string): CaptionMigrationPlan {
  if (!legacyText.trim()) return { outcome: 'EMPTY', rows: rowsFrom({}, () => false) }

  const sections = splitSections(legacyText)
  if (sections) return { outcome: 'SPLIT', rows: rowsFrom(sections, () => false) }

  // Verbatim apart from the ends: no `**` is stripped from text a person may
  // have written that way.
  const text = legacyText.trim()
  const fallback = Object.fromEntries(LEGACY_CHANNELS.map((c) => [c, text]))
  return {
    outcome: 'UNSPLIT_FALLBACK',
    rows: rowsFrom(fallback, (c) => LEGACY_CHANNELS.includes(c)),
  }
}
