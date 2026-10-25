import { describe, it, expect } from 'vitest'
import { compositePairingError } from '@/lib/brief/compositeSource'

const SOURCE = { kind: 'upload', key: 'k' }

describe('compositePairingError (025 FR-08)', () => {
  it('a look that requires a screenshot with none is IMAGE_STYLE_NEEDS_SCREENSHOT', () => {
    expect(compositePairingError('device-screen', undefined)).toBe('IMAGE_STYLE_NEEDS_SCREENSHOT')
    expect(compositePairingError('device-screen', null)).toBe('IMAGE_STYLE_NEEDS_SCREENSHOT')
  })

  it('a screenshot on a look without requires, or on classic, is SCREENSHOT_NEEDS_IMAGE_STYLE', () => {
    for (const style of ['classic', 'spotlight', 'product-showcase', undefined, null, '']) {
      expect(compositePairingError(style, SOURCE)).toBe('SCREENSHOT_NEEDS_IMAGE_STYLE')
    }
  })

  it('a consistent pair is null', () => {
    expect(compositePairingError('device-screen', SOURCE)).toBeNull()
    expect(compositePairingError('classic', undefined)).toBeNull()
    expect(compositePairingError('spotlight', null)).toBeNull()
  })
})
