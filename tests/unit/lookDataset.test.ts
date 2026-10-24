// 028 T1: the look dataset (FR-01 to FR-04, NFR-04). Validation rules each fail
// on their own fixture, every (key, version) is pinned by a hash, the key list
// is committed, and v2 of the two original looks equals v1.
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  archetypes,
  lookDatasetProblems,
  imageStyleOptions,
  IMAGE_STYLES,
  contractAt,
  styleLabel,
  supportsSize,
  type Archetype,
  type ArchetypeMap,
  type Contract,
} from '@/lib/designData'

// Every look key ever shipped. A deletion or a rename fails the test below.
const COMMITTED_KEYS = ['product-showcase', 'editorial-split', 'full-bleed-scene', 'spotlight']

const hash = (c: unknown) => createHash('sha256').update(JSON.stringify(c)).digest('hex')

// Computed once from the finished rows. A released version is never edited.
const HASHES: Record<string, string> = {
  'product-showcase@1': 'ce6a918e9ed33e60787779591c2834651bc85dae8749283d7ba9c39be036c4cc',
  'product-showcase@2': '5c94fd476f30bb45e84e886b1e318ff959277d9d722b2652a24af1e80dfd0c5f',
  'editorial-split@1': '440d41092cd4ef97baba2d2e02971f389cee0ecd340b4517e9b32e38d411ecc6',
  'editorial-split@2': '1e403779e9a3f44d1002c67bfa75a94455a3a9e40b224060924157c62adb6733',
  'full-bleed-scene@1': '37f092ceaf25161f099c37736e3101669f404fd9e7006d1abca5dab4609a0b8e',
  'spotlight@1': '6f48b77bc7982379333d5e5fb3ac626f01feb1bf542c0b6e10355248e1c643c6',
}

describe('the shipped dataset (AC-01, AC-02)', () => {
  it('has four active looks at current 2, 2, 1, 1', () => {
    expect(Object.values(archetypes).map((a) => [a.key, a.status, a.current])).toEqual([
      ['product-showcase', 'active', 2],
      ['editorial-split', 'active', 2],
      ['full-bleed-scene', 'active', 1],
      ['spotlight', 'active', 1],
    ])
  })

  it('lookDatasetProblems is empty', () => {
    expect(lookDatasetProblems(archetypes)).toEqual([])
  })

  it('every (key, version) matches its committed hash and none is missing', () => {
    const seen: string[] = []
    for (const a of Object.values(archetypes)) {
      for (const v of Object.keys(a.versions)) {
        const id = `${a.key}@${v}`
        seen.push(id)
        expect(hash(a.versions[Number(v)]), id).toBe(HASHES[id])
      }
    }
    expect(seen.sort()).toEqual(Object.keys(HASHES).sort())
  })

  it('the committed key list is a subset of the dataset keys', () => {
    for (const k of COMMITTED_KEYS) expect(Object.keys(archetypes), k).toContain(k)
  })

  it('v2 SQUARE and PORTRAIT of the two original looks deep-equal v1; v2 adds STORY', () => {
    for (const k of ['product-showcase', 'editorial-split']) {
      const { 1: v1, 2: v2 } = archetypes[k].versions
      expect(v2.sizes.SQUARE).toEqual(v1.sizes.SQUARE)
      expect(v2.sizes.PORTRAIT).toEqual(v1.sizes.PORTRAIT)
      expect(v1.sizes.STORY).toBeUndefined()
      expect(v2.sizes.STORY).toBeDefined()
      expect(v2.textTone).toBe('light')
    }
  })

  it('no shipped contract has variantOf', () => {
    for (const a of Object.values(archetypes)) {
      for (const c of Object.values(a.versions)) expect(c.variantOf).toBeUndefined()
    }
  })

  it('the picker lists the four looks after classic and every one supports every size', () => {
    expect(IMAGE_STYLES.map((s) => s.key)).toEqual(['classic', ...COMMITTED_KEYS])
    for (const size of ['SQUARE', 'PORTRAIT', 'STORY'] as const) {
      expect(imageStyleOptions(size).every((o) => o.supported)).toBe(true)
      for (const k of COMMITTED_KEYS) expect(supportsSize(k, size)).toBe(true)
    }
    expect(supportsSize('classic', 'STORY')).toBe(true)
    expect(supportsSize('nope', 'SQUARE')).toBe(false)
  })

  it('labels and Spotlight bands match FR-02', () => {
    expect(styleLabel('full-bleed-scene')).toBe('Full-bleed scene')
    expect(styleLabel('spotlight')).toBe('Spotlight')
    const bands = contractAt('spotlight', 1, 'STORY')!.regions
    expect(bands.map((r) => [r.rect, r.use])).toEqual([
      [{ x: 0, y: 0, w: 100, h: 22 }, 'the headline'],
      [{ x: 0, y: 78, w: 100, h: 22 }, 'the call to action and the logo'],
    ])
  })

  it('the composition.ts header holds the key rule', () => {
    const src = readFileSync('src/lib/designData/composition.ts', 'utf8')
    expect(src).toContain('THE LOOK KEY RULE')
    expect(src).toContain('THE VERSION RULE')
  })
})

// ── Fixture datasets: each FR-03 rule fails with its own message ─────────────

const region = (x: number, y: number, w: number, h: number, purpose: 'text' | 'clear' = 'text', minAreaPct = 20) => ({
  rect: { x, y, w, h },
  purpose,
  minAreaPct,
})
const contract = (over: Partial<Contract> = {}): Contract => ({
  role: 'hero',
  textTone: 'light',
  sizes: { SQUARE: { subject: 's', regions: [region(0, 0, 50, 100)] } },
  ...over,
})
const look = (key: string, over: Partial<Archetype> = {}): Archetype => ({
  key: key as Archetype['key'],
  label: key,
  summary: 's',
  status: 'active',
  current: 1,
  versions: { 1: contract() },
  ...over,
})
const dataset = (...looks: Archetype[]): ArchetypeMap => Object.fromEntries(looks.map((a) => [a.key, a]))

describe('lookDatasetProblems (AC-02)', () => {
  it('a valid dataset passes', () => {
    expect(lookDatasetProblems(dataset(look('alpha')))).toEqual([])
  })

  it('a valid -light variant with regions equal to its base passes', () => {
    const variant = look('alpha-light', { versions: { 1: contract({ variantOf: { key: 'alpha', version: 1 } }) } })
    expect(lookDatasetProblems(dataset(look('alpha'), variant))).toEqual([])
  })

  it('a bad key', () => {
    expect(lookDatasetProblems(dataset(look('Bad_Key')))).toEqual(
      expect.arrayContaining([expect.stringContaining('Bad_Key: key does not match')]),
    )
  })

  it('a record key that differs from archetype.key', () => {
    const map = { one: look('two') } as unknown as ArchetypeMap
    expect(lookDatasetProblems(map).join('\n')).toContain('one: record key differs')
  })

  it('a missing current', () => {
    expect(lookDatasetProblems(dataset(look('alpha', { current: 3 }))).join('\n')).toContain('alpha: current 3 names no version')
  })

  it('a bad status', () => {
    const bad = look('alpha', { status: 'paused' as never })
    expect(lookDatasetProblems(dataset(bad)).join('\n')).toContain('alpha: status "paused"')
  })

  it('a contract with no text region (no empty check)', () => {
    const c = contract({ sizes: { SQUARE: { subject: 's', regions: [region(0, 0, 50, 100, 'clear')] } } })
    expect(lookDatasetProblems(dataset(look('alpha', { versions: { 1: c } })))).toEqual(['alpha@1:SQUARE: no text region'])
    const empty = contract({ sizes: { SQUARE: { subject: 's', regions: [] } } })
    expect(lookDatasetProblems(dataset(look('alpha', { versions: { 1: empty } })))).toEqual(['alpha@1:SQUARE: no text region'])
  })

  it('a region out of range', () => {
    const c = contract({ sizes: { STORY: { subject: 's', regions: [region(0, 60, 100, 50)] } } })
    expect(lookDatasetProblems(dataset(look('alpha', { versions: { 1: c } }))).join('\n')).toContain('alpha@1:STORY: region')
    const zero = contract({ sizes: { STORY: { subject: 's', regions: [region(0, 0, 0, 50)] } } })
    expect(lookDatasetProblems(dataset(look('alpha', { versions: { 1: zero } }))).join('\n')).toContain('no size')
  })

  it('a region under its minimum area', () => {
    const c = contract({ sizes: { SQUARE: { subject: 's', regions: [region(0, 0, 10, 10)] } } })
    expect(lookDatasetProblems(dataset(look('alpha', { versions: { 1: c } }))).join('\n')).toContain('below its minimum 20%')
  })

  it('variantOf: the base must exist', () => {
    const v = look('alpha-light', { versions: { 1: contract({ variantOf: { key: 'alpha', version: 1 } }) } })
    expect(lookDatasetProblems(dataset(v)).join('\n')).toContain('base "alpha" does not exist')
  })

  it('variantOf: the base must not itself be a variant', () => {
    const light = look('alpha-light', { versions: { 1: contract({ variantOf: { key: 'alpha', version: 1 } }) } })
    const nested = look('alpha-light-light', { versions: { 1: contract({ variantOf: { key: 'alpha-light', version: 1 } }) } })
    expect(lookDatasetProblems(dataset(look('alpha'), light, nested)).join('\n')).toContain('is itself a variant')
  })

  it('variantOf: the base version must exist', () => {
    const v = look('alpha-light', { versions: { 1: contract({ variantOf: { key: 'alpha', version: 9 } }) } })
    expect(lookDatasetProblems(dataset(look('alpha'), v)).join('\n')).toContain('base version alpha@9 does not exist')
  })

  it('variantOf: the key must be <base>-<suffix> with a suffix in the closed list', () => {
    const wrongSuffix = look('alpha-dark', { versions: { 1: contract({ variantOf: { key: 'alpha', version: 1 } }) } })
    expect(lookDatasetProblems(dataset(look('alpha'), wrongSuffix)).join('\n')).toContain('variant key must be "alpha-<suffix>"')
    const unrelated = look('beta', { versions: { 1: contract({ variantOf: { key: 'alpha', version: 1 } }) } })
    expect(lookDatasetProblems(dataset(look('alpha'), unrelated)).join('\n')).toContain('variant key must be "alpha-<suffix>"')
  })

  it('variantOf: every size must exist in the base with deep-equal regions', () => {
    const moved = contract({
      variantOf: { key: 'alpha', version: 1 },
      sizes: { SQUARE: { subject: 'x', regions: [region(0, 0, 60, 100)] } },
    })
    expect(lookDatasetProblems(dataset(look('alpha'), look('alpha-light', { versions: { 1: moved } }))).join('\n')).toContain(
      'alpha-light@1:SQUARE: regions differ from base alpha@1',
    )
    const extra = contract({
      variantOf: { key: 'alpha', version: 1 },
      sizes: { STORY: { subject: 'x', regions: [region(0, 0, 50, 100)] } },
    })
    expect(lookDatasetProblems(dataset(look('alpha'), look('alpha-light', { versions: { 1: extra } }))).join('\n')).toContain(
      'base alpha@1 has no STORY',
    )
  })

  it('variantOf: every version of a variant names the same base key', () => {
    const light = look('alpha-light', {
      current: 2,
      versions: {
        1: contract({ variantOf: { key: 'alpha', version: 1 } }),
        2: contract({ variantOf: { key: 'beta', version: 1 } }),
      },
    })
    const problems = lookDatasetProblems(dataset(look('alpha'), look('beta'), light)).join('\n')
    expect(problems).toContain('alpha-light: every version of a variant must name the same base key')
  })

  it('the prefix rule: a key that extends another key must be its variant', () => {
    const problems = lookDatasetProblems(dataset(look('alpha'), look('alpha-extra'))).join('\n')
    expect(problems).toContain('alpha-extra: starts with "alpha-"')
  })
})

describe('load-time assertion', () => {
  it('index.ts runs lookDatasetProblems outside production and throws', () => {
    const src = readFileSync('src/lib/designData/index.ts', 'utf8')
    expect(src).toContain('lookDatasetProblems(archetypes)')
    expect(src).toContain("process.env.NODE_ENV !== 'production'")
    expect(src).toContain('throw new Error')
  })
})
