import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 012 T5: the caption writers (FR-07/FR-09/FR-10). writeCaptions' logging and
// whole-reply failure mapping; the required headline (A6) on the async and
// sync generation paths; retry resetting the caption rows; and
// regenerate-design's Topic fallback. Prisma, the provider and the design
// runners are faked; the extractor, the caption store and generateDraft run
// for real.

const h = vi.hoisted(() => {
  const db = {
    draft: null as null | Record<string, unknown>,
    draftCreates: [] as Array<Record<string, unknown>>,
    draftUpdates: [] as Array<{ where: unknown; data: Record<string, unknown> }>,
    draftUpdateManys: [] as Array<{ where: unknown; data: Record<string, unknown> }>,
    captionUpdateManys: [] as Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>,
    revisionCreates: [] as Array<Record<string, unknown>>,
  }
  const tx = {
    draft: {
      findUnique: async () => db.draft,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        db.draftCreates.push(data)
        return { id: 'd-new', ...data }
      },
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        db.draftUpdates.push(args)
        return { id: 'd1', ...args.data }
      },
      updateMany: async (args: { where: unknown; data: Record<string, unknown> }) => {
        db.draftUpdateManys.push(args)
        return { count: 1 }
      },
    },
    draftCaption: {
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        db.captionUpdateManys.push(args)
        return { count: 1 }
      },
    },
    draftRevision: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        db.revisionCreates.push(data)
        return { id: 'rev' }
      },
      findFirst: async () => ({ revisionNumber: 1 }),
    },
  }
  const client = {
    ...tx,
    $transaction: async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (t: typeof tx) => Promise<unknown>)(tx),
  }
  return {
    db,
    client,
    reply: '' as string,
    providerError: null as Error | null,
    pathB: vi.fn(async (..._args: unknown[]) => ({
      htmlContent: '<html>b</html>',
      exportUrl: 'exports/b.png',
      backgroundImageUrl: null,
      background: { url: null, skip: 'NOT_NEEDED' },
    })),
    startBackgroundGeneration: vi.fn(async (..._args: unknown[]) => {}),
  }
})
const db = h.db

vi.mock('@/lib/prisma', () => ({ prisma: h.client }))
vi.mock('@/lib/renderer/fontSet', () => ({ getFontSetId: () => 'fonts-test' }))
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: async () => ({ id: 'kit', name: 'Kit' }) }))
vi.mock('@/lib/campaign/briefing', () => ({ getActiveCampaignBriefing: async () => null }))
vi.mock('@/providers/registry', () => ({
  resolveCopyProvider: async () => ({
    generateCaptions: async () => {
      if (h.providerError) throw h.providerError
      return h.reply
    },
  }),
}))
vi.mock('@/lib/agent/pathA', () => ({
  runPathADesign: async () => ({ htmlContent: '<html>a</html>', exportUrl: 'exports/a.png' }),
  assertTemplateMatchesBrief: () => {},
}))
vi.mock('@/lib/agent/pathB', () => ({ runPathBDesign: h.pathB }))
vi.mock('@/lib/api/handler', () => ({
  withTeamAuth:
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1' }),
}))
vi.mock('@/lib/authz/visibility', () => ({ canAccessContent: () => true }))
vi.mock('@/lib/agent/backgroundGeneration', () => ({ startBackgroundGeneration: h.startBackgroundGeneration }))
vi.mock('@/lib/drafts/draftActions', () => ({
  claimDraftAction: async () => true,
  startDraftAction: async (_d: string, _u: string, _t: string, _a: string, work: () => Promise<unknown>) => {
    await work()
  },
}))

const { writeCaptions, requireHeadline, HeadlineMissingError, GENERATION_TARGETS } = await import(
  '@/lib/captions/generate'
)
const { humanizeGenerationError } = await import('@/lib/agent/generationErrors')
const { createPendingDraft, runGenerationForDraft, generateDraftForBrief } = await import('@/lib/agent/generateDraft')
const { POST: retry } = await import('@/app/api/drafts/[id]/retry/route')
const { POST: regenerateDesign } = await import('@/app/api/drafts/[id]/regenerate-design/route')
const { CAPTION_PROMPT_VERSION } = await import('@/lib/agent/prompts/caption')

const SENTENCE = (reason: string) => `The caption reply had no usable headline (${reason}). Retry to generate again.`

const FULL = { headline: 'Applications are open', instagram: 'IG text', linkedin: 'LI text', whatsapp: 'WA text' }
const json = (o: Record<string, unknown>) => JSON.stringify(o)

const brief = {
  id: 'b1',
  teamId: 'team1',
  userId: 'u1',
  topic: 'The brief topic',
  campaignId: null,
  brandKitId: null,
  designMode: 'GENERATE',
  aspectRatio: 'SQUARE',
  copyProviderKey: null,
} as never
const actor = { userId: 'u1', teamId: 'team1' }

type ConsoleSpy = { mock: { calls: unknown[][] }; mockRestore: () => void }
let info: ConsoleSpy
let warn: ConsoleSpy
const logged = (spy: ConsoleSpy): string[] => spy.mock.calls.map((c) => String(c[0]))

beforeEach(() => {
  db.draft = null
  db.draftCreates = []
  db.draftUpdates = []
  db.draftUpdateManys = []
  db.captionUpdateManys = []
  db.revisionCreates = []
  h.reply = json(FULL)
  h.providerError = null
  h.pathB.mockClear()
  h.startBackgroundGeneration.mockClear()
  info = vi.spyOn(console, 'info').mockImplementation(() => {})
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  info.mockRestore()
  warn.mockRestore()
})

const provider = () => ({ generateCaptions: async () => h.reply })
const briefInput = { topic: 't', description: '', goal: 'g', tone: 'x', channels: [] }

describe('writeCaptions (design §3)', () => {
  it('logs the caption prompt version with every call, and the discarded text JSON-quoted, clipped to 500', async () => {
    h.reply = `${'p'.repeat(600)}\n${json(FULL)}`
    const fields = await writeCaptions(provider(), briefInput, GENERATION_TARGETS)
    expect(fields.HEADLINE).toEqual({ ok: true, text: 'Applications are open' })
    expect(logged(info)[0]).toBe(
      `[captions] caption call (prompt ${CAPTION_PROMPT_VERSION}) for HEADLINE, INSTAGRAM, LINKEDIN, WHATSAPP`
    )
    expect(logged(warn)).toEqual([`[captions] discarded reply text: ${JSON.stringify('p'.repeat(500))}`])
  })

  it('logs nothing more for a clean reply', async () => {
    await writeCaptions(provider(), briefInput, GENERATION_TARGETS)
    expect(warn).not.toHaveBeenCalled()
  })

  it('a newline in discarded text cannot forge a log line', async () => {
    h.reply = `ok\n[captions] REVIEW forged\n${json(FULL)}`
    await writeCaptions(provider(), briefInput, GENERATION_TARGETS)
    expect(logged(warn)[0]).not.toContain('\n')
  })

  it('a whole-reply failure fails every requested target with its reason, and is logged', async () => {
    h.reply = 'Sorry, I cannot help with that.'
    const fields = await writeCaptions(provider(), briefInput, ['HEADLINE', 'LINKEDIN'])
    expect(fields).toEqual({
      HEADLINE: { ok: false, reason: 'no-object' },
      LINKEDIN: { ok: false, reason: 'no-object' },
    })
    expect(logged(warn)).toContain('[captions] reply rejected (no-object)')
  })

  it('a provider error is not a reply: it propagates', async () => {
    const failing = { generateCaptions: async () => Promise.reject(new Error('Claude CLI timed out')) }
    await expect(writeCaptions(failing, briefInput, GENERATION_TARGETS)).rejects.toThrow('timed out')
  })
})

describe('HeadlineMissingError (A6, FR-09)', () => {
  it('requireHeadline returns a valid headline and throws the FR-09 sentence otherwise', () => {
    expect(requireHeadline({ HEADLINE: { ok: true, text: 'H' } })).toBe('H')
    expect(() => requireHeadline({ HEADLINE: { ok: false, reason: 'over-limit (120 / 100)' } })).toThrow(
      SENTENCE('over-limit (120 / 100)')
    )
    expect(() => requireHeadline({})).toThrow(HeadlineMissingError)
  })

  it('humanizeGenerationError maps it to the FR-09 sentence', () => {
    expect(humanizeGenerationError(new HeadlineMissingError('missing'))).toBe(SENTENCE('missing'))
  })
})

describe('createPendingDraft', () => {
  it('creates the draft with one PENDING row per registry channel, in the same (nested) write', async () => {
    await createPendingDraft(brief)
    expect(db.draftCreates).toHaveLength(1)
    expect(db.draftCreates[0]).toMatchObject({
      status: 'IN_PROGRESS',
      copyText: '',
      captions: {
        create: [
          { channel: 'INSTAGRAM', status: 'PENDING' },
          { channel: 'LINKEDIN', status: 'PENDING' },
          { channel: 'WHATSAPP', status: 'PENDING' },
        ],
      },
    })
    expect(db.draftCreates[0]).not.toHaveProperty('headline')
  })
})

describe('runGenerationForDraft (async)', () => {
  beforeEach(() => {
    db.draft = { id: 'd1', templateId: null, brief }
  })

  it('writes every row and the headline, then designs from the headline — never a caption', async () => {
    await runGenerationForDraft('d1', actor)
    expect(db.captionUpdateManys.map((u) => [u.where, u.data.status, u.data.text])).toEqual([
      [{ draftId: 'd1', channel: 'INSTAGRAM', status: 'PENDING' }, 'READY', 'IG text'],
      [{ draftId: 'd1', channel: 'LINKEDIN', status: 'PENDING' }, 'READY', 'LI text'],
      [{ draftId: 'd1', channel: 'WHATSAPP', status: 'PENDING' }, 'READY', 'WA text'],
    ])
    expect(db.draftUpdateManys).toEqual([{ where: { id: 'd1' }, data: { headline: 'Applications are open' } }])
    expect(h.pathB).toHaveBeenCalledTimes(1)
    expect(h.pathB.mock.calls[0][2]).toBe('Applications are open')
    expect(JSON.stringify(h.pathB.mock.calls[0])).not.toContain('IG text')
    expect(db.draftUpdates.at(-1)!.data).toMatchObject({ status: 'EXPORTED' })
  })

  it('no valid headline ⇒ FAILED with the FR-09 sentence, the validated captions kept, no design run', async () => {
    h.reply = json({ instagram: 'IG text', linkedin: 'LI text', whatsapp: 'WA text' })
    await runGenerationForDraft('d1', actor)
    expect(h.pathB).not.toHaveBeenCalled()
    expect(db.captionUpdateManys.map((u) => u.data.status)).toEqual(['READY', 'READY', 'READY'])
    const failed = db.draftUpdates.at(-1)!.data
    expect(failed).toMatchObject({ status: 'FAILED', failureReason: SENTENCE('missing') })
    // Only rows still PENDING are failed; the READY ones above are untouched.
    expect(failed.captions).toEqual({
      updateMany: {
        where: { status: 'PENDING' },
        data: { status: 'FAILED', text: '', failureReason: 'generation failed' },
      },
    })
    expect(db.draftUpdates.some((u) => u.data.status === 'EXPORTED')).toBe(false)
  })

  it('a partial reply stores the failed channel as FAILED with no text, and still designs', async () => {
    h.reply = json({ headline: 'H', instagram: 'IG text', whatsapp: 'WA text' })
    await runGenerationForDraft('d1', actor)
    const li = db.captionUpdateManys.find((u) => u.where.channel === 'LINKEDIN')!
    expect(li.data).toMatchObject({ status: 'FAILED', text: '', failureReason: 'missing' })
    expect(h.pathB).toHaveBeenCalledTimes(1)
  })

  it('the caption call itself failing ⇒ FAILED, and the still-PENDING rows fail with the draft', async () => {
    h.providerError = new Error('No Claude credential available')
    await runGenerationForDraft('d1', actor)
    expect(db.captionUpdateManys).toHaveLength(0)
    const failed = db.draftUpdates.at(-1)!.data
    expect(failed.status).toBe('FAILED')
    expect(failed.failureReason).toMatch(/No Claude token is connected/)
    expect(failed.captions).toMatchObject({ updateMany: { where: { status: 'PENDING' } } })
  })
})

describe('generateDraftForBrief (sync: scheduler, MCP, ACP)', () => {
  it('throws HeadlineMissingError before any design is paid for, and creates no draft', async () => {
    h.reply = json({ headline: '   ', instagram: 'IG text', linkedin: 'LI text', whatsapp: 'WA text' })
    await expect(generateDraftForBrief(brief, { userId: null, teamId: 'team1' })).rejects.toThrow(SENTENCE('empty'))
    expect(h.pathB).not.toHaveBeenCalled()
    expect(db.draftCreates).toHaveLength(0)
  })

  it('creates the draft with its headline, three rows and revision 1 in one transaction', async () => {
    h.reply = json({ headline: 'H', instagram: 'IG text', whatsapp: 'WA text' })
    await generateDraftForBrief(brief, { userId: null, teamId: 'team1' })
    expect(h.pathB.mock.calls[0][2]).toBe('H')
    expect(db.draftCreates[0]).toMatchObject({
      copyText: '',
      headline: 'H',
      status: 'EXPORTED',
      captions: {
        create: [
          { channel: 'INSTAGRAM', text: 'IG text', status: 'READY', failureReason: null },
          { channel: 'LINKEDIN', text: '', status: 'FAILED', failureReason: 'missing' },
          { channel: 'WHATSAPP', text: 'WA text', status: 'READY', failureReason: null },
        ],
      },
    })
    expect(db.revisionCreates).toHaveLength(1)
  })
})

describe('retry route (FR-10)', () => {
  const req = {} as never
  const ctx = { params: { id: 'd1' } } as never

  it('sets IN_PROGRESS and every caption row back to PENDING in the same update, then reruns', async () => {
    db.draft = { id: 'd1', status: 'FAILED', teamId: 'team1', brief: { userId: 'u1', campaignId: null } }
    const res = (await retry(req, ctx)) as Response
    expect(res.status).toBe(202)
    expect(db.draftUpdates).toHaveLength(1)
    expect(db.draftUpdates[0].data).toEqual({
      status: 'IN_PROGRESS',
      failureReason: null,
      headline: null,
      captions: {
        updateMany: { where: {}, data: { status: 'PENDING', failureReason: null } },
        createMany: {
          data: [
            { channel: 'INSTAGRAM', status: 'PENDING' },
            { channel: 'LINKEDIN', status: 'PENDING' },
            { channel: 'WHATSAPP', status: 'PENDING' },
          ],
          skipDuplicates: true,
        },
      },
    })
    expect(h.startBackgroundGeneration).toHaveBeenCalledWith('d1', 'u1', 'team1')
  })

  it('a non-FAILED draft is left alone (409)', async () => {
    db.draft = { id: 'd1', status: 'EXPORTED', teamId: 'team1', brief: { userId: 'u1', campaignId: null } }
    const res = (await retry(req, ctx)) as Response
    expect(res.status).toBe(409)
    expect(db.draftUpdates).toHaveLength(0)
  })
})

describe('regenerate-design uses designHeadline (FR-09)', () => {
  const req = {} as never
  const ctx = { params: { id: 'd1' } } as never
  const draftWith = (headline: string | null) => ({
    id: 'd1', teamId: 'team1', brief, headline, htmlContent: '<html>v1</html>', exportUrl: 'exports/v1.png',
    currentRevisionNumber: 1, promptVersion: null, fontSet: null,
  })

  it('designs from the stored headline', async () => {
    db.draft = draftWith('Stored headline')
    await regenerateDesign(req, ctx)
    expect(h.pathB.mock.calls[0][2]).toBe('Stored headline')
    expect(logged(info).some((l) => l.includes('has no headline'))).toBe(false)
  })

  it('a migrated draft (headline null) falls back to the brief Topic, and logs it', async () => {
    db.draft = draftWith(null)
    await regenerateDesign(req, ctx)
    expect(h.pathB.mock.calls[0][2]).toBe('The brief topic')
    expect(logged(info)).toContain('[captions] draft d1 has no headline — design uses the brief topic')
  })
})
