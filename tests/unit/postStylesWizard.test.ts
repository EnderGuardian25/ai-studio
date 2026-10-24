// 027 FR-07: the wizard's pure style state: the pre-fill, the touched rule,
// what is sent, and how a resumed payload is read back.
import { describe, it, expect } from 'vitest'
import {
  campaignStyleKey,
  knownStyleKey,
  resolveWizardStyle,
  resumeWizardStyle,
  styleRequestFields,
  type WizardStyleInput,
} from '@/lib/brief/wizardStyleState'

const base: WizardStyleInput = {
  postStyle: 'general',
  campaign: null,
  designMode: 'GENERATE',
  aspectRatio: 'SQUARE',
  tone: 'professional',
  toneTouched: false,
  imageStyle: 'classic',
  imageStyleTouched: false,
}

describe('resolveWizardStyle', () => {
  it('general gives professional and classic', () => {
    const v = resolveWizardStyle(base)
    expect(v).toMatchObject({ postStyle: 'general', tone: 'professional', imageStyle: 'classic' })
    expect(v.imageStyleFromStyle).toBe(false)
  })

  it('an untouched tone and image style follow the style', () => {
    const v = resolveWizardStyle({ ...base, postStyle: 'launch' })
    expect(v.tone).toBe('bold')
    expect(v.imageStyle).toBe('product-showcase')
    expect(v.imageStyleFromStyle).toBe(true)
    expect(v.toneFromStyle).toBe(true)
  })

  it('a touched tone is never overwritten by a style change', () => {
    const v = resolveWizardStyle({ ...base, postStyle: 'promotion', tone: 'casual', toneTouched: true })
    expect(v.tone).toBe('casual')
    expect(v.toneFromStyle).toBe(false)
  })

  it('a touched image style is never overwritten by a style change', () => {
    const v = resolveWizardStyle({ ...base, postStyle: 'launch', imageStyle: 'editorial-split', imageStyleTouched: true })
    expect(v.imageStyle).toBe('editorial-split')
    expect(v.imageStyleFromStyle).toBe(false)
    const classic = resolveWizardStyle({ ...base, postStyle: 'launch', imageStyle: 'classic', imageStyleTouched: true })
    expect(classic.imageStyle).toBe('classic')
  })

  it('Path A shows classic whatever the style says; 9:16 now keeps the style default (028)', () => {
    expect(resolveWizardStyle({ ...base, postStyle: 'launch', designMode: 'TEMPLATE' }).imageStyle).toBe('classic')
    expect(resolveWizardStyle({ ...base, postStyle: 'launch', aspectRatio: 'STORY' }).imageStyle).toBe('product-showcase')
  })

  it('the campaign tone beats the style tone while untouched', () => {
    const v = resolveWizardStyle({ ...base, postStyle: 'launch', campaign: { defaultTone: 'Casual and warm' } })
    expect(v.tone).toBe('casual')
  })

  it('an unknown key opens as general', () => {
    expect(resolveWizardStyle({ ...base, postStyle: 'ghost' }).postStyle).toBe('general')
  })

  it('returns the style goal', () => {
    expect(resolveWizardStyle({ ...base, postStyle: 'hiring' }).goal).toBeTruthy()
  })
})

describe('keys', () => {
  it('knownStyleKey falls to general for unknown, blank and non-string', () => {
    expect(knownStyleKey('launch')).toBe('launch')
    expect(knownStyleKey('ghost')).toBe('general')
    expect(knownStyleKey('')).toBe('general')
    expect(knownStyleKey(undefined)).toBe('general')
    expect(knownStyleKey('constructor')).toBe('general')
  })
  it('campaignStyleKey reads the default, else general', () => {
    expect(campaignStyleKey({ defaultPostStyle: 'event' })).toBe('event')
    expect(campaignStyleKey({ defaultPostStyle: null })).toBe('general')
    expect(campaignStyleKey(null)).toBe('general')
  })
})

describe('styleRequestFields', () => {
  it('sends the style only when nothing is touched', () => {
    expect(styleRequestFields({ ...base, postStyle: 'launch' })).toStrictEqual({ postStyle: 'launch' })
  })
  it('sends tone and imageStyle when touched', () => {
    expect(
      styleRequestFields({
        ...base,
        postStyle: 'launch',
        tone: 'casual',
        toneTouched: true,
        imageStyle: 'editorial-split',
        imageStyleTouched: true,
      }),
    ).toStrictEqual({ postStyle: 'launch', tone: 'casual', imageStyle: 'editorial-split' })
  })
  it('a touched classic is sent (it overrides the style default)', () => {
    expect(
      styleRequestFields({ ...base, postStyle: 'launch', imageStyle: 'classic', imageStyleTouched: true }),
    ).toStrictEqual({ postStyle: 'launch', imageStyle: 'classic' })
  })
  it('a template brief never sends an image style', () => {
    expect(
      styleRequestFields({ ...base, designMode: 'TEMPLATE', imageStyle: 'editorial-split', imageStyleTouched: true }),
    ).toStrictEqual({ postStyle: 'general' })
  })
  it('an unknown key is sent as general', () => {
    expect(styleRequestFields({ ...base, postStyle: 'ghost' })).toStrictEqual({ postStyle: 'general' })
  })
})

describe('resumeWizardStyle', () => {
  const ctx = { campaign: null, designMode: 'GENERATE' as const, aspectRatio: 'SQUARE' as const }
  it('a stored tone equal to the style default stays untouched', () => {
    const r = resumeWizardStyle({ postStyle: 'launch', tone: 'bold', imageStyle: 'product-showcase' }, ctx)
    expect(r).toMatchObject({ postStyle: 'launch', toneTouched: false, imageStyleTouched: false })
  })
  it('a stored tone that differs is the users own', () => {
    expect(resumeWizardStyle({ postStyle: 'launch', tone: 'casual' }, ctx).toneTouched).toBe(true)
  })
  it('an absent stored image style under a style that sets one is a touched classic', () => {
    const r = resumeWizardStyle({ postStyle: 'launch', tone: 'bold' }, ctx)
    expect(r.imageStyleTouched).toBe(true)
    expect(r.imageStyle).toBe('classic')
  })
  it('an old row with no style resumes as general, untouched', () => {
    const r = resumeWizardStyle({ tone: 'professional' }, ctx)
    expect(r).toMatchObject({ postStyle: 'general', toneTouched: false, imageStyleTouched: false })
  })
  it('an unknown stored style opens as general', () => {
    expect(resumeWizardStyle({ postStyle: 'ghost', tone: 'professional' }, ctx).postStyle).toBe('general')
  })
})
