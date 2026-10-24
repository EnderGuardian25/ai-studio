// 027 FR-04 / AC-03: the resolver, per surface.
import { describe, it, expect } from 'vitest'
import {
  resolvePostStyle,
  legacyGoalStyle,
  matchToneOption,
  POST_STYLES_REVISION,
  type ResolveInput,
  type Surface,
} from '@/lib/postStyles'
import { styles } from '@/lib/postStyles/styles'
import type { PostStyle } from '@/lib/postStyles/types'
import { TONE_OPTIONS } from '@/components/brief/constants'

const SURFACES: Surface[] = ['wizard', 'briefs-api', 'queue', 'mcp', 'acp', 'regenerate']
const ATTENDED: Surface[] = ['wizard', 'briefs-api', 'regenerate']
const UNATTENDED: Surface[] = ['queue', 'mcp', 'acp']

const base = (over: Partial<ResolveInput> = {}): ResolveInput => ({
  style: null,
  path: 'B',
  aspectRatio: 'SQUARE',
  surface: 'wizard',
  ...over,
})

function ok(input: ResolveInput, source?: Record<string, PostStyle>) {
  const r = resolvePostStyle(input, source)
  if (!r.ok) throw new Error(r.message)
  return r
}

describe.each(SURFACES)('resolvePostStyle on surface %s', (surface) => {
  it('no input resolves to general, goal awareness, tone professional, classic', () => {
    const r = ok(base({ surface }))
    expect(r.key).toBe('general')
    expect(r.goal).toBe('awareness')
    expect(r.tone).toBe('professional')
    expect(r.imageStyle).toBe('classic')
    expect(r.stamp).toEqual({ key: 'general', version: 1, revision: POST_STYLES_REVISION })
    expect(r.checklist.length).toBeGreaterThan(0)
  })

  it('an explicit style sets goal and tone from the style', () => {
    const r = ok(base({ surface, style: 'hiring' }))
    expect(r.key).toBe('hiring')
    expect(r.goal).toBe(styles.hiring.versions[1].goal)
    expect(r.tone).toBe(styles.hiring.versions[1].defaultTone)
  })

  it('the campaign default style applies when no style is given, and an explicit one beats it', () => {
    expect(ok(base({ surface, campaign: { defaultPostStyle: 'event' } })).key).toBe('event')
    expect(ok(base({ surface, style: 'tip', campaign: { defaultPostStyle: 'event' } })).key).toBe(
      'tip',
    )
  })

  it('tone: explicit (trimmed) beats the campaign tone, which beats the style default', () => {
    const campaign = { defaultTone: 'We like a BOLD voice' }
    expect(ok(base({ surface, style: 'tip', campaign })).tone).toBe('bold')
    expect(
      ok(base({ surface, style: 'tip', campaign, explicit: { tone: '  warm and friendly  ' } }))
        .tone,
    ).toBe('warm and friendly')
    expect(ok(base({ surface, style: 'tip', explicit: { tone: '   ' } })).tone).toBe(
      styles.tip.versions[1].defaultTone,
    )
  })

  it('campaign free-text tone with no match is ignored, with a note', () => {
    const r = ok(base({ surface, style: 'tip', campaign: { defaultTone: 'quirky' } }))
    expect(r.tone).toBe(styles.tip.versions[1].defaultTone)
    expect(r.notes).toContain('campaign-tone-ignored')
  })

  it('an unknown style key is UNKNOWN_POST_STYLE, never general', () => {
    const r = resolvePostStyle(base({ surface, style: 'nope' }))
    expect(r).toMatchObject({ ok: false, code: 'UNKNOWN_POST_STYLE' })
  })

  it('an unknown campaign default is UNKNOWN_POST_STYLE, never general', () => {
    const r = resolvePostStyle(base({ surface, campaign: { defaultPostStyle: 'gone' } }))
    expect(r).toMatchObject({ ok: false, code: 'UNKNOWN_POST_STYLE' })
  })

  it('prototype keys never resolve', () => {
    for (const k of ['constructor', '__proto__', 'toString'])
      expect(resolvePostStyle(base({ surface, style: k })).ok).toBe(false)
  })

  it('a pinned version that does not exist is UNKNOWN_POST_STYLE', () => {
    expect(resolvePostStyle(base({ surface, style: 'tip', version: 9 })).ok).toBe(false)
    expect(resolvePostStyle(base({ surface, style: 'tip', version: 1 })).ok).toBe(true)
  })

  it('legacy goal: hiring, Hiring and ANNOUNCEMENT map; awareness, engagement, conversion and free text fall through', () => {
    expect(ok(base({ surface, legacyGoal: 'hiring' })).key).toBe('hiring')
    expect(ok(base({ surface, legacyGoal: ' Hiring ' })).key).toBe('hiring')
    expect(ok(base({ surface, legacyGoal: 'ANNOUNCEMENT' })).key).toBe('announcement')
    for (const g of ['awareness', 'engagement', 'conversion', 'free text', '', 'constructor'])
      expect(ok(base({ surface, legacyGoal: g })).key, g).toBe('general')
    // fall-through goes to the campaign default first
    expect(
      ok(base({ surface, legacyGoal: 'engagement', campaign: { defaultPostStyle: 'event' } })).key,
    ).toBe('event')
    // a mapped goal beats the campaign default
    expect(
      ok(base({ surface, legacyGoal: 'hiring', campaign: { defaultPostStyle: 'event' } })).key,
    ).toBe('hiring')
  })

  it('an explicit style beats a conflicting legacyGoal; an unknown explicit key stays unknown', () => {
    expect(ok(base({ surface, style: 'tip', legacyGoal: 'hiring' })).key).toBe('tip')
    expect(resolvePostStyle(base({ surface, style: 'nope', legacyGoal: 'hiring' })).ok).toBe(false)
  })

  it('a blank or whitespace style is absent, not an unknown key', () => {
    expect(ok(base({ surface, style: '' })).key).toBe('general')
    expect(ok(base({ surface, style: '   ' })).key).toBe('general')
    expect(ok(base({ surface, style: '', legacyGoal: 'hiring' })).key).toBe('hiring')
  })
})

describe('resolvePostStyle: image style', () => {
  // No current style defaults to a look, so a fixture gives one that does.
  const withLook = (look: string): Record<string, PostStyle> => ({
    ...styles,
    launch: {
      ...styles.launch,
      versions: { 1: { ...styles.launch.versions[1], defaultImageStyle: look as 'classic' } },
    },
  })

  it('every real style on every surface keeps classic when its default is classic', () => {
    for (const s of SURFACES)
      for (const k of Object.keys(styles))
        if (styles[k as keyof typeof styles].versions[1].defaultImageStyle === 'classic')
          expect(ok(base({ surface: s, style: k })).imageStyle).toBe('classic')
  })

  it('an explicit look on an attended surface at a supported size on Path B is kept', () => {
    for (const surface of ATTENDED) {
      const r = ok(base({ surface, explicit: { imageStyle: 'editorial-split' } }))
      expect(r.imageStyle).toBe('editorial-split')
      expect(r.notes).toEqual([])
    }
  })

  it('a style whose default is a look applies it on Path B at a supported size', () => {
    const r = ok(base({ style: 'launch' }), withLook('product-showcase'))
    expect(r.imageStyle).toBe('product-showcase')
  })

  it('unattended surfaces are classic, with a note, even for an explicit look or a look default', () => {
    for (const surface of UNATTENDED) {
      const r = ok(base({ surface, explicit: { imageStyle: 'editorial-split' } }))
      expect(r.imageStyle).toBe('classic')
      expect(r.notes).toContain('unattended-classic')
      const d = ok(base({ surface, style: 'launch' }), withLook('product-showcase'))
      expect(d.imageStyle).toBe('classic')
      expect(d.notes).toContain('unattended-classic')
    }
  })

  it('Path A is classic with a note', () => {
    const r = ok(base({ path: 'A', explicit: { imageStyle: 'editorial-split' } }))
    expect(r.imageStyle).toBe('classic')
    expect(r.notes).toContain('path-a-classic')
  })

  it('STORY is classic with a note', () => {
    const r = ok(base({ aspectRatio: 'STORY', explicit: { imageStyle: 'editorial-split' } }))
    expect(r.imageStyle).toBe('classic')
    expect(r.notes).toContain('size-classic')
  })

  it('a look that is not an active archetype is classic with default-unavailable', () => {
    const r = ok(base({ explicit: { imageStyle: 'no-such-look' } }))
    expect(r.imageStyle).toBe('classic')
    expect(r.notes).toContain('default-unavailable')
  })
})

describe('resolvePostStyle: retired style (a fixture dataset)', () => {
  const dataset: Record<string, PostStyle> = {
    ...styles,
    tip: { ...styles.tip, status: 'retired' },
  }

  it('a retired key still resolves, through the resolver, with its goal, tone and stamp', () => {
    const r = ok(base({ style: 'tip' }), dataset)
    expect(r.key).toBe('tip')
    expect(r.goal).toBe(styles.tip.versions[1].goal)
    expect(r.stamp.key).toBe('tip')
    expect(r.checklist).toEqual(styles.tip.versions[1].checklist)
  })

  it('a retired key stored as the campaign default still resolves', () => {
    expect(ok(base({ campaign: { defaultPostStyle: 'tip' } }), dataset).key).toBe('tip')
  })

  it('a key absent from the fixture dataset is still unknown', () => {
    const { tip: _tip, ...without } = dataset
    expect(resolvePostStyle(base({ style: 'tip' }), without).ok).toBe(false)
  })
})

describe('resolvePostStyle: purity', () => {
  it('returns equal results for equal input and does not mutate it', () => {
    const input = base({ style: 'event', campaign: { defaultTone: 'casual' } })
    const copy = JSON.parse(JSON.stringify(input))
    expect(resolvePostStyle(input)).toEqual(resolvePostStyle(input))
    expect(input).toEqual(copy)
  })
})

describe('legacyGoalStyle and matchToneOption', () => {
  it('legacyGoalStyle', () => {
    expect(legacyGoalStyle('hiring')).toBe('hiring')
    expect(legacyGoalStyle(' Announcement')).toBe('announcement')
    expect(legacyGoalStyle('conversion')).toBeUndefined()
    expect(legacyGoalStyle(null)).toBeUndefined()
    expect(legacyGoalStyle(undefined)).toBeUndefined()
  })

  it('matchToneOption: first tone that is a substring of the lowercased text, else null', () => {
    expect(matchToneOption('A Professional, bold voice')).toBe('professional')
    expect(matchToneOption('CASUAL')).toBe('casual')
    expect(matchToneOption('empathetic and kind')).toBe('empathetic')
    expect(matchToneOption('quirky')).toBeNull()
    expect(matchToneOption('')).toBeNull()
    expect(matchToneOption(null)).toBeNull()
  })

  it("the wizard's TONE_OPTIONS keep their values and labels", () => {
    expect(TONE_OPTIONS).toEqual([
      { value: 'professional', label: 'Professional' },
      { value: 'casual', label: 'Casual' },
      { value: 'bold', label: 'Bold' },
      { value: 'empathetic', label: 'Empathetic' },
    ])
  })
})
