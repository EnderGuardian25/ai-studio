// 012 T6 review NOTEs — the caption routes' edge paths, with the store, the
// action lifecycle and the provider mocked:
//   - regenerate-copy: an empty body is {}; malformed JSON is 400; a throw
//     after the claim (before the run starts) settles the target rows and
//     releases the claim instead of stranding both until the sweep; a failure
//     before the claim claims nothing;
//   - PATCH { headline }: refused (409) while a generation runs.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  draftFindUnique: vi.fn(),
  resolveCopyProvider: vi.fn(),
  loadDraftCaptions: vi.fn(),
  claimCaptionAction: vi.fn(),
  settleCaptionAction: vi.fn(),
  saveHeadlineEdit: vi.fn(),
  startDraftAction: vi.fn(),
  releaseDraftAction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { draft: { findUnique: h.draftFindUnique } } }))
// The real handler module pulls in auth (and its env checks); these routes need
// only the wrapper and a JSON read.
vi.mock('@/lib/api/handler', () => {
  const wrap =
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1' })
  const parseBody = async (req: Request) => ({ data: await req.json() })
  return { parseBody, withTeamAuth: wrap, withTeamAdmin: wrap }
})
vi.mock('@/lib/authz/visibility', () => ({ canAccessContent: () => true }))
vi.mock('@/providers/registry', () => ({ resolveCopyProvider: h.resolveCopyProvider }))
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: async () => null }))
vi.mock('@/lib/campaign/briefing', () => ({ getActiveCampaignBriefing: async () => null }))
vi.mock('@/lib/storage/minio', () => ({ resolveExportUrl: async () => null }))
vi.mock('@/lib/drafts/revisions', () => ({ COMMITTED_REVISION: {}, resolveNotAppliedOutcome: async () => null }))
vi.mock('@/lib/captions/generate', () => ({ writeCaptions: vi.fn() }))
// 008 T6: the route resolves the CAPTION model before its claim; writeCaptions
// is faked above, so any resolved value will do.
vi.mock('@/lib/models/policy', () => ({
  resolveModel: async () => ({ ok: true, resolved: { surface: 'CAPTION', key: 'HAIKU', arg: 'claude-haiku-4-5' } }),
}))
vi.mock('@/lib/captions/store', () => ({
  loadDraftCaptions: h.loadDraftCaptions,
  claimCaptionAction: h.claimCaptionAction,
  settleCaptionAction: h.settleCaptionAction,
  saveHeadlineEdit: h.saveHeadlineEdit,
  saveCaptionEdit: vi.fn(),
  settlePendingCaptions: vi.fn(),
}))
vi.mock('@/lib/drafts/draftActions', () => ({
  startDraftAction: h.startDraftAction,
  releaseDraftAction: h.releaseDraftAction,
}))

const { POST: regenerate } = await import('@/app/api/drafts/[id]/regenerate-copy/route')
const { PATCH: patch } = await import('@/app/api/drafts/[id]/route')

const ctx = { params: { id: 'd1' } }
const ALL = ['INSTAGRAM', 'LINKEDIN', 'WHATSAPP']

function post(body?: string) {
  return regenerate(new Request('http://test/x', { method: 'POST', body }) as never, ctx as never)
}

function exportedDraft(over: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    teamId: 'team1',
    status: 'EXPORTED',
    pendingAction: null,
    brief: { userId: 'u1', teamId: 'team1', campaignId: null, brandKitId: null, copyProviderKey: null },
    ...over,
  }
}

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset()
  h.draftFindUnique.mockResolvedValue(exportedDraft())
  h.resolveCopyProvider.mockResolvedValue({})
  h.loadDraftCaptions.mockResolvedValue({ captions: [], deferred: false, captionMigration: null })
  h.claimCaptionAction.mockResolvedValue(true)
  h.settleCaptionAction.mockResolvedValue(undefined)
  h.releaseDraftAction.mockResolvedValue(undefined)
  h.startDraftAction.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('regenerate-copy — the body', () => {
  it.each([
    ['absent', undefined],
    ['empty', ''],
    ['whitespace', '  \n'],
  ])('an %s body is {} ("Regenerate all")', async (_name, body) => {
    const res = await post(body)
    expect(res.status).toBe(202)
    expect(h.claimCaptionAction).toHaveBeenCalledWith('d1', ALL)
  })

  it('malformed non-empty JSON is still 400, before anything is read', async () => {
    const res = await post('{not json')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' })
    expect(h.draftFindUnique).not.toHaveBeenCalled()
  })
})

describe('regenerate-copy — a failure never strands the claim', () => {
  it('a throw after the claim (the run never started) settles the target rows, then releases the claim', async () => {
    const order: string[] = []
    h.startDraftAction.mockRejectedValue(new Error('No Claude credential'))
    h.settleCaptionAction.mockImplementation(async () => {
      order.push('settle')
    })
    h.releaseDraftAction.mockImplementation(async () => {
      order.push('release')
    })

    const res = await post(JSON.stringify({ channel: 'LINKEDIN' }))

    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ code: 'COPY_ERROR', message: 'No Claude credential' })
    expect(h.settleCaptionAction).toHaveBeenCalledWith('d1', ['LINKEDIN'], {
      LINKEDIN: { ok: false, reason: 'No Claude credential' },
    })
    expect(h.releaseDraftAction).toHaveBeenCalledWith('d1', 'REGENERATE_COPY', 'No Claude credential')
    // Settled while the claim still holds, so no newer run's rows are touched.
    expect(order).toEqual(['settle', 'release'])
  })

  it('a failure before the claim (provider resolution) claims nothing and settles nothing', async () => {
    h.resolveCopyProvider.mockRejectedValue(new Error('No copy provider'))
    const res = await post('{}')
    expect(res.status).toBe(422)
    expect(h.claimCaptionAction).not.toHaveBeenCalled()
    expect(h.settleCaptionAction).not.toHaveBeenCalled()
    expect(h.releaseDraftAction).not.toHaveBeenCalled()
  })

  it('materializes the rows before claiming them', async () => {
    await post('{}')
    expect(h.loadDraftCaptions.mock.invocationCallOrder[0]).toBeLessThan(
      h.claimCaptionAction.mock.invocationCallOrder[0],
    )
  })

  it('a lost claim is 409 and releases nothing it does not hold', async () => {
    h.claimCaptionAction.mockResolvedValue(false)
    const res = await post('{}')
    expect(res.status).toBe(409)
    expect(h.startDraftAction).not.toHaveBeenCalled()
    expect(h.releaseDraftAction).not.toHaveBeenCalled()
  })
})

describe('PATCH { headline } — refused while something may write the headline', () => {
  function patchHeadline() {
    return patch(
      new Request('http://test/x', { method: 'PATCH', body: JSON.stringify({ headline: 'Mine' }) }) as never,
      ctx as never,
    )
  }

  it.each([
    ['a generation is running (IN_PROGRESS)', { status: 'IN_PROGRESS', headline: null }],
    ['a retry over a draft that has a headline', { status: 'IN_PROGRESS', headline: 'Old' }],
    ['a caption action holds the draft', { pendingAction: 'REGENERATE_COPY' }],
  ])('409 while %s, and nothing is written', async (_name, over) => {
    h.draftFindUnique.mockResolvedValue(exportedDraft(over))
    const res = await patchHeadline()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'This caption is being generated' })
    expect(h.saveHeadlineEdit).not.toHaveBeenCalled()
  })
})
