// Single source of truth for social channels: one per-channel registry
// (CAPTION_CHANNELS) from which labels, caption limits and the publishable set
// are all derived — never written separately. Channel values are UPPERCASE enum
// members (see prisma/schema.prisma `enum Channel`). Older rows/inputs may still
// carry lowercase values (e.g. a draft's stored `brief.channels` predating the
// enum normalization) — the lookup helpers here tolerate any casing by
// normalizing to uppercase before lookup. Imports `Channel` as a type only, so
// this module stays client-safe.
import type { Channel } from '@prisma/client'

export type CaptionKey = 'instagram' | 'linkedin' | 'whatsapp'
export type CaptionTarget = Channel | 'HEADLINE'

export interface CaptionChannelSpec {
  channel: Channel
  label: string
  jsonKey: CaptionKey
  hardLimit: number | null
  softLimit: number | null
  publishable: boolean
  brief: string
  normalise: (text: string) => string
}

// Neither feed renders Markdown, so model output loses every `**`. Each pass
// shortens the string, so both loops terminate.
const stripDoubleAsterisks = (text: string): string => {
  let t = text
  while (t.includes('**')) t = t.replaceAll('**', '')
  return t
}

// WhatsApp bold is a single `*`, never `**`.
const whatsappBold = (text: string): string => {
  let t = text
  while (t.includes('**')) t = t.replaceAll('**', '*')
  return t
}

export const CAPTION_CHANNELS: readonly CaptionChannelSpec[] = [
  {
    channel: 'INSTAGRAM',
    label: 'Instagram',
    jsonKey: 'instagram',
    hardLimit: 2200,
    softLimit: null,
    publishable: true,
    brief: 'Hook in the first line. Hashtags only at the end. Plain text, no Markdown.',
    normalise: stripDoubleAsterisks,
  },
  {
    channel: 'LINKEDIN',
    label: 'LinkedIn',
    jsonKey: 'linkedin',
    hardLimit: 3000,
    softLimit: null,
    publishable: true,
    brief: 'Professional and longer-form. At most 3 hashtags, or none. Plain text, no Markdown.',
    normalise: stripDoubleAsterisks,
  },
  {
    channel: 'WHATSAPP',
    label: 'WhatsApp',
    jsonKey: 'whatsapp',
    hardLimit: null,
    softLimit: 1000,
    publishable: false,
    brief:
      'Short and direct. WhatsApp formatting only: `*bold*` and `_italic_`, never `**`. Put any link in the body.',
    normalise: whatsappBold,
  },
]

// Short human label used in the wizard, review step, cards, and history drawer.
export const CHANNEL_LABELS = Object.fromEntries(
  CAPTION_CHANNELS.map((s) => [s.channel, s.label])
) as Record<Channel, string>

// Per-channel hard caption character limit. Channels with only a soft guide
// (WhatsApp) have no entry.
export const CHANNEL_CAPTION_LIMITS: Partial<Record<Channel, number>> = Object.fromEntries(
  CAPTION_CHANNELS.flatMap((s) => (s.hardLimit === null ? [] : [[s.channel, s.hardLimit]]))
)

// Channels that have a publisher. Inputs (briefs, queue, posts, team channels,
// MCP/ACP) accept only these.
export const PUBLISHABLE_CHANNELS: Channel[] = CAPTION_CHANNELS.filter((s) => s.publishable).map(
  (s) => s.channel
)

// Kept name: every channel picker and default reads this, so pickers stay at
// the publishable channels.
export const CHANNEL_VALUES = PUBLISHABLE_CHANNELS

export function captionSpec(channel: Channel): CaptionChannelSpec {
  const spec = CAPTION_CHANNELS.find((s) => s.channel === channel)
  if (!spec) throw new Error(`No caption registry entry for channel ${channel}`)
  return spec
}

// Exact (uppercase) match only, so the type guard never lies: callers that
// tolerate legacy casing uppercase first.
export function isPublishableChannel(v: unknown): v is Channel {
  return typeof v === 'string' && PUBLISHABLE_CHANNELS.includes(v as Channel)
}

// UTF-16 code units — the one count the counter, extractor and resolver share.
export const captionLength = (t: string) => t.length

// Normalizes any-case input before lookup; falls back to the raw string for
// unrecognized values so unexpected data still renders instead of throwing.
export function channelLabel(value: string): string {
  const normalized = value.toUpperCase() as Channel
  return CHANNEL_LABELS[normalized] ?? value
}

// Last consumer is CopyEditor; removed with it (012 T6).
export function channelCopyLimit(value: string): number | undefined {
  const normalized = value.toUpperCase() as Channel
  return CHANNEL_CAPTION_LIMITS[normalized]
}
