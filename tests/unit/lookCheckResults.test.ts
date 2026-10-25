// 028 FR-16 / AC-20: a post-style default may name a look only if that look
// passed the real-image check (OP-028), and only for contracts that did not change
// since the render the user accepted. The evidence is the committed results file.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { lookVerdicts } from '../../scripts/look-check/lookCheck.mjs'
import { styles } from '@/lib/postStyles/styles'
import { archetypes, contractAt } from '@/lib/designData/composition'
import type { AspectRatio } from '@prisma/client'

type Result = {
  slot: string
  key: string
  size: AspectRatio
  contractVersion: number | null
  styleKept: boolean
  accepted: boolean | null
}

const RESULTS_PATH = join(
  process.cwd(),
  '.specclaw/changes/028-image-looks/look-check/results.json',
)
const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8')) as Result[]

const GATED = new Set(['full-bleed-scene', 'spotlight'])

// Every look named by a post-style version n >= 2 that the check gates.
function namedLooks(): string[] {
  const out: string[] = []
  for (const s of Object.values(styles))
    for (const [n, v] of Object.entries(s.versions))
      if (Number(n) >= 2 && GATED.has(v.defaultImageStyle)) out.push(v.defaultImageStyle)
  return out
}

// The problems for a results list: a named look that did not pass, and a passing
// slot whose accepted contract differs from the look's current contract.
function problems(rs: Result[]): string[] {
  const verdicts = lookVerdicts(rs) as Record<string, { passed: boolean }>
  const out: string[] = []
  for (const key of new Set(namedLooks())) {
    if (!verdicts[key]?.passed) out.push(`${key}: named by a post-style default but did not pass`)
    const current = archetypes[key].current
    for (const slot of Object.values(rs).filter((r) => r.key === key)) {
      const last = [...rs].reverse().find((r) => r.slot === slot.slot)
      if (last !== slot || !(last.styleKept && last.accepted === true)) continue
      const accepted = contractAt(key, last.contractVersion as number, last.size)
      const now = contractAt(key, current, last.size)
      if (!accepted || JSON.stringify(accepted) !== JSON.stringify(now))
        out.push(`${last.slot}: contract v${last.contractVersion} differs from current v${current}`)
    }
  }
  return out
}

describe('028 T7: post-style defaults are tied to the committed OP-028 results', () => {
  it('the moved styles name full-bleed-scene and nothing else gated', () => {
    expect(namedLooks().sort()).toEqual(['full-bleed-scene', 'full-bleed-scene'])
  })

  it('every gated look named by a version n >= 2 passed, and its accepted contracts equal the current ones', () => {
    expect(problems(results)).toEqual([])
  })

  it('the committed results show full-bleed-scene passed and spotlight failed', () => {
    const v = lookVerdicts(results) as Record<string, { passed: boolean }>
    expect(v['full-bleed-scene'].passed).toBe(true)
    expect(v['spotlight'].passed).toBe(false)
  })

  it('fails on a doctored in-memory copy that rejects a full-bleed slot', () => {
    const doctored = structuredClone(results)
    const slot = [...doctored].reverse().find((r) => r.slot === 'full-bleed-scene:SQUARE')!
    slot.accepted = false
    expect(problems(doctored).join('\n')).toMatch(/full-bleed-scene: named by a post-style default/)
  })

  it('fails when an accepted contract differs from the current one', () => {
    const doctored = structuredClone(results)
    const slot = [...doctored].reverse().find((r) => r.slot === 'full-bleed-scene:PORTRAIT')!
    slot.contractVersion = 99
    expect(problems(doctored).join('\n')).toMatch(/full-bleed-scene:PORTRAIT: contract v99/)
  })
})
