import { describe, it, expect } from 'vitest'
import {
  compositionStampSchema,
  parseCompositionStamp,
  classicStamp,
  refineReplacedStamp,
  FALLBACK_REASONS,
  OBSERVATIONS,
  IMAGE_QUALITIES,
  type CompositionStamp,
} from '@/lib/designData'

const kept: CompositionStamp = {
  requestedArchetype: 'product-showcase',
  appliedArchetype: 'product-showcase',
  contractVersion: 1,
  imageQuality: 'high',
}

describe('vocabularies', () => {
  it('are the documented lists', () => {
    expect([...FALLBACK_REASONS]).toEqual([
      'busy',
      'contrast',
      'region-invalid',
      'check-error',
      'no-image',
      'unknown-archetype',
      'unsupported-size',
      'refine-replaced-image',
    ])
    expect([...OBSERVATIONS]).toEqual(['layout-violation'])
    expect([...IMAGE_QUALITIES]).toEqual(['default', 'standard', 'high'])
  })
})

describe('compositionStampSchema accepts every documented shape (AC-15)', () => {
  it('kept, kept with an observation, classic, and every fallback', () => {
    expect(compositionStampSchema.parse(kept)).toEqual(kept)
    const observed = { ...kept, observations: ['layout-violation' as const] }
    expect(compositionStampSchema.parse(observed)).toEqual(observed)
    expect(compositionStampSchema.safeParse(classicStamp()).success).toBe(true)
    for (const fallbackReason of FALLBACK_REASONS) {
      const s = {
        requestedArchetype: 'editorial-split',
        appliedArchetype: 'classic',
        contractVersion: null,
        fallbackReason,
        imageQuality: 'default',
      }
      expect(compositionStampSchema.safeParse(s).success, fallbackReason).toBe(true)
    }
  })
})

describe('compositionStampSchema rejects invariant violations', () => {
  const bad = (s: unknown) => expect(compositionStampSchema.safeParse(s).success).toBe(false)

  it('non-classic applied: needs a contractVersion', () => bad({ ...kept, contractVersion: null }))
  it('non-classic applied: no fallbackReason', () => bad({ ...kept, fallbackReason: 'busy' }))
  it('non-classic applied: requested must equal applied', () => bad({ ...kept, requestedArchetype: 'editorial-split' }))
  it('classic applied: contractVersion must be null', () =>
    bad({ requestedArchetype: 'classic', appliedArchetype: 'classic', contractVersion: 1, imageQuality: 'default' }))
  it('classic applied: no observations', () =>
    bad({ ...classicStamp(), observations: ['layout-violation'] }))
  it('classic request and classic applied: no fallbackReason', () =>
    bad({ ...classicStamp(), fallbackReason: 'busy' }))
  it('an unknown reason, observation or quality', () => {
    bad({ ...classicStamp(), requestedArchetype: 'x', fallbackReason: 'nope' })
    bad({ ...kept, observations: ['elsewhere'] })
    bad({ ...kept, imageQuality: 'ultra' })
  })
  it('a missing or non-integer contractVersion, an empty key, a non-object', () => {
    bad({ ...kept, contractVersion: undefined })
    bad({ ...kept, contractVersion: 1.5 })
    bad({ ...kept, contractVersion: 0 })
    bad({ ...kept, requestedArchetype: '', appliedArchetype: '' })
    bad('x')
    bad(null)
  })
  it('an empty observations array is allowed on a classic stamp', () => {
    expect(compositionStampSchema.safeParse({ ...classicStamp(), observations: [] }).success).toBe(true)
  })
})

describe('parseCompositionStamp (tolerant read)', () => {
  it('returns the stamp for a valid value', () => {
    expect(parseCompositionStamp(kept)).toEqual(kept)
  })
  it('returns null, never throws, for any invalid stored value', () => {
    for (const raw of [null, undefined, 5, 'x', [], {}, { ...kept, contractVersion: null }, { requestedArchetype: 'a' }]) {
      expect(parseCompositionStamp(raw)).toBeNull()
    }
  })
})

describe('helpers', () => {
  it('classicStamp is classic/classic with a null version and the default quality', () => {
    expect(classicStamp()).toEqual({
      requestedArchetype: 'classic',
      appliedArchetype: 'classic',
      contractVersion: null,
      imageQuality: 'default',
    })
    expect(classicStamp('standard').imageQuality).toBe('standard')
  })

  it('refineReplacedStamp turns a kept draft classic, keeping requested and quality, dropping observations', () => {
    const out = refineReplacedStamp({ ...kept, observations: ['layout-violation'] })
    expect(out).toEqual({
      requestedArchetype: 'product-showcase',
      appliedArchetype: 'classic',
      contractVersion: null,
      fallbackReason: 'refine-replaced-image',
      imageQuality: 'high',
    })
    expect(compositionStampSchema.safeParse(out).success).toBe(true)
  })

  it('refineReplacedStamp keeps an already-classic stamp unchanged', () => {
    const fallen: CompositionStamp = {
      requestedArchetype: 'product-showcase',
      appliedArchetype: 'classic',
      contractVersion: null,
      fallbackReason: 'busy',
      imageQuality: 'default',
    }
    expect(refineReplacedStamp(fallen)).toBe(fallen)
    const c = classicStamp()
    expect(refineReplacedStamp(c)).toBe(c)
  })
})
