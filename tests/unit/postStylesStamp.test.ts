// 027 FR-05 / AC-04 (schema half): the stamp schema, the tolerant parse and rulesAtStamp.
import { describe, it, expect } from 'vitest'
import {
  postStyleStampSchema,
  parsePostStyleStamp,
  stampFor,
  rulesAtStamp,
  POST_STYLES_REVISION,
} from '@/lib/postStyles'
import { styles } from '@/lib/postStyles/styles'
import type { PostStyle } from '@/lib/postStyles/types'

describe('postStyleStampSchema', () => {
  it('accepts a well-formed stamp', () => {
    expect(postStyleStampSchema.safeParse({ key: 'tip', version: 1, revision: 8 }).success).toBe(
      true,
    )
  })

  it('rejects bad shapes', () => {
    for (const bad of [
      { key: '', version: 1, revision: 1 },
      { key: 'x'.repeat(41), version: 1, revision: 1 },
      { key: 'tip', version: 0, revision: 1 },
      { key: 'tip', version: 1.5, revision: 1 },
      { key: 'tip', version: 1, revision: 0 },
      { key: 'tip', version: 1 },
      { key: 'tip', version: 1, revision: 1, extra: true },
      { key: 7, version: 1, revision: 1 },
    ])
      expect(postStyleStampSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
  })
})

describe('parsePostStyleStamp', () => {
  it('returns the stamp for a valid value and null for anything unreadable, never throwing', () => {
    expect(parsePostStyleStamp({ key: 'tip', version: 1, revision: 8 })).toEqual({
      key: 'tip',
      version: 1,
      revision: 8,
    })
    for (const bad of [
      null,
      undefined,
      'x',
      5,
      [],
      {},
      { key: 'tip' },
      { key: 'tip', version: 'a' },
    ])
      expect(parsePostStyleStamp(bad)).toBeNull()
  })
})

describe('stampFor', () => {
  it('defaults revision to POST_STYLES_REVISION and validates', () => {
    expect(stampFor('event', 1)).toEqual({
      key: 'event',
      version: 1,
      revision: POST_STYLES_REVISION,
    })
    expect(stampFor('event', 2, 12).revision).toBe(12)
    expect(() => stampFor('', 1)).toThrow()
    expect(() => stampFor('event', 0)).toThrow()
  })
})

describe('rulesAtStamp', () => {
  it('returns the checklist of the stamped version, filtered by scope', () => {
    const stamp = stampFor('general', 1)
    const all = styles.general.versions[1].checklist
    expect(rulesAtStamp(stamp)).toEqual(all)
    expect(rulesAtStamp(stamp, 'image')).toEqual(all.filter((r) => r.scope === 'image'))
    expect(rulesAtStamp(stamp, 'caption')).toEqual(all.filter((r) => r.scope === 'caption'))
    expect(rulesAtStamp(stamp, 'image')!.length).toBeGreaterThan(0)
  })

  it('returns null for a null or unreadable stamp, an unknown key and an unknown version', () => {
    expect(rulesAtStamp(null)).toBeNull()
    expect(rulesAtStamp({ junk: 1 })).toBeNull()
    expect(rulesAtStamp({ key: 'nope', version: 1, revision: 1 })).toBeNull()
    expect(rulesAtStamp({ key: 'general', version: 7, revision: 1 })).toBeNull()
    expect(rulesAtStamp({ key: 'constructor', version: 1, revision: 1 })).toBeNull()
  })

  it('an old version still resolves after the style gains a new one (versions are immutable)', () => {
    const v1 = styles.tip.versions[1]
    const grown: Record<string, PostStyle> = {
      ...styles,
      tip: {
        ...styles.tip,
        current: 2,
        versions: { 1: v1, 2: { ...v1, checklist: v1.checklist.slice(0, 1) } },
      },
    }
    expect(rulesAtStamp(stampFor('tip', 1), undefined, grown)).toEqual(v1.checklist)
    expect(rulesAtStamp(stampFor('tip', 2), undefined, grown)).toHaveLength(1)
  })
})
