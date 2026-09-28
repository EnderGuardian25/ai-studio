import { test, expect } from '@playwright/test'
import { loginAs, waitForDraft, waitForAction, type ApiClient } from '../helpers/api'

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const CLIENTX_EMAIL = 'clientx.admin@users.bistec.internal'
const CLIENTX_PASSWORD = 'BistecStudio2026!'

// T18 (change 004 Phase 2) — GET /api/drafts/[id]'s `notApplied` field
// (Ruling E): a top-level, DISTINCT outcome channel from both success and the
// existing `pendingActionError` crash channel —
//   notApplied: { reason, instruction, revisionId, previewUrl, rejectedAt } | null
// re-derived every poll from the retained rejected DraftRevision row (never
// trusted off the stored FK alone). T17 landed the writer side
// (recordRejectedRender / Draft.notAppliedReason+notAppliedRevisionId); this
// suite covers only the T18 poll/UI surface — T21 adds the full fidelity
// catalog on top of the same seams.
//
// Requires: MOCK_AI=true, MOCK_PUPPETEER=true + the seeded 'cli' COPY
// provider (as agui-refinement.test.ts). Deterministic seams
// (src/lib/testHooks.ts):
//   "__VERIFY_FAIL_ALWAYS__" — the mock verifier misses on every attempt, but
//     the refine reply IS a complete document → not-applied WITH a stored
//     export (previewUrl non-null).
//   "__REFINE_TRUNCATED__"   — the reply has no closing </html> on either
//     attempt → not-applied with NO usable document → previewUrl null.

async function createExportedDraft(api: ApiClient) {
  const kitRes = await api.post('/api/admin/brandkits', { name: 'T18 Not-Applied Kit', colors: ['#0284c7'] })
  const kit = await kitRes.json()
  const campRes = await api.post('/api/campaigns', { name: 'T18 Not-Applied Campaign', brandKitId: kit.id })
  const camp = await campRes.json()
  const briefRes = await api.post('/api/briefs', {
    topic: 'T18 Not-Applied Test',
    goal: 'Test the not-applied poll field',
    tone: 'casual',
    channels: ['INSTAGRAM'],
    designMode: 'GENERATE',
    copyProviderKey: 'cli',
    campaignId: camp.id,
  })
  const brief = await briefRes.json()
  // Generation is async: assemble returns 202 { draftId }; poll until EXPORTED.
  const assembleRes = await api.post('/api/generate/assemble-b', { briefId: brief.id })
  if (assembleRes.status() !== 202) return null
  const { draftId } = await assembleRes.json()
  return waitForDraft(api, draftId)
}

// Fire a refine (202) and poll it to completion. Returns the settled draft.
async function refineAndWait(api: ApiClient, draftId: string, instruction: string) {
  const res = await api.post(`/api/drafts/${draftId}/refine`, { instruction })
  expect(res.status()).toBe(202)
  return waitForAction(api, draftId)
}

test.describe('T18 — refine not-applied poll field', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await api.dispose() })

  test('notApplied is null by default on a freshly exported draft', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }

    expect(draft.notApplied).toBeNull()
  })

  test('a twice-failed refine surfaces the exact notApplied shape, with a preview', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }
    const baseline = draft.currentRevisionNumber as number | null

    const settled = await refineAndWait(api, draft.id as string, 'darken it __VERIFY_FAIL_ALWAYS__')
    // A not-applied refine is a CLEAN completion — not the crash channel.
    expect(settled.pendingAction).toBeNull()
    expect(settled.pendingActionError).toBeNull()
    // FR-12: the pointer does not move.
    expect(settled.currentRevisionNumber).toBe(baseline)

    const notApplied = settled.notApplied as Record<string, unknown> | null
    expect(notApplied).toBeTruthy()
    expect(Object.keys(notApplied!).sort()).toEqual([
      'instruction',
      'previewUrl',
      'reason',
      'rejectedAt',
      'revisionId',
    ])
    expect(notApplied!.reason).toMatch(/could not be applied/i)
    expect(notApplied!.instruction).toBe('darken it __VERIFY_FAIL_ALWAYS__')
    expect(typeof notApplied!.revisionId).toBe('string')
    expect(notApplied!.previewUrl).toMatch(/^https?:\/\//)
    expect(new Date(notApplied!.rejectedAt as string).toString()).not.toBe('Invalid Date')
  })

  test('previewUrl is null when the rejected attempt left no usable document', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }

    const settled = await refineAndWait(api, draft.id as string, 'reduce it __REFINE_TRUNCATED__')
    const notApplied = settled.notApplied as Record<string, unknown> | null
    expect(notApplied).toBeTruthy()
    expect(notApplied!.previewUrl).toBeNull()
  })

  test('a later successful refine clears notApplied', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }

    const rejected = await refineAndWait(api, draft.id as string, 'darken it __VERIFY_FAIL_ALWAYS__')
    expect(rejected.notApplied).toBeTruthy()

    const succeeded = await refineAndWait(api, draft.id as string, 'Make the background darker')
    expect(succeeded.pendingActionError).toBeNull()
    expect(succeeded.notApplied).toBeNull()
  })

  test('restoring an earlier revision clears notApplied (T17 concern 4)', async () => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }
    const baseline = draft.currentRevisionNumber as number

    const rejected = await refineAndWait(api, draft.id as string, 'darken it __VERIFY_FAIL_ALWAYS__')
    expect(rejected.notApplied).toBeTruthy()

    const restoreRes = await api.post(`/api/drafts/${draft.id}/revisions/${baseline}/restore`, {})
    expect(restoreRes.status()).toBe(200)

    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.currentRevisionNumber).toBe(baseline)
    expect(after.notApplied).toBeNull()
  })

  test('a cross-team draft is still a 404 (notApplied leaks nothing extra)', async ({ request }) => {
    if (!process.env.MOCK_AI || !process.env.MOCK_PUPPETEER) { test.skip(); return }
    const draft = await createExportedDraft(api)
    if (!draft) { test.skip(); return }
    await refineAndWait(api, draft.id as string, 'darken it __VERIFY_FAIL_ALWAYS__')

    const clientx = await loginAs(request, CLIENTX_EMAIL, CLIENTX_PASSWORD, { team: 'ClientX' })
    try {
      const res = await clientx.get(`/api/drafts/${draft.id}`)
      expect(res.status()).toBe(404)
    } finally {
      await clientx.dispose()
    }
  })
})
