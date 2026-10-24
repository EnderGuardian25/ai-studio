// 027 FR-11 (the loader and refreshFactsCheck; the write points are wired in T4)
// with a fake prisma: READY rows only, a PENDING row skipped, a failed write
// logs and stores an error when it can, never throws. No real database.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { loadFactsSources, type FactsBrief, type SourceLoaders } from '@/lib/factsCheck/sources'
import { refreshFactsCheck, type RefreshDeps } from '@/lib/factsCheck/refresh'
import { parseFactsCheck } from '@/lib/factsCheck'

const BRIEF: FactsBrief = {
  teamId: 't1',
  topic: 'Launch of the academy',
  description: 'Doors open 18:00',
  campaignId: 'c1',
  brandKitId: 'k1',
}

function loaders(over: Partial<SourceLoaders> = {}): SourceLoaders & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    briefing: async (id) => {
      calls.push(`briefing:${id}`)
      return 'Briefing: offer 20%'
    },
    voicePrompt: async () => {
      calls.push('voice')
      return 'Voice: call 076-8030-944'
    },
    documents: async (b) => {
      calls.push(`docs:${b.campaignId}`)
      return ['Doc one', 'Doc two $50']
    },
    ...over,
  }
}

describe('loadFactsSources', () => {
  it('returns the topic, description, briefing, voice and campaign documents in order', async () => {
    expect(await loadFactsSources(BRIEF, {}, loaders())).toEqual([
      'Launch of the academy',
      'Doors open 18:00',
      'Briefing: offer 20%',
      'Voice: call 076-8030-944',
      'Doc one',
      'Doc two $50',
    ])
  })

  it('drops nulls and empties and reads no campaign data without a campaign', async () => {
    const l = loaders({ voicePrompt: async () => null })
    const out = await loadFactsSources({ ...BRIEF, campaignId: null, description: null }, {}, l)
    expect(out).toEqual(['Launch of the academy'])
    expect(l.calls).toEqual([])
  })

  it('does not read what the caller has already resolved', async () => {
    const l = loaders()
    const out = await loadFactsSources(BRIEF, { campaignBriefing: 'B', voicePrompt: 'V' }, l)
    expect(out.slice(2, 4)).toEqual(['B', 'V'])
    expect(l.calls).toEqual(['docs:c1'])
    // an explicit null means "resolved: none", not "read it"
    const none = await loadFactsSources(
      BRIEF,
      { campaignBriefing: null, voicePrompt: null },
      loaders(),
    )
    expect(none).toEqual(['Launch of the academy', 'Doors open 18:00', 'Doc one', 'Doc two $50'])
  })

  it('cuts the total at 200 000 characters', async () => {
    const big = 'x'.repeat(150_000)
    const l = loaders({ documents: async () => [big, big] })
    const out = await loadFactsSources({ ...BRIEF, description: null }, { voicePrompt: null }, l)
    expect(out.join('').length).toBe(200_000)
  })
})

interface FakeState {
  draft: null | { headline: string | null; brief: FactsBrief }
  captions: Array<{ channel: string; text: string; status: string }>
  writes: Array<Record<string, unknown>>
  failWrites: number
}

function fake(state: FakeState): RefreshDeps {
  const db = {
    draft: {
      findUnique: async () => state.draft,
      updateMany: async (args: { where: unknown; data: Record<string, unknown> }) => {
        if (state.failWrites > 0) {
          state.failWrites--
          throw new Error('write failed https://db.internal:5432/x key=secret')
        }
        state.writes.push(args.data)
        return { count: 1 }
      },
    },
  } as unknown as PrismaClient
  return {
    db,
    loadSources: (b) => loadFactsSources(b, {}, loaders()),
    loadCaptions: async () =>
      ({
        captions: state.captions.map((c) => ({
          ...c,
          failureReason: null,
          updatedAt: new Date(),
          model: null,
          modelSubstitutedFrom: null,
          route: null,
        })),
      }) as never,
  }
}

describe('refreshFactsCheck', () => {
  let errors: string[]
  beforeEach(() => {
    errors = []
    vi.spyOn(console, 'error').mockImplementation(
      (...a: unknown[]) => void errors.push(a.join(' ')),
    )
  })
  afterEach(() => vi.restoreAllMocks())

  const base = (): FakeState => ({
    draft: { headline: 'Only $99', brief: BRIEF },
    captions: [
      { channel: 'INSTAGRAM', text: 'Join 1,250 customers', status: 'READY' },
      { channel: 'LINKEDIN', text: 'Call us on 7 June', status: 'READY' },
    ],
    writes: [],
    failWrites: 0,
  })

  it('checks the headline and the READY captions against the sources and stores the result', async () => {
    const s = base()
    await refreshFactsCheck('d1', fake(s))
    expect(s.writes).toHaveLength(1)
    const check = parseFactsCheck(s.writes[0].factsCheck)
    expect(check?.status).toBe('flagged')
    expect(check?.flagged.map((f) => `${f.where}|${f.kind}|${f.value}`)).toEqual([
      'headline|cur|$99',
      'INSTAGRAM|num|1,250',
      'LINKEDIN|date|7 June',
    ])
  })

  it('skips a PENDING or FAILED row and an empty one', async () => {
    const s = base()
    s.captions[0].status = 'PENDING'
    s.captions[1] = { channel: 'LINKEDIN', text: '', status: 'READY' }
    await refreshFactsCheck('d1', fake(s))
    expect(parseFactsCheck(s.writes[0].factsCheck)?.flagged.map((f) => f.where)).toEqual([
      'headline',
    ])
    s.captions[0].status = 'FAILED'
    s.writes.length = 0
    await refreshFactsCheck('d1', fake(s))
    expect(parseFactsCheck(s.writes[0].factsCheck)?.flagged.map((f) => f.where)).toEqual([
      'headline',
    ])
  })

  it('a clear draft stores status clear', async () => {
    const s = base()
    s.draft = { headline: null, brief: BRIEF }
    s.captions = [{ channel: 'INSTAGRAM', text: 'Call 076-8030-944', status: 'READY' }]
    await refreshFactsCheck('d1', fake(s))
    expect(parseFactsCheck(s.writes[0].factsCheck)?.status).toBe('clear')
  })

  it('writes nothing for a missing draft', async () => {
    const s = base()
    s.draft = null
    await refreshFactsCheck('gone', fake(s))
    expect(s.writes).toEqual([])
  })

  it('a failed write logs once (redacted), tries to store status error, and never throws', async () => {
    const s = base()
    s.failWrites = 1
    await expect(refreshFactsCheck('d1', fake(s))).resolves.toBeUndefined()
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/^\[facts-check\] draft d1: /)
    expect(errors[0]).not.toMatch(/db\.internal|secret/)
    const stored = parseFactsCheck(s.writes[0].factsCheck)
    expect(stored?.status).toBe('error')
    expect(stored?.flagged).toEqual([])
    expect(stored?.reason).not.toMatch(/db\.internal|secret/)
  })

  it('a failing sources load stores error; a failing error write is swallowed too', async () => {
    const s = base()
    const deps = fake(s)
    deps.loadSources = async () => {
      throw new Error('sources unavailable')
    }
    await refreshFactsCheck('d1', deps)
    expect(parseFactsCheck(s.writes[0].factsCheck)).toMatchObject({
      status: 'error',
      reason: 'sources unavailable',
    })
    s.writes.length = 0
    s.failWrites = 5
    await expect(refreshFactsCheck('d1', deps)).resolves.toBeUndefined()
    expect(s.writes).toEqual([])
  })

  it('stores no caption or brief text', async () => {
    const s = base()
    await refreshFactsCheck('d1', fake(s))
    const json = JSON.stringify(s.writes[0])
    for (const text of ['Join 1,250 customers', 'Launch of the academy', 'Only $99', 'Call us on'])
      expect(json).not.toContain(text)
  })
})
