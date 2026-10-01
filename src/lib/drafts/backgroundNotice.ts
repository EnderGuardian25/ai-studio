// The skipped-AI-background outcome (005 FR-06/FR-07), as data: what the
// background step returns, what each draft writer stores, and the fixed
// notice text the draft poll sends. Pure — no I/O, safe to import anywhere.
//
// The skip is stored on two nullable Draft columns, backgroundSkipReason and
// backgroundSkipDetail. Plain TEXT, not an enum: the allowed values are
// enforced here. NOT_NEEDED is never stored, because a model choosing a
// CSS/SVG design is a design decision, not a failure (design Key decision 4).

export const BACKGROUND_SKIP_REASONS = ['NO_PROVIDER', 'PROVIDER_ERROR', 'DECISION_ERROR', 'NOT_NEEDED'] as const
export type BackgroundSkipReason = (typeof BACKGROUND_SKIP_REASONS)[number]

// What background.ts returns. The step never throws: every way it can end
// is one of these.
export type BackgroundResult =
  | { url: string }
  | { url: null; skip: BackgroundSkipReason; detail?: string }

// The reasons that show a notice.
export type BackgroundNoticeReason = Exclude<BackgroundSkipReason, 'NOT_NEEDED'>

// GET /api/drafts/[id] → backgroundSkipped.
export interface BackgroundSkipped {
  reason: BackgroundNoticeReason
  message: string
}

export const SKIP_DETAIL_MAX = 300

export function clipSkipDetail(detail: string): string {
  return detail.length > SKIP_DETAIL_MAX ? detail.slice(0, SKIP_DETAIL_MAX) : detail
}

// The draft columns, as a write fragment.
export interface BackgroundSkipFields {
  backgroundSkipReason: BackgroundNoticeReason | null
  backgroundSkipDetail: string | null
}

export const BACKGROUND_SKIP_CLEARED: BackgroundSkipFields = {
  backgroundSkipReason: null,
  backgroundSkipDetail: null,
}

function storedSkip(reason: BackgroundNoticeReason, detail?: string): BackgroundSkipFields {
  return { backgroundSkipReason: reason, backgroundSkipDetail: detail ? clipSkipDetail(detail) : null }
}

// Generation, regenerate-design and Path A: the design was made from scratch,
// so the fields always describe THIS render. A produced or NOT_NEEDED
// background clears them; null (Path A, which has no background step) too.
export function generationSkipFields(result: BackgroundResult | null): BackgroundSkipFields {
  if (!result || result.url !== null || result.skip === 'NOT_NEEDED') return BACKGROUND_SKIP_CLEARED
  return storedSkip(result.skip, result.detail)
}

// Refine: its decision is instruction-gated, so it only speaks to the
// background when the instruction asked for one. Produced → clear; wanted one
// and failed (NO_PROVIDER / PROVIDER_ERROR) → set; anything else (did not
// want one, or the decision itself failed so we don't know) → undefined,
// meaning leave the fields as they are — the same way refine treats imageUrl.
export function refineSkipFields(result: BackgroundResult): BackgroundSkipFields | undefined {
  if (result.url !== null) return BACKGROUND_SKIP_CLEARED
  if (result.skip === 'NO_PROVIDER' || result.skip === 'PROVIDER_ERROR') return storedSkip(result.skip, result.detail)
  return undefined
}

// Provider safety/moderation refusals (OpenAI "moderation_blocked" / "safety
// system", Gemini SAFETY blocks). The notice says the request was refused
// rather than echoing the provider's wording, which reads like a key problem.
const MODERATION_RE = /moderation|safety|content[ _-]?policy|refused|blocked/i

function providerErrorMessage(detail: string | null): string {
  const clipped = detail?.trim() ? clipSkipDetail(detail.trim()) : null
  const why = clipped ? (MODERATION_RE.test(clipped) ? 'the image request was refused' : clipped) : null
  return why
    ? `The image provider couldn't create a background (${why}). The post was designed without one.`
    : "The image provider couldn't create a background. The post was designed without one."
}

const FIXED_MESSAGES: Record<Exclude<BackgroundNoticeReason, 'PROVIDER_ERROR'>, string> = {
  NO_PROVIDER:
    'No AI background was added because no image provider is set up. Add an OpenAI key in Settings, or ask a team admin to add an image provider in Team settings.',
  DECISION_ERROR: 'The background step failed, so the post was designed without an AI image.',
}

// The stored columns → the poll payload. Provider text appears at most as the
// clipped detail inside the PROVIDER_ERROR sentence; every other message is
// fixed. An unknown stored value (or NOT_NEEDED) shows nothing.
export function backgroundSkippedFor(reason: string | null, detail: string | null): BackgroundSkipped | null {
  switch (reason) {
    case 'NO_PROVIDER':
    case 'DECISION_ERROR':
      return { reason, message: FIXED_MESSAGES[reason] }
    case 'PROVIDER_ERROR':
      return { reason, message: providerErrorMessage(detail) }
    default:
      return null
  }
}
