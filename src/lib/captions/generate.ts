// The caption call (012 FR-07/FR-08/FR-10, design §3): one provider call for
// the requested targets, then the pure extractor. Every writer — the async and
// sync generation, regenerate-copy and generate/copy — goes through
// writeCaptions, so the logging and the whole-reply failure mapping live once.
//
// The provider returns the RAW reply and never parses it; extractCaptionReply
// decides what is usable, field by field. A provider error (auth, timeout,
// network) is not a reply and propagates to the caller unchanged.

import type { BriefInput, CopyProvider } from '@/providers/interfaces/CopyProvider'
import { CAPTION_CHANNELS, type CaptionTarget } from '@/lib/channels'
import { extractCaptionReply, type FieldResult } from '@/lib/captions/extract'
import { CAPTION_PROMPT_VERSION } from '@/lib/agent/prompts/caption'

export type CaptionFields = Partial<Record<CaptionTarget, FieldResult>>

// What a generation asks for: the headline and every registry channel (A5).
export const GENERATION_TARGETS: readonly CaptionTarget[] = [
  'HEADLINE',
  ...CAPTION_CHANNELS.map((s) => s.channel),
]

// How much discarded model text a log line carries.
const DISCARDED_LOG_MAX = 500

export async function writeCaptions(
  provider: CopyProvider,
  brief: BriefInput,
  targets: readonly CaptionTarget[],
): Promise<CaptionFields> {
  console.info(`[captions] caption call (prompt ${CAPTION_PROMPT_VERSION}) for ${targets.join(', ')}`)
  const raw = await provider.generateCaptions(brief, targets)
  const result = extractCaptionReply(raw, targets)

  // JSON-quoted so a newline in model text can't forge a log line.
  if (result.discarded) {
    console.warn(`[captions] discarded reply text: ${JSON.stringify(result.discarded.slice(0, DISCARDED_LOG_MAX))}`)
  }
  if (result.ok) return result.fields

  // A whole-reply failure fails every target, so callers handle one shape.
  console.warn(`[captions] reply rejected (${result.reason})`)
  return Object.fromEntries(targets.map((t) => [t, { ok: false, reason: result.reason }]))
}

// A new generation never designs on nothing (A6): no valid headline fails the
// draft. The message is the user-facing FR-09 sentence, so
// humanizeGenerationError passes it through as the draft's failureReason.
export class HeadlineMissingError extends Error {
  constructor(public reason: string) {
    super(`The caption reply had no usable headline (${reason}). Retry to generate again.`)
    this.name = 'HeadlineMissingError'
  }
}

export function requireHeadline(fields: CaptionFields): string {
  const headline = fields.HEADLINE
  if (headline?.ok) return headline.text
  throw new HeadlineMissingError(headline?.reason ?? 'missing')
}
