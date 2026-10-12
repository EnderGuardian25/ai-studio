import { describe, it, expect, vi, beforeEach } from 'vitest'

// F3 (change 004 final fix wave, AC-04): the generation and regenerate-design
// paths write DraftRevision rows outside revisions.ts. Each must stamp the row
// with the render it holds — the same prompt version + font set it stamps on
// the draft (draftRevisions.test.ts covers commit / reject / restore / adopt).
//
// 008 FR-08 / D4: the stamp also carries the model that made the render — the
// DraftRevision row as `model`, the draft as `designModel` (draftStampFields).
// The resolver runs for real on the faked TeamModelPolicy row.

const fake = vi.hoisted(() => {
  const db = {
    draftWrites: [] as Array<{ op: string; data: Record<string, unknown> }>,
    revisionCreates: [] as Array<Record<string, unknown>>,
    draft: null as null | Record<string, unknown>,
    policy: null as null | Record<string, unknown>,
  }
  const tx = {
    teamModelPolicy: { findUnique: async () => db.policy },
    // CLI mode (@prisma/client loads the local .env, which can set it)
    // queries the credential tier: 'team'.
    userClaudeToken: { findFirst: async () => null },
    draft: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        db.draftWrites.push({ op: 'update', data })
        return { id: 'd1', ...data }
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        db.draftWrites.push({ op: 'create', data })
        return { id: 'd1', ...data }
      },
      findUnique: async () => db.draft,
      updateMany: async () => ({ count: 1 }),
    },
    draftCaption: { updateMany: async () => ({ count: 1 }) },
    draftRevision: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        db.revisionCreates.push(data)
        return { id: `rev-${db.revisionCreates.length}` }
      },
      findFirst: async () => {
        const nums = db.revisionCreates.map((r) => r.revisionNumber as number)
        return nums.length ? { revisionNumber: Math.max(...nums) } : null
      },
    },
    brandKitTemplate: { findFirst: async () => ({ id: 't1', aspectRatio: 'SQUARE' }) },
  }
  // Both transaction forms: the interactive callback and the batch array.
  const client = {
    ...tx,
    $transaction: async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (t: typeof tx) => Promise<unknown>)(tx),
  }
  return { db, client }
})
const db = fake.db

vi.mock('@/lib/prisma', () => ({ prisma: fake.client }))
vi.mock('@/lib/renderer/fontSet', () => ({ getFontSetId: () => 'fonts-test' }))
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: async () => ({ id: 'kit', name: 'Kit' }) }))
vi.mock('@/lib/campaign/briefing', () => ({ getActiveCampaignBriefing: async () => null }))
vi.mock('@/providers/registry', () => ({
  resolveCopyProvider: async () => ({
    generateCaptions: async (_b: unknown, _t: unknown, model: { arg: string }) => ({
      raw: JSON.stringify({ headline: 'the headline', instagram: 'ig', linkedin: 'li', whatsapp: 'wa' }),
      modelId: model.arg,
    }),
  }),
}))
vi.mock('@/lib/agent/briefInput', () => ({ buildBriefInput: () => ({}) }))
vi.mock('@/lib/agent/pathA', () => ({
  runPathADesign: async () => ({ htmlContent: '<html>a</html>', exportUrl: 'exports/a.png' }),
  assertTemplateMatchesBrief: () => {},
}))
vi.mock('@/lib/agent/pathB', () => ({
  runPathBDesign: async () => ({ htmlContent: '<html>b</html>', exportUrl: 'exports/b.png', backgroundImageUrl: null }),
}))
vi.mock('@/lib/agent/generationErrors', () => ({ humanizeGenerationError: (e: unknown) => String(e) }))
// The route's auth wrapper → a pass-through with a fixed teammate.
vi.mock('@/lib/api/handler', () => ({
  withTeamAuth:
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1' }),
}))
vi.mock('@/lib/authz/visibility', () => ({ canAccessContent: () => true }))
// Run the claimed action's work inline so the test can observe its writes.
vi.mock('@/lib/drafts/draftActions', () => ({
  claimDraftAction: async () => true,
  startDraftAction: async (_d: string, _u: string, _t: string, _a: string, work: () => Promise<unknown>) => {
    await work()
  },
}))

import { PROMPT_VERSION } from '@/lib/agent/prompts/shared'
import { generateDraftForBrief, runGenerationForDraft } from '@/lib/agent/generateDraft'
import { POST as regenerateDesign } from '@/app/api/drafts/[id]/regenerate-design/route'
import { currentRenderStamp, draftStampFields, restoredRenderStamp } from '@/lib/drafts/revisions'
import { decideModel } from '@/lib/models/resolve'
import { DEFAULT_POLICY } from '@/lib/models/policyRules'

const STAMP = { promptVersion: PROMPT_VERSION, fontSet: 'fonts-test' }
// Path B's system default (FR-04) on a team with no saved policy.
const FREEFORM = { model: 'claude-sonnet-5-5', modelSubstitutedFrom: null }
const DRAFT_FREEFORM = { designModel: 'claude-sonnet-5-5', designModelSubstitutedFrom: null }

const brief = {
  id: 'b1',
  teamId: 'team1',
  userId: 'u1',
  campaignId: null,
  brandKitId: null,
  designMode: 'GENERATE',
  aspectRatio: 'SQUARE',
  copyProviderKey: null,
} as never

beforeEach(() => {
  db.draftWrites = []
  db.revisionCreates = []
  db.draft = null
  db.policy = null
})

describe('generation v1 "Original design" revision', () => {
  it('sync path (MCP/ACP, scheduler): the v1 row and the draft carry the same stamp', async () => {
    await generateDraftForBrief(brief, { userId: null, teamId: 'team1' })
    expect(db.revisionCreates).toHaveLength(1)
    expect(db.revisionCreates[0]).toMatchObject({ revisionNumber: 1, instruction: 'Original design', ...STAMP, ...FREEFORM })
    expect(db.draftWrites.find((w) => w.op === 'create')!.data).toMatchObject({ ...STAMP, ...DRAFT_FREEFORM })
    expect(db.draftWrites.find((w) => w.op === 'create')!.data).not.toHaveProperty('model')
  })

  it('async path (brief wizard): finalizeDraftV1 stamps the v1 row and the draft', async () => {
    db.draft = { id: 'd1', templateId: null, brief }
    await runGenerationForDraft('d1', { userId: 'u1', teamId: 'team1' })
    expect(db.revisionCreates).toHaveLength(1)
    expect(db.revisionCreates[0]).toMatchObject({ revisionNumber: 1, instruction: 'Original design', ...STAMP, ...FREEFORM })
    const finalize = db.draftWrites.find((w) => w.data.status === 'EXPORTED')!
    expect(finalize.data).toMatchObject({ ...STAMP, ...DRAFT_FREEFORM })
  })

  it('a TEMPLATE brief stamps the DESIGN_TEMPLATE model (Haiku by default)', async () => {
    db.draft = { id: 'd1', templateId: 't1', brief: { ...(brief as object), designMode: 'TEMPLATE' } }
    await runGenerationForDraft('d1', { userId: 'u1', teamId: 'team1' })
    expect(db.revisionCreates[0]).toMatchObject({ model: 'claude-haiku-4-5', modelSubstitutedFrom: null })
  })
})

describe('regenerate-design', () => {
  const req = {} as never
  const ctx = { params: { id: 'd1' } } as never

  it('the regenerated revision and the draft carry the same (current) stamp', async () => {
    db.draft = {
      id: 'd1', teamId: 'team1', brief, headline: 'h', htmlContent: '<html>v1</html>', exportUrl: 'exports/v1.png',
      currentRevisionNumber: 1, promptVersion: 'pv-old', fontSet: 'fonts-old',
    }
    const res = (await regenerateDesign(req, ctx)) as Response
    expect(res.status).toBe(202)
    expect(db.revisionCreates).toHaveLength(1)
    expect(db.revisionCreates[0]).toMatchObject({ instruction: 'Regenerated design', ...STAMP, ...FREEFORM })
    expect(db.draftWrites.at(-1)!.data).toMatchObject({ ...STAMP, ...DRAFT_FREEFORM })
  })

  it('008 (T6 interim): resolves DESIGN_FREEFORM from the team default before the claim', async () => {
    db.policy = {
      allowedModels: ['HAIKU', 'SONNET', 'OPUS'],
      requirePersonalTokenForGated: false,
      defaults: [{ surface: 'DESIGN_FREEFORM', model: 'OPUS' }],
    }
    db.draft = {
      id: 'd1', teamId: 'team1', brief, headline: 'h', htmlContent: '<html>v1</html>', exportUrl: 'exports/v1.png',
      currentRevisionNumber: 1, promptVersion: 'pv-old', fontSet: 'fonts-old',
    }
    await regenerateDesign(req, ctx)
    expect(db.revisionCreates[0]).toMatchObject({ model: 'claude-opus-5-5' })
    expect(db.draftWrites.at(-1)!.data).toMatchObject({ designModel: 'claude-opus-5-5' })
  })

  it('a team with no allowed model is a 422 that claims nothing and writes nothing', async () => {
    db.policy = { allowedModels: [], requirePersonalTokenForGated: false, defaults: [] }
    db.draft = {
      id: 'd1', teamId: 'team1', brief, headline: 'h', htmlContent: '<html>v1</html>', exportUrl: 'exports/v1.png',
      currentRevisionNumber: 1, promptVersion: null, fontSet: null,
    }
    const res = (await regenerateDesign(req, ctx)) as Response
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('NO_ALLOWED_MODEL')
    expect(db.revisionCreates).toHaveLength(0)
    expect(db.draftWrites).toHaveLength(0)
  })

  it("a legacy draft's 'Design before regenerate' snapshot keeps the DRAFT's own stamp (it is that render)", async () => {
    db.draft = {
      id: 'd1', teamId: 'team1', brief, headline: 'h', htmlContent: '<html>legacy</html>', exportUrl: 'exports/l.png',
      currentRevisionNumber: null, promptVersion: 'pv-old', fontSet: 'fonts-old',
    }
    await regenerateDesign(req, ctx)
    expect(db.revisionCreates).toHaveLength(2)
    expect(db.revisionCreates[0]).toMatchObject({
      instruction: 'Design before regenerate',
      promptVersion: 'pv-old',
      fontSet: 'fonts-old',
    })
    expect(db.revisionCreates[1]).toMatchObject({ instruction: 'Regenerated design', ...STAMP })
  })

  it('a legacy snapshot of an unstamped draft is null, never undefined', async () => {
    db.draft = {
      id: 'd1', teamId: 'team1', brief, headline: 'h', htmlContent: '<html>legacy</html>', exportUrl: 'exports/l.png',
      currentRevisionNumber: null, promptVersion: null, fontSet: null,
    }
    await regenerateDesign(req, ctx)
    expect(db.revisionCreates[0]).toHaveProperty('promptVersion', null)
    expect(db.revisionCreates[0]).toHaveProperty('fontSet', null)
  })
})

// ── 008 D4: the model in the RenderStamp ────────────────────────────────────

describe('RenderStamp.model (008 FR-08, D4)', () => {
  const resolved = (() => {
    const r = decideModel('DESIGN_FREEFORM', {
      policy: { ...DEFAULT_POLICY, allowed: ['HAIKU', 'SONNET'] },
      credential: 'n/a',
      mode: 'api',
      storedRequest: 'OPUS',
    })
    if (!r.ok) throw new Error(r.message)
    return r.resolved
  })()

  it('currentRenderStamp(model) carries the arg that crossed the boundary and the refused value', () => {
    expect(currentRenderStamp(resolved)).toEqual({
      ...STAMP,
      model: 'claude-sonnet-5-5',
      modelSubstitutedFrom: 'OPUS',
    })
    expect(currentRenderStamp(null)).toEqual({ ...STAMP, model: null, modelSubstitutedFrom: null })
  })

  it('draftStampFields maps model → designModel, and nothing else changes name', () => {
    expect(draftStampFields(currentRenderStamp(resolved))).toEqual({
      ...STAMP,
      designModel: 'claude-sonnet-5-5',
      designModelSubstitutedFrom: 'OPUS',
    })
  })

  it("restoredRenderStamp copies the revision's own model, whether or not its PNG is re-rendered (A6)", () => {
    const row = { promptVersion: 'pv-old', fontSet: 'fonts-old', model: 'claude-sonnet-4-6', modelSubstitutedFrom: 'HAIKU' }
    expect(restoredRenderStamp(row, false)).toEqual(row)
    expect(restoredRenderStamp(row, true)).toEqual({ ...row, fontSet: 'fonts-test' })
    // A pre-008 row reads as unknown, never as the current model.
    expect(restoredRenderStamp({ promptVersion: 'pv', fontSet: 'f' }, false)).toMatchObject({
      model: null,
      modelSubstitutedFrom: null,
    })
  })
})
