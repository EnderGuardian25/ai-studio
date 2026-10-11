// 012 T6 — the caption request bodies (FR-11, FR-12): the PATCH union and the
// regenerate-copy body, with their 400 messages.

import { describe, it, expect } from 'vitest'
import {
  CAPTION_TEXT_MAX,
  CHANNEL_MESSAGE,
  PATCH_SHAPE_MESSAGE,
  REGENERATE_BOTH_MESSAGE,
  REGENERATE_SHAPE_MESSAGE,
  parseCaptionPatch,
  parseRegenerateBody,
} from '@/lib/captions/requests'

describe('parseCaptionPatch (FR-12)', () => {
  it('accepts { channel, text } for every registry channel, WhatsApp included, text as typed', () => {
    for (const channel of ['INSTAGRAM', 'LINKEDIN', 'WHATSAPP'] as const) {
      expect(parseCaptionPatch({ channel, text: '  **kept** ' })).toEqual({
        ok: true,
        value: { channel, text: '  **kept** ' },
      })
    }
    expect(parseCaptionPatch({ channel: 'INSTAGRAM', text: '' })).toEqual({
      ok: true,
      value: { channel: 'INSTAGRAM', text: '' },
    })
  })

  it('accepts { headline } (validated later by validateHeadline)', () => {
    expect(parseCaptionPatch({ headline: 'Applications are open' })).toEqual({
      ok: true,
      value: { headline: 'Applications are open' },
    })
  })

  it('caps text at 10,000 characters; over a channel hard limit is allowed', () => {
    expect(parseCaptionPatch({ channel: 'INSTAGRAM', text: 'x'.repeat(CAPTION_TEXT_MAX) }).ok).toBe(true)
    expect(parseCaptionPatch({ channel: 'INSTAGRAM', text: 'x'.repeat(CAPTION_TEXT_MAX + 1) })).toEqual({
      ok: false,
      error: 'text must be at most 10,000 characters',
    })
  })

  it('a legacy { copyText } body → "Send { channel, text } or { headline }"', () => {
    expect(parseCaptionPatch({ copyText: 'old' })).toEqual({ ok: false, error: PATCH_SHAPE_MESSAGE })
    expect(PATCH_SHAPE_MESSAGE).toBe('Send { channel, text } or { headline }')
  })

  it.each([
    ['empty object', {}],
    ['channel without text', { channel: 'INSTAGRAM' }],
    ['text without channel', { text: 'x' }],
    ['both forms', { channel: 'INSTAGRAM', text: 'x', headline: 'h' }],
    ['null', null],
    ['an array', [1]],
    ['a string', 'text'],
  ])('the wrong shape (%s) → the shape message', (_name, body) => {
    expect(parseCaptionPatch(body)).toEqual({ ok: false, error: PATCH_SHAPE_MESSAGE })
  })

  it('an unknown channel names the registry channels', () => {
    expect(parseCaptionPatch({ channel: 'TIKTOK', text: 'x' })).toEqual({ ok: false, error: CHANNEL_MESSAGE })
    expect(CHANNEL_MESSAGE).toBe('channel must be INSTAGRAM, LINKEDIN or WHATSAPP')
  })

  it('non-string values get their own message', () => {
    expect(parseCaptionPatch({ channel: 'INSTAGRAM', text: 5 })).toEqual({ ok: false, error: 'text must be a string' })
    expect(parseCaptionPatch({ headline: 5 })).toEqual({ ok: false, error: 'headline must be a string' })
  })
})

describe('parseRegenerateBody (FR-11)', () => {
  it('{} → "Regenerate all": the three captions, never the headline (A9)', () => {
    expect(parseRegenerateBody({})).toEqual({ ok: true, value: ['INSTAGRAM', 'LINKEDIN', 'WHATSAPP'] })
  })

  it('{ channel } → that caption only', () => {
    expect(parseRegenerateBody({ channel: 'WHATSAPP' })).toEqual({ ok: true, value: ['WHATSAPP'] })
  })

  it('{ headline: true } → the headline only', () => {
    expect(parseRegenerateBody({ headline: true })).toEqual({ ok: true, value: ['HEADLINE'] })
  })

  it('both channel and headline → 400', () => {
    expect(parseRegenerateBody({ channel: 'LINKEDIN', headline: true })).toEqual({
      ok: false,
      error: REGENERATE_BOTH_MESSAGE,
    })
  })

  it('an unknown channel → 400 naming the channels', () => {
    expect(parseRegenerateBody({ channel: 'TIKTOK' })).toEqual({ ok: false, error: CHANNEL_MESSAGE })
  })

  it('headline other than true, an unknown key, or a non-object → 400', () => {
    expect(parseRegenerateBody({ headline: false })).toEqual({ ok: false, error: 'headline must be true' })
    expect(parseRegenerateBody({ copy: true })).toEqual({ ok: false, error: REGENERATE_SHAPE_MESSAGE })
    expect(parseRegenerateBody(null)).toEqual({ ok: false, error: REGENERATE_SHAPE_MESSAGE })
  })
})
