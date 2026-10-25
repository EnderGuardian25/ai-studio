// Change 028 T3 — the fixture table covers every current contract (AC-08).
import { describe, expect, it } from 'vitest'
import { archetypes, type ArchetypeMap } from '@/lib/designData'
import {
  INTENDED_BACKDROP,
  LOOK_FIXTURES,
  fixtureCompletenessProblems,
} from '../render/lookFixtureTable'

// 025 T1: `device-screen` (requires a composite source) has no fixture rows
// yet; T3 adds its 12 rows and deletes this filter.
const fixtured = Object.fromEntries(
  Object.entries(archetypes).filter(([, a]) => !a.requires),
) as ArchetypeMap

describe('look fixture completeness', () => {
  it('the table covers exactly every current (key, version, size) with the three kinds', () => {
    expect(fixtureCompletenessProblems(fixtured, LOOK_FIXTURES)).toEqual([])
    expect(LOOK_FIXTURES).toHaveLength(36)
  })

  it('a dataset with an added size names the missing ids', () => {
    const sp = fixtured.spotlight
    const square = sp.versions[sp.current].sizes.SQUARE!
    const withNewLook = {
      ...fixtured,
      'new-look': {
        ...sp,
        key: 'new-look',
        current: 1,
        versions: { 1: { ...sp.versions[sp.current], sizes: { SQUARE: square } } },
      },
    } as unknown as ArchetypeMap
    const problems = fixtureCompletenessProblems(withNewLook, LOOK_FIXTURES)
    expect(problems).toEqual([
      'missing fixture new-look@1:SQUARE#pass',
      'missing fixture new-look@1:SQUARE#busy',
      'missing fixture new-look@1:SQUARE#contrast',
    ])
  })

  it('names a row removed from the table, and a duplicate', () => {
    const short = LOOK_FIXTURES.filter((f) => !(f.key === 'spotlight' && f.size === 'STORY' && f.kind === 'busy'))
    expect(fixtureCompletenessProblems(fixtured, short)).toEqual(['missing fixture spotlight@1:STORY#busy'])
    const dup = [...LOOK_FIXTURES, LOOK_FIXTURES[0]]
    expect(fixtureCompletenessProblems(fixtured, dup).join('\n')).toContain('duplicate fixture')
  })

  it('the intended backdrop is dark exactly when the current textTone is light', () => {
    for (const a of Object.values(fixtured)) {
      expect(INTENDED_BACKDROP[a.key], a.key).toBeDefined()
      expect(INTENDED_BACKDROP[a.key] === 'dark', a.key).toBe(a.versions[a.current].textTone === 'light')
    }
  })
})
