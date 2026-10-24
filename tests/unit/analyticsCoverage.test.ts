// 006 FR-13: the guard that keeps the catalogue honest. It fails when a draft
// action, a channel or a source has no event that can carry it, and when a
// payload copies a vocabulary that already has an owner.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AspectRatio, CaptionRoute, Channel, DraftAction } from '@prisma/client'
import { CATALOGUE, EVENT_NAMES } from '@/lib/analytics/catalogue'
import { MODEL_KEYS } from '@/lib/models/catalogue'
import { INSTRUCTION_CLASS_KEYS } from '@/lib/agent/instructionClasses'
import { archetypes, FALLBACK_REASONS } from '@/lib/designData'

const SOURCES = ['web', 'scheduler', 'mcp'] as const

// Every value that has an owner elsewhere. A quoted copy of one of these inside
// the catalogue means a vocabulary was copied rather than imported.
const OWNED: Record<string, readonly string[]> = {
  DraftAction: Object.values(DraftAction),
  Channel: Object.values(Channel),
  AspectRatio: Object.values(AspectRatio),
  CaptionRoute: Object.values(CaptionRoute),
  MODEL_KEYS,
  INSTRUCTION_CLASS_KEYS,
  FALLBACK_REASONS,
  archetypes: Object.keys(archetypes),
}

/** Quoted strings in `source`, comments removed, that equal an owned value. */
function findCopiedVocabulary(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const found: string[] = []
  for (const m of code.matchAll(/(['"])([^'"\n]+)\1/g)) {
    for (const [vocab, values] of Object.entries(OWNED)) {
      if (values.includes(m[2])) found.push(`${vocab}:${m[2]}`)
    }
  }
  return found
}

describe('analytics coverage guard (006 FR-13, AC-03)', () => {
  it('has an event that carries every DraftAction value', () => {
    for (const action of Object.values(DraftAction)) {
      expect(CATALOGUE['draft_action.settled'].schema.safeParse({ action }).success).toBe(true)
      expect(CATALOGUE['draft_action.swept'].schema.safeParse({ action }).success).toBe(true)
    }
  })

  it('has an event that carries every Channel value', () => {
    for (const channel of Object.values(Channel)) {
      expect(CATALOGUE['publish.settled'].schema.safeParse({ channel, terminal: true }).success).toBe(true)
    }
  })

  it('has an event that can carry every source value', () => {
    for (const source of SOURCES) {
      const carriers = EVENT_NAMES.filter((n) => (CATALOGUE[n].source as readonly string[]).includes(source))
      expect(carriers.length, `source ${source}`).toBeGreaterThan(0)
    }
  })

  it('copies no owned vocabulary into the catalogue source', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/analytics/catalogue.ts'), 'utf8')
    expect(findCopiedVocabulary(src)).toEqual([])
  })

  it('catches a planted copy of the Channel list (asserted on a fixture)', () => {
    const planted = `const channel = z.enum(['INSTAGRAM', 'LINKEDIN'])`
    expect(findCopiedVocabulary(planted)).toEqual(['Channel:INSTAGRAM', 'Channel:LINKEDIN'])
  })

  it('catches planted copies of the other vocabularies', () => {
    expect(findCopiedVocabulary(`z.enum(['REFINE'])`)).toEqual(['DraftAction:REFINE'])
    expect(findCopiedVocabulary(`z.enum(['SONNET'])`)).toEqual(['MODEL_KEYS:SONNET'])
    expect(findCopiedVocabulary(`z.enum(['replace'])`)).toEqual(['INSTRUCTION_CLASS_KEYS:replace'])
    expect(findCopiedVocabulary(`z.enum(['editorial-split'])`)).toEqual(['archetypes:editorial-split'])
  })

  it('ignores owned words in comments', () => {
    expect(findCopiedVocabulary(`// REFINE and INSTAGRAM\n/* 'SONNET' */ const a = 1`)).toEqual([])
  })
})
