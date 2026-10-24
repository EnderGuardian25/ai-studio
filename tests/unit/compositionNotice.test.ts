// 009 FR-15 / AC-19: the notice is a pure function of the stamp.

import { describe, it, expect } from 'vitest'
import { compositionNoticeFor } from '@/lib/drafts/compositionNotice'
import { FALLBACK_REASONS, parseCompositionStamp, type CompositionStamp } from '@/lib/designData'

const fallback = (reason: (typeof FALLBACK_REASONS)[number], requested = 'product-showcase'): CompositionStamp => {
  const stamp = parseCompositionStamp({
    requestedArchetype: requested,
    appliedArchetype: 'classic',
    contractVersion: null,
    fallbackReason: reason,
    imageQuality: 'default',
  })
  if (!stamp) throw new Error(`fixture invalid for ${reason}`)
  return stamp
}

describe('compositionNoticeFor', () => {
  it('a null stamp has no notice', () => {
    expect(compositionNoticeFor(null)).toBeNull()
  })

  it('a classic request with no reason has no notice', () => {
    const classic = parseCompositionStamp({
      requestedArchetype: 'classic',
      appliedArchetype: 'classic',
      contractVersion: null,
      imageQuality: 'default',
    })
    expect(compositionNoticeFor(classic)).toBeNull()
  })

  it('a kept archetype has no notice', () => {
    const kept = parseCompositionStamp({
      requestedArchetype: 'editorial-split',
      appliedArchetype: 'editorial-split',
      contractVersion: 1,
      imageQuality: 'default',
    })
    expect(compositionNoticeFor(kept)).toBeNull()
  })

  it('every fallback reason has its own plain message, tagged with the reason', () => {
    const messages = new Set<string>()
    for (const reason of FALLBACK_REASONS) {
      const n = compositionNoticeFor(fallback(reason))
      expect(n, reason).not.toBeNull()
      expect(n!.reason).toBe(reason)
      expect(n!.message.length).toBeGreaterThan(20)
      messages.add(n!.message)
    }
    expect(messages.size).toBe(FALLBACK_REASONS.length)
  })

  it('names the style by its label, and says the classic style was used', () => {
    expect(compositionNoticeFor(fallback('busy', 'editorial-split'))!.message).toBe(
      'Editorial split could not be used for this post (the image was too busy where the text goes), so the classic style was used.',
    )
    expect(compositionNoticeFor(fallback('contrast'))!.message).toContain('Product showcase')
    expect(compositionNoticeFor(fallback('no-image'))!.message).toBe(
      'Product showcase needs an image and none was made, so the classic style was used.',
    )
    expect(compositionNoticeFor(fallback('unsupported-size'))!.message).toBe(
      'Product showcase is not available for the 9:16 size, so the classic style was used.',
    )
    expect(compositionNoticeFor(fallback('refine-replaced-image'))!.message).toBe(
      'The new background replaced the Product showcase image, so the classic style now applies.',
    )
  })

  it('a retired or unknown key reads "that image style", capitalised at the start of a sentence', () => {
    expect(compositionNoticeFor(fallback('unknown-archetype', 'gone'))!.message).toBe(
      'That image style is no longer available, so the classic style was used.',
    )
    expect(compositionNoticeFor(fallback('busy', 'gone'))!.message.startsWith('That image style could not be used')).toBe(true)
    expect(compositionNoticeFor(fallback('refine-replaced-image', 'gone'))!.message).toBe(
      'The new background replaced the image, so the classic style now applies.',
    )
  })

  it('a kept Spotlight or Full-bleed stamp with layout-violation names the look (028)', () => {
    for (const [key, label] of [['spotlight', 'Spotlight'], ['full-bleed-scene', 'Full-bleed scene']] as const) {
      const stamp = parseCompositionStamp({
        requestedArchetype: key,
        appliedArchetype: key,
        contractVersion: 1,
        observations: ['layout-violation'],
        imageQuality: 'default',
      })
      expect(compositionNoticeFor(stamp)!.message).toBe(
        `Some text or the logo sits outside the area ${label} reserves for it. The post is unchanged; check it before publishing.`,
      )
      expect(compositionNoticeFor(fallback('busy', key))!.message.startsWith(label)).toBe(true)
    }
  })

  it('a kept archetype with the layout-violation observation says so, and that the post is unchanged', () => {
    const stamp = parseCompositionStamp({
      requestedArchetype: 'product-showcase',
      appliedArchetype: 'product-showcase',
      contractVersion: 1,
      observations: ['layout-violation'],
      imageQuality: 'default',
    })
    const n = compositionNoticeFor(stamp)!
    expect(n.reason).toBe('layout-violation')
    expect(n.message).toBe(
      'Some text or the logo sits outside the area Product showcase reserves for it. The post is unchanged; check it before publishing.',
    )
  })
})
