// 008 FR-20 (T16): GET /api/drafts/[id] carries `captionProviderIsClaude` for
// THIS draft — the brief's own caption provider key, else the team default —
// through the same copyProviderIsClaude lookup regenerate-copy refuses a pick
// on, so the draft page's caption pickers hide exactly when the server would
// refuse them (spec open question 1; reviews/T13.md NOTE).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  draftFindUnique: vi.fn(),
  draftUpdateMany: vi.fn(),
  providerFindFirst: vi.fn(),
  copyProviderIsClaude: vi.fn(),
  resolveBrandKit: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { draft: { findUnique: h.draftFindUnique, updateMany: h.draftUpdateMany }, availableProvider: { findFirst: h.providerFindFirst } },
}))
vi.mock('@/lib/api/handler', () => {
  const wrap =
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1' })
  const parseBody = async (req: Request) => ({ data: await req.json() })
  return { parseBody, withTeamAuth: wrap, withTeamAdmin: wrap }
})
vi.mock('@/lib/authz/visibility', () => ({ canAccessContent: () => true }))
// The real copyProviderIsClaude behind a spy: the call-argument cases stub it,
// and the select case (018 FR-04) lets it run against the faked Prisma row.
vi.mock('@/providers/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/providers/registry')>()
  h.copyProviderIsClaude.mockImplementation(actual.copyProviderIsClaude)
  return { copyProviderIsClaude: h.copyProviderIsClaude }
})
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: h.resolveBrandKit }))
vi.mock('@/lib/storage/minio', () => ({ resolveExportUrl: async () => null }))
vi.mock('@/lib/drafts/revisions', async () => {
  // The real tolerant parse: the GET reads the stamp through it (009 FR-15).
  const { parseCompositionStamp } = await import('@/lib/designData')
  return {
    COMMITTED_REVISION: {},
    resolveNotAppliedOutcome: async () => null,
    draftCompositionStamp: (d: { composition?: unknown }) => parseCompositionStamp(d.composition),
  }
})
vi.mock('@/lib/captions/store', () => ({
  loadDraftCaptions: async () => ({ captions: [] }),
  saveCaptionEdit: vi.fn(),
  saveHeadlineEdit: vi.fn(),
  settlePendingCaptions: vi.fn(),
}))

const { GET } = await import('@/app/api/drafts/[id]/route')
const realCopyProviderIsClaude = h.copyProviderIsClaude.getMockImplementation()!

// A settled, exported draft: nothing for the recovery sweep to write.
function exportedDraft(copyProviderKey: string | null) {
  const now = new Date()
  return {
    id: 'd1',
    briefId: 'b1',
    teamId: 'team1',
    status: 'EXPORTED',
    failureReason: null,
    pendingAction: null,
    pendingActionClaimId: null,
    pendingActionError: null,
    pendingConflict: null,
    updatedAt: now,
    createdAt: now,
    exportUrl: 'exports/d1.png',
    htmlContent: '<html></html>',
    currentRevisionNumber: 1,
    headline: 'H',
    headlineModel: null,
    headlineModelSubstitutedFrom: null,
    designModel: null,
    designModelSubstitutedFrom: null,
    imageUrl: null,
    backgroundSkipReason: null,
    backgroundSkipDetail: null,
    posts: [],
    _count: { revisions: 1 },
    brief: {
      id: 'b1',
      userId: 'u1',
      teamId: 'team1',
      campaignId: null,
      brandKitId: null,
      copyProviderKey,
      topic: 'T',
      goal: null,
      tone: null,
      channels: [],
      aspectRatio: 'SQUARE',
      designMode: 'GENERATE',
    },
  }
}

async function get() {
  const res = (await GET(new Request('http://test/x') as never, { params: { id: 'd1' } } as never)) as Response
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

beforeEach(() => {
  h.draftFindUnique.mockReset()
  h.draftUpdateMany.mockReset().mockResolvedValue({ count: 1 })
  h.providerFindFirst.mockReset()
  h.copyProviderIsClaude.mockReset()
  h.copyProviderIsClaude.mockImplementation(realCopyProviderIsClaude)
  h.resolveBrandKit.mockReset()
  h.resolveBrandKit.mockResolvedValue(null)
})

describe("GET /api/drafts/[id] — captionProviderIsClaude is the draft's own", () => {
  it("asks about the brief's own caption provider key, on the brief's team", async () => {
    h.draftFindUnique.mockResolvedValue(exportedDraft('openai-copy'))
    h.copyProviderIsClaude.mockResolvedValue(false)
    const { status, body } = await get()
    expect(status).toBe(200)
    expect(h.copyProviderIsClaude).toHaveBeenCalledWith('team1', 'openai-copy')
    expect(body.captionProviderIsClaude).toBe(false)
  })

  it('a brief with no key asks about the team default (undefined key), and true passes through', async () => {
    h.draftFindUnique.mockResolvedValue(exportedDraft(null))
    h.copyProviderIsClaude.mockResolvedValue(true)
    const { body } = await get()
    expect(h.copyProviderIsClaude).toHaveBeenCalledWith('team1', undefined)
    expect(body.captionProviderIsClaude).toBe(true)
  })

  it('a missing draft is 404 and asks nothing', async () => {
    h.draftFindUnique.mockResolvedValue(null)
    const { status } = await get()
    expect(status).toBe(404)
    expect(h.copyProviderIsClaude).not.toHaveBeenCalled()
  })
})

describe('GET /api/drafts/[id] — the provider lookup per poll (018 FR-04)', () => {
  it('selects the provider name only, on both tiers of the lookup', async () => {
    h.draftFindUnique.mockResolvedValue(exportedDraft('openai-copy'))
    // The brief's own key misses, so the team default is read too.
    h.providerFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ providerName: 'openai' })
    const { status, body } = await get()
    expect(status).toBe(200)
    expect(h.providerFindFirst).toHaveBeenCalledTimes(2)
    expect(h.providerFindFirst).toHaveBeenNthCalledWith(1, {
      where: { slot: 'COPY', providerKey: 'openai-copy', teamId: 'team1', isEnabled: true },
      select: { providerName: true },
    })
    expect(h.providerFindFirst).toHaveBeenNthCalledWith(2, {
      where: { slot: 'COPY', teamId: 'team1', isDefault: true, isEnabled: true },
      select: { providerName: true },
    })
    expect(body.captionProviderIsClaude).toBe(false)
  })

  it('runs the provider lookup alongside the brand-kit read, not after it', async () => {
    h.draftFindUnique.mockResolvedValue(exportedDraft(null))
    h.providerFindFirst.mockResolvedValue(null)
    let releaseKit!: (kit: { name: string }) => void
    h.resolveBrandKit.mockReturnValue(new Promise((resolve) => (releaseKit = resolve)))
    const pending = get()
    await vi.waitFor(() => expect(h.copyProviderIsClaude).toHaveBeenCalled())
    releaseKit({ name: 'Kit' })
    const { body } = await pending
    expect(body.brandKitName).toBe('Kit')
    expect(body.captionProviderIsClaude).toBe(true)
  })
})

// 019 FR-06 / FR-07 / AC-05: the sweep's clear is guarded on the claim it
// OBSERVED, and a null token (an older image's claim) is swept all the same.
describe('GET /api/drafts/[id] — the stale-action sweep is guarded on the observed claim (019)', () => {
  const STALE_AT = new Date(Date.now() - 20 * 60_000)
  const stale = (claimId: string | null) => ({
    ...exportedDraft(null),
    pendingAction: 'REFINE',
    pendingActionClaimId: claimId,
    updatedAt: STALE_AT,
  })

  it('clears with a WHERE carrying the observed action and token, and nulls the token', async () => {
    h.draftFindUnique.mockResolvedValue(stale('tok-1'))
    const { body } = await get()
    expect(h.draftUpdateMany).toHaveBeenCalledWith({
      where: { id: 'd1', pendingAction: 'REFINE', pendingActionClaimId: 'tok-1' },
      data: {
        pendingAction: null,
        pendingActionClaimId: null,
        pendingActionError: 'The action was interrupted. Please try again.',
      },
    })
    expect(body.pendingAction).toBeNull()
  })

  it('sweeps a stale row whose token is null (claimed by an older image): the WHERE matches IS NULL', async () => {
    h.draftFindUnique.mockResolvedValue(stale(null))
    await get()
    expect(h.draftUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'd1', pendingAction: 'REFINE', pendingActionClaimId: null } }),
    )
  })

  it('a sweep whose observed token no longer matches writes nothing to the row', async () => {
    // A stateful fake: R2 claimed (tok-2) between the sweep's read (tok-1) and its clear.
    const row = { pendingAction: 'REFINE', pendingActionClaimId: 'tok-2', pendingActionError: null as string | null }
    h.draftUpdateMany.mockImplementation(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (where.pendingAction !== row.pendingAction || where.pendingActionClaimId !== row.pendingActionClaimId) {
        return { count: 0 }
      }
      Object.assign(row, data)
      return { count: 1 }
    })
    h.draftFindUnique.mockResolvedValue(stale('tok-1'))
    await get()
    expect(row).toEqual({ pendingAction: 'REFINE', pendingActionClaimId: 'tok-2', pendingActionError: null })
  })

  it('never puts the token in the response', async () => {
    h.draftFindUnique.mockResolvedValue({ ...exportedDraft(null), pendingAction: 'REFINE', pendingActionClaimId: 'tok-secret' })
    const { body } = await get()
    expect(JSON.stringify(body)).not.toContain('tok-secret')
    expect(body).not.toHaveProperty('pendingActionClaimId')
  })
})

describe('GET /api/drafts/[id] — composition and compositionNotice (009 FR-15)', () => {
  it('a pre-009 draft (no stamp) reports null and null', async () => {
    h.draftFindUnique.mockResolvedValue({ ...exportedDraft(null), composition: null })
    h.copyProviderIsClaude.mockResolvedValue(true)
    const { body } = await get()
    expect(body.composition).toBeNull()
    expect(body.compositionNotice).toBeNull()
  })

  it('a kept archetype reports the stamp and no notice', async () => {
    const stamp = {
      requestedArchetype: 'product-showcase',
      appliedArchetype: 'product-showcase',
      contractVersion: 1,
      imageQuality: 'default',
    }
    h.draftFindUnique.mockResolvedValue({ ...exportedDraft(null), composition: stamp })
    h.copyProviderIsClaude.mockResolvedValue(true)
    const { body } = await get()
    expect(body.composition).toEqual(stamp)
    expect(body.compositionNotice).toBeNull()
  })

  it('a fallback reports the stamp and its notice with the reason', async () => {
    const stamp = {
      requestedArchetype: 'editorial-split',
      appliedArchetype: 'classic',
      contractVersion: null,
      fallbackReason: 'busy',
      imageQuality: 'default',
    }
    h.draftFindUnique.mockResolvedValue({ ...exportedDraft(null), composition: stamp })
    h.copyProviderIsClaude.mockResolvedValue(true)
    const { body } = await get()
    expect(body.composition).toEqual(stamp)
    expect(body.compositionNotice).toMatchObject({ reason: 'busy' })
    expect((body.compositionNotice as { message: string }).message).toContain('Editorial split')
  })

  it('an unreadable stored value is null, never a throw', async () => {
    h.draftFindUnique.mockResolvedValue({ ...exportedDraft(null), composition: { nonsense: true } })
    h.copyProviderIsClaude.mockResolvedValue(true)
    const { status, body } = await get()
    expect(status).toBe(200)
    expect(body.composition).toBeNull()
    expect(body.compositionNotice).toBeNull()
  })
})
