// The caption request bodies (012 FR-11, FR-12): what PATCH /api/drafts/[id]
// and POST /api/drafts/[id]/regenerate-copy accept, with their 400 messages.
// Pure, and outside the route files because a Next route module may export
// only its handlers.

import { z } from 'zod'
import type { Channel } from '@prisma/client'
import { CAPTION_CHANNELS, type CaptionTarget } from '@/lib/channels'

// A caption the user types is stored as typed, up to this length. Over a
// channel's hard limit is allowed (the counter shows it; publish refuses it).
export const CAPTION_TEXT_MAX = 10_000

const CHANNELS = CAPTION_CHANNELS.map((s) => s.channel) as [Channel, ...Channel[]]

const orList = (values: readonly string[]) =>
  values.length > 1 ? `${values.slice(0, -1).join(', ')} or ${values[values.length - 1]}` : values[0]

export const CHANNEL_MESSAGE = `channel must be ${orList(CHANNELS)}`
export const PATCH_SHAPE_MESSAGE = 'Send { channel, text } or { headline }'
export const REGENERATE_SHAPE_MESSAGE = 'Send {}, { channel } or { headline: true }'
export const REGENERATE_BOTH_MESSAGE = 'Send { channel } or { headline: true }, not both'

const channelSchema = z.enum(CHANNELS, { errorMap: () => ({ message: CHANNEL_MESSAGE }) })

// A non-object body (null, an array, a string) reads as the wrong shape.
const shapeErrorMap =
  (message: string): z.ZodErrorMap =>
  (issue, ctx) =>
    issue.code === 'invalid_type' ? { message } : { message: ctx.defaultError }

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

function firstIssue<T>(parsed: z.SafeParseReturnType<unknown, T>): ParseResult<T> {
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: parsed.error.issues[0].message }
}

// ── PATCH /api/drafts/[id] ──────────────────────────────────────────────────

export type CaptionPatch = { channel: Channel; text: string } | { headline: string }

const patchSchema = z
  .object(
    {
      channel: channelSchema.optional(),
      text: z
        .string({ errorMap: () => ({ message: 'text must be a string' }) })
        .max(CAPTION_TEXT_MAX, `text must be at most ${CAPTION_TEXT_MAX.toLocaleString('en-US')} characters`)
        .optional(),
      headline: z.string({ errorMap: () => ({ message: 'headline must be a string' }) }).optional(),
    },
    { errorMap: shapeErrorMap(PATCH_SHAPE_MESSAGE) },
  )
  .strict(PATCH_SHAPE_MESSAGE)
  .transform((b, ctx): CaptionPatch => {
    if (b.headline !== undefined && b.channel === undefined && b.text === undefined) {
      return { headline: b.headline }
    }
    if (b.headline === undefined && b.channel !== undefined && b.text !== undefined) {
      return { channel: b.channel, text: b.text }
    }
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: PATCH_SHAPE_MESSAGE })
    return z.NEVER
  })

// Exactly one of { channel, text } or { headline }. A legacy { copyText } body
// is the wrong shape.
export function parseCaptionPatch(raw: unknown): ParseResult<CaptionPatch> {
  return firstIssue(patchSchema.safeParse(raw))
}

// ── POST /api/drafts/[id]/regenerate-copy ───────────────────────────────────

const regenerateSchema = z
  .object(
    {
      channel: channelSchema.optional(),
      headline: z.literal(true, { errorMap: () => ({ message: 'headline must be true' }) }).optional(),
    },
    { errorMap: shapeErrorMap(REGENERATE_SHAPE_MESSAGE) },
  )
  .strict(REGENERATE_SHAPE_MESSAGE)
  .transform((b, ctx): CaptionTarget[] => {
    if (b.channel !== undefined && b.headline !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: REGENERATE_BOTH_MESSAGE })
      return z.NEVER
    }
    if (b.headline) return ['HEADLINE']
    if (b.channel !== undefined) return [b.channel]
    return [...CHANNELS] // "Regenerate all" is the captions, never the headline (A9)
  })

// {} → the three captions; { channel } → that caption; { headline: true } →
// the headline. Returns the action's targets.
export function parseRegenerateBody(raw: unknown): ParseResult<CaptionTarget[]> {
  return firstIssue(regenerateSchema.safeParse(raw))
}
