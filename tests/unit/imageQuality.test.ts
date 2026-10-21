import { describe, it, expect } from 'vitest'
import { IMAGE_TIERS, parseImageTier } from '@/providers/imageCapabilities'

describe('parseImageTier (AC-20, parser half)', () => {
  it('the closed set is standard and high', () => {
    expect([...IMAGE_TIERS]).toEqual(['standard', 'high'])
  })

  it('accepts standard and high in any case, trimmed', () => {
    expect(parseImageTier('standard')).toBe('standard')
    expect(parseImageTier('high')).toBe('high')
    expect(parseImageTier('  HIGH ')).toBe('high')
    expect(parseImageTier('Standard\n')).toBe('standard')
  })

  it('treats unset, blank and unknown as unset', () => {
    expect(parseImageTier(undefined)).toBeUndefined()
    expect(parseImageTier(null)).toBeUndefined()
    expect(parseImageTier('')).toBeUndefined()
    expect(parseImageTier('   ')).toBeUndefined()
    expect(parseImageTier('medium')).toBeUndefined()
    expect(parseImageTier('auto')).toBeUndefined()
    expect(parseImageTier('highest')).toBeUndefined()
  })
})
