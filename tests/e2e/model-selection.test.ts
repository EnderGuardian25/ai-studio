import { test, expect, type Page } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { loginAs, waitForDraft, waitForAction, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable, readEnvTest } from '../helpers/db'
import { ADMIN_EMAIL, ADMIN_PASSWORD, pageLogin } from '../helpers/ui'

// §Y — Model selection (change 008, wave 1: AC-15 → AC-23).
//
// Contract (spec FR-03 → FR-16):
//   Every model call resolves through one resolver: request > stamp > team
//     default > system default > fallback, each tier checked against the
//     team's effective set at call time.
//   The stamps (FR-08) are the arg that crossed the boundary — the full apiId
//     here, because the mock E2E runs API mode:
//       captions[].model, headlineModel, designModel (= the current revision's
//       DraftRevision.model), each with a …SubstitutedFrom sibling.
//   GET/PUT /api/team/model-policy (team admins) and GET /api/models (members).
//
// Deterministic seams (MOCK_AI + MOCK_PUPPETEER):
//   - every MOCK_AI branch on a model surface records the ResolvedModel it was
//     handed (FR-16); GET /api/test/model-calls reads the ring buffer, DELETE
//     clears it. Each case clears it before the action it asserts on.
//   - stamps are seeded straight into the test DB, as §W does.
//
// Every case that changes a team's policy deletes the TeamModelPolicy row
// afterwards (afterEach), which is the exact "never saved" state, so no later
// suite inherits a changed team.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const PASSWORD = 'BistecStudio2026!'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const CLIENTX_EMAIL = 'clientx.admin@users.bistec.internal'

// The catalogue's apiIds (spec FR-01). API mode passes the apiId, so these
// are exactly the stamps and the recorded args.
const HAIKU = 'claude-haiku-4-5'
const SONNET = 'claude-sonnet-5-5'
const OPUS = 'claude-opus-5-5'

type Key = 'HAIKU' | 'SONNET' | 'OPUS'
type Surface =
  | 'CAPTION'
  | 'DESIGN_TEMPLATE'
  | 'DESIGN_FREEFORM'
  | 'REFINE'
  | 'ASSISTANT_BRIEFING'
  | 'ASSISTANT_BRANDKIT'
  | 'INTERNAL_BACKGROUND'
  | 'INTERNAL_VERIFIER'
  | 'INTERNAL_TOKEN_PING'
type Call = {
  surface: Surface
  key: Key
  arg: string
  mode: 'api' | 'cli'
  source: 'request' | 'stamp' | 'team' | 'system' | 'fallback'
  substitutedFrom: string | null
  label: string | null
}
type Caption = {
  channel: 'INSTAGRAM' | 'LINKEDIN' | 'WHATSAPP'
  text: string
  status: string
  updatedAt: string
  model: string | null
  modelSubstitutedFrom: string | null
}
type Draft = Record<string, unknown>

const ALL: Key[] = ['HAIKU', 'SONNET', 'OPUS']

// ── The recorder ─────────────────────────────────────────────────────────────

const CALLS = '/api/test/model-calls'
async function clearCalls(api: ApiClient) {
  expect((await api.del(CALLS)).status()).toBe(204)
}
async function readCalls(api: ApiClient): Promise<Call[]> {
  const res = await api.get(CALLS)
  expect(res.status()).toBe(200)
  return (await res.json()).calls as Call[]
}
const on = (calls: Call[], surface: Surface) => calls.filter((c) => c.surface === surface)

// Every record on `surface` ran `arg` from `source`, and there is at least one.
function expectRan(calls: Call[], surface: Surface, arg: string, source: Call['source']) {
  const mine = on(calls, surface)
  expect(mine.length, `${surface} was recorded`).toBeGreaterThan(0)
  for (const c of mine) {
    expect(c.arg, `${surface} arg`).toBe(arg)
    expect(c.source, `${surface} source`).toBe(source)
    expect(c.mode, `${surface} mode`).toBe('api')
  }
}

// ── The policy ───────────────────────────────────────────────────────────────

type PolicyBody = {
  allowed: Key[]
  defaults: Partial<Record<Surface, Key | null>>
  requirePersonalTokenForGated: boolean
}
const policy = (over: Partial<PolicyBody> = {}): PolicyBody => ({
  allowed: ALL,
  defaults: {},
  requirePersonalTokenForGated: false,
  ...over,
})
async function putPolicy(api: ApiClient, body: PolicyBody) {
  const res = await api.put('/api/team/model-policy', body)
  expect(res.status(), JSON.stringify(await res.json())).toBe(200)
}
const activeTeamId = async (api: ApiClient): Promise<string> =>
  (await (await api.get('/api/me')).json()).activeTeamId as string
async function resetPolicy(teamId: string | null) {
  if (teamId && prisma) await prisma.teamModelPolicy.deleteMany({ where: { teamId } })
}

// ── Drafts ───────────────────────────────────────────────────────────────────

const captionsOf = (d: Draft) => d.captions as Caption[]
const captionOf = (d: Draft, channel: Caption['channel']) => captionsOf(d).find((c) => c.channel === channel)!
const read = async (api: ApiClient, id: unknown): Promise<Draft> => (await api.get(`/api/drafts/${id}`)).json()
const revisionModel = async (draftId: string, revisionNumber: number) =>
  prisma!.draftRevision.findFirstOrThrow({
    where: { draftId, revisionNumber },
    select: { model: true, modelSubstitutedFrom: true },
  })

// One kit (with a square template) + campaign per worker, shared by the suite.
let fixture: { kitId: string; templateId: string; campaignId: string } | null = null
async function suiteFixture(api: ApiClient) {
  if (fixture) return fixture
  const stamp = Date.now()
  const kit = await (await api.post('/api/admin/brandkits', { name: `Models Kit ${stamp}`, colors: ['#0b6e4f'] })).json()
  const template = await (
    await api.post(`/api/admin/brandkits/${kit.id}/templates`, {
      name: `Models Template ${stamp}`,
      htmlTemplate: '<html><body style="width:1080px;height:1080px;background:#0b6e4f;color:#fff">{{topic}}</body></html>',
    })
  ).json()
  const camp = await (await api.post('/api/campaigns', { name: `Models Camp ${stamp}`, brandKitId: kit.id })).json()
  fixture = { kitId: kit.id, templateId: template.id, campaignId: camp.id }
  return fixture
}

async function generate(api: ApiClient, path: 'A' | 'B', topic: string): Promise<Draft> {
  const f = await suiteFixture(api)
  const brief = await api.post('/api/briefs', {
    topic,
    goal: 'g',
    tone: 'professional',
    channels: ['INSTAGRAM'],
    designMode: path === 'A' ? 'TEMPLATE' : 'GENERATE',
    copyProviderKey: 'cli',
    campaignId: f.campaignId,
  })
  expect(brief.status()).toBe(201)
  const briefId = (await brief.json()).id
  const res =
    path === 'A'
      ? await api.post('/api/generate/assemble-a', { briefId, templateId: f.templateId })
      : await api.post('/api/generate/assemble-b', { briefId })
  expect(res.status()).toBe(202)
  const draft = await waitForDraft(api, (await res.json()).draftId)
  expect(draft.status, String(draft.failureReason)).toBe('EXPORTED')
  return draft
}

async function act(api: ApiClient, id: unknown, path: string, body: unknown): Promise<Draft> {
  const res = await api.post(`/api/drafts/${id}/${path}`, body)
  expect(res.status(), `${path} → ${await res.text()}`).toBe(202)
  const done = await waitForAction(api, id as string)
  expect(done.pendingActionError, `${path} settled cleanly`).toBeNull()
  return done
}

// ── AC-15 → AC-21: the stamps, the policy and the recorder ───────────────────

test.describe('§Y — model selection: stamps, policy and the recorder', () => {
  let api: ApiClient
  let teamId: string | null = null
  test.beforeEach(async ({ request }) => {
    test.skip(!dbAvailable, 'requires test DB access')
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    teamId = await activeTeamId(api)
    await resetPolicy(teamId)
  })
  test.afterEach(async () => {
    await resetPolicy(teamId)
    await api?.dispose()
  })

  // TC-MODEL-01 — AC-15 (FR-08, FR-04): a Path B generation on system defaults.
  test('a Path B draft stamps Haiku on the captions and the headline and Sonnet on the design', async () => {
    if (!MOCKED()) { test.skip(); return }
    await clearCalls(api)
    const draft = await generate(api, 'B', `Models PathB ${Date.now()}`)

    expect(captionsOf(draft)).toHaveLength(3)
    for (const c of captionsOf(draft)) {
      expect(c.model, c.channel).toBe(HAIKU)
      expect(c.modelSubstitutedFrom, c.channel).toBeNull()
    }
    expect(draft.headlineModel).toBe(HAIKU)
    expect(draft.headlineModelSubstitutedFrom).toBeNull()
    expect(draft.designModel).toBe(SONNET)
    expect(draft.designModelSubstitutedFrom).toBeNull()
    expect(await revisionModel(draft.id as string, 1)).toEqual({ model: SONNET, modelSubstitutedFrom: null })
    // The revisions list carries the stamp too (FR-16, additive).
    const revisions = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(revisions.map((r: { revisionNumber: number; model: string }) => [r.revisionNumber, r.model])).toEqual([[1, SONNET]])

    const calls = await readCalls(api)
    expectRan(calls, 'CAPTION', HAIKU, 'system')
    expectRan(calls, 'DESIGN_FREEFORM', SONNET, 'system')
    expect(on(calls, 'CAPTION').every((c) => c.key === 'HAIKU' && c.substitutedFrom === null)).toBe(true)
  })

  // TC-MODEL-02 — AC-15 (FR-08): a Path A generation runs template fill on Haiku.
  test('a Path A draft stamps Haiku on the design (template fill)', async () => {
    if (!MOCKED()) { test.skip(); return }
    await clearCalls(api)
    const draft = await generate(api, 'A', `Models PathA ${Date.now()}`)

    expect(draft.designModel).toBe(HAIKU)
    expect(await revisionModel(draft.id as string, 1)).toEqual({ model: HAIKU, modelSubstitutedFrom: null })
    const calls = await readCalls(api)
    expectRan(calls, 'DESIGN_TEMPLATE', HAIKU, 'system')
    expect(on(calls, 'DESIGN_FREEFORM')).toEqual([])
  })

  // TC-MODEL-03 — AC-16 (FR-05, FR-13): a team default reaches the next generation.
  test('a team DESIGN_FREEFORM default of Opus makes the next generation design on Opus', async () => {
    if (!MOCKED()) { test.skip(); return }
    const res = await api.put('/api/team/model-policy', policy({ defaults: { DESIGN_FREEFORM: 'OPUS' } }))
    expect(res.status()).toBe(200)
    const saved = await res.json()
    expect(saved.saved).toBe(true)
    expect(saved.defaults.DESIGN_FREEFORM).toBe('OPUS')
    expect(saved.defaults.CAPTION).toBeNull()

    await clearCalls(api)
    const draft = await generate(api, 'B', `Models TeamOpus ${Date.now()}`)
    expect(draft.designModel).toBe(OPUS)
    expect(draft.designModelSubstitutedFrom).toBeNull()
    expect(await revisionModel(draft.id as string, 1)).toEqual({ model: OPUS, modelSubstitutedFrom: null })
    // Only the surface with a team default moved.
    expect(captionOf(draft, 'INSTAGRAM').model).toBe(HAIKU)

    const calls = await readCalls(api)
    expectRan(calls, 'DESIGN_FREEFORM', OPUS, 'team')
    expectRan(calls, 'CAPTION', HAIKU, 'system')
  })

  // TC-MODEL-04 — AC-16 (FR-05, FR-13, FR-16): validation, permissions, the
  // picker view, the recorder's gate.
  test('the policy PUT refuses invalid policies and editors; GET /api/models carries no ID or price', async ({ request }) => {
    const before = await (await api.get('/api/team/model-policy')).json()
    expect(before).toMatchObject({ allowed: ALL, saved: false, requirePersonalTokenForGated: false, newModels: [] })

    const opusOnly = await api.put('/api/team/model-policy', policy({ allowed: ['OPUS'] }))
    expect(opusOnly.status()).toBe(400)
    expect((await opusOnly.json()).error).toBe('Template fill needs Haiku or Sonnet allowed')

    const outside = await api.put(
      '/api/team/model-policy',
      policy({ allowed: ['HAIKU', 'SONNET'], defaults: { DESIGN_FREEFORM: 'OPUS' } }),
    )
    expect(outside.status()).toBe(400)
    expect((await outside.json()).error).toBeTruthy()

    // Closed vocabularies at the boundary (NFR-05).
    expect((await api.put('/api/team/model-policy', policy({ allowed: ['opus' as Key] }))).status()).toBe(400)
    expect((await api.put('/api/team/model-policy', { ...policy(), teamId: 'x' })).status()).toBe(400)

    // Nothing above was written.
    expect((await (await api.get('/api/team/model-policy')).json()).saved).toBe(false)

    const editor = await loginAs(request, EDITOR_EMAIL, PASSWORD)
    try {
      expect((await editor.put('/api/team/model-policy', policy())).status()).toBe(403)
      expect((await editor.get('/api/team/model-policy')).status()).toBe(403)
      // Any member reads the picker view; it never names an apiId or a price.
      const view = await editor.get('/api/models')
      expect(view.status()).toBe(200)
      const body = await view.json()
      expect(body.mode).toBe('api')
      expect(body.credential).toBe('n/a')
      expect(body.allowed).toEqual(ALL)
      expect(body.catalogue.map((e: { key: Key; tier: string }) => [e.key, e.tier])).toEqual([
        ['HAIKU', '$'],
        ['SONNET', '$$'],
        ['OPUS', '$$$'],
      ])
      const opus = body.catalogue.find((e: { key: Key }) => e.key === 'OPUS')
      expect(opus.surfaces).not.toContain('DESIGN_TEMPLATE')
      const text = JSON.stringify(body)
      expect(text).not.toMatch(/claude-/)
      expect(text).not.toMatch(/price/i)
      // The recorder seam is admin-only.
      expect((await editor.get(CALLS)).status()).toBe(403)
    } finally {
      await editor.dispose()
    }
  })

  // TC-MODEL-05 — AC-16 (FR-13): team B's policy never reaches team A.
  test("ClientX's Opus default leaves Bistec's generations on Sonnet", async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const clientx = await loginAs(request, CLIENTX_EMAIL, PASSWORD, { team: 'ClientX' })
    const clientxTeam = await activeTeamId(clientx)
    expect(clientxTeam).not.toBe(teamId)
    try {
      await putPolicy(clientx, policy({ defaults: { DESIGN_FREEFORM: 'OPUS', CAPTION: 'SONNET' } }))
      expect((await (await clientx.get('/api/team/model-policy')).json()).defaults.DESIGN_FREEFORM).toBe('OPUS')
      // Bistec's own policy is untouched: still never saved.
      expect((await (await api.get('/api/team/model-policy')).json()).saved).toBe(false)

      await clearCalls(api)
      const draft = await generate(api, 'B', `Models Isolation ${Date.now()}`)
      expect(draft.designModel).toBe(SONNET)
      expect(captionOf(draft, 'LINKEDIN').model).toBe(HAIKU)
      const calls = await readCalls(api)
      expectRan(calls, 'DESIGN_FREEFORM', SONNET, 'system')
      expectRan(calls, 'CAPTION', HAIKU, 'system')
    } finally {
      await resetPolicy(clientxTeam)
      await clientx.dispose()
    }
  })

  // TC-MODEL-06 — AC-17 (FR-03, FR-09, security BLOCK): removing Opus applies
  // to stored stamps, not just to new requests.
  test('after Opus is removed, an Opus-stamped design and caption regenerate on the defaults, recorded as substitutions', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await generate(api, 'B', `Models Removal ${Date.now()}`)
    const id = draft.id as string
    await prisma!.draft.update({ where: { id }, data: { designModel: OPUS } })
    await prisma!.draftCaption.update({
      where: { draftId_channel: { draftId: id, channel: 'LINKEDIN' } },
      data: { model: OPUS },
    })
    const seeded = await read(api, id)
    expect(seeded.designModel).toBe(OPUS)
    expect(captionOf(seeded, 'LINKEDIN').model).toBe(OPUS)

    await putPolicy(api, policy({ allowed: ['HAIKU', 'SONNET'] }))
    await clearCalls(api)

    const designed = await act(api, id, 'regenerate-design', {})
    expect(designed.currentRevisionNumber).toBe(2)
    expect(designed.designModel).toBe(SONNET)
    expect(designed.designModelSubstitutedFrom).toBe(OPUS)
    expect(await revisionModel(id, 2)).toEqual({ model: SONNET, modelSubstitutedFrom: OPUS })

    const recaptioned = await act(api, id, 'regenerate-copy', { channel: 'LINKEDIN' })
    expect(captionOf(recaptioned, 'LINKEDIN')).toMatchObject({ model: HAIKU, modelSubstitutedFrom: OPUS })
    // The other rows were never written: same stamp, same updatedAt.
    for (const channel of ['INSTAGRAM', 'WHATSAPP'] as const) {
      expect(captionOf(recaptioned, channel)).toEqual(captionOf(seeded, channel))
    }
    expect(recaptioned.designModel).toBe(SONNET) // a caption action leaves the design stamp

    const calls = await readCalls(api)
    expect(calls.filter((c) => c.key === 'OPUS' || c.arg === OPUS)).toEqual([])
    expect(on(calls, 'DESIGN_FREEFORM').map((c) => [c.arg, c.source, c.substitutedFrom])).toEqual([[SONNET, 'system', OPUS]])
    expect(on(calls, 'CAPTION').map((c) => [c.arg, c.source, c.substitutedFrom])).toEqual([[HAIKU, 'system', OPUS]])
  })

  // TC-MODEL-07 — AC-18 (FR-09): Regenerate all is like for like, by the stamps.
  test('Regenerate all keeps a uniform stamp, uses the team default on mixed stamps, and the system default on null ones', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await generate(api, 'B', `Models LikeForLike ${Date.now()}`)
    const id = draft.id as string
    const setStamps = async (models: [string | null, string | null, string | null]) => {
      const channels = ['INSTAGRAM', 'LINKEDIN', 'WHATSAPP'] as const
      for (const [i, channel] of channels.entries()) {
        await prisma!.draftCaption.update({
          where: { draftId_channel: { draftId: id, channel } },
          data: { model: models[i], modelSubstitutedFrom: null },
        })
      }
    }
    const stampsOf = (d: Draft) => captionsOf(d).map((c) => [c.model, c.modelSubstitutedFrom])

    // (a) Three equal stamps: the stamp tier.
    await setStamps([SONNET, SONNET, SONNET])
    await clearCalls(api)
    let done = await act(api, id, 'regenerate-copy', {})
    expect(stampsOf(done)).toEqual([[SONNET, null], [SONNET, null], [SONNET, null]])
    expectRan(await readCalls(api), 'CAPTION', SONNET, 'stamp')

    // (b) Mixed stamps (Opus allowed) and a team CAPTION default of Haiku: no
    // stamp tier, the team default, and no substitution recorded.
    await putPolicy(api, policy({ defaults: { CAPTION: 'HAIKU' } }))
    await setStamps([SONNET, OPUS, SONNET])
    await clearCalls(api)
    done = await act(api, id, 'regenerate-copy', {})
    expect(stampsOf(done)).toEqual([[HAIKU, null], [HAIKU, null], [HAIKU, null]])
    let calls = await readCalls(api)
    expectRan(calls, 'CAPTION', HAIKU, 'team')
    expect(on(calls, 'CAPTION').every((c) => c.substitutedFrom === null)).toBe(true)

    // (c) Null stamps (a pre-008 draft) with no team default: the system default.
    await resetPolicy(teamId)
    await setStamps([null, null, null])
    await clearCalls(api)
    done = await act(api, id, 'regenerate-copy', {})
    expect(stampsOf(done)).toEqual([[HAIKU, null], [HAIKU, null], [HAIKU, null]])
    calls = await readCalls(api)
    expectRan(calls, 'CAPTION', HAIKU, 'system')
    expect(on(calls, 'CAPTION').every((c) => c.substitutedFrom === null)).toBe(true)
    // Regenerate all never touches the headline or its stamp.
    expect(done.headlineModel).toBe(HAIKU)
    expect(done.headline).toBe(draft.headline)
  })

  // TC-MODEL-08 — AC-19 (FR-08, A8): refine by path, the Haiku verifier, a team
  // REFINE default, and restore.
  test('refine runs Sonnet on Path B with a Haiku verifier, Haiku on Path A, Opus by team default, and restore brings back the old stamp', async () => {
    if (!MOCKED()) { test.skip(); return }
    const b = await generate(api, 'B', `Models Refine B ${Date.now()}`)
    const bId = b.id as string
    await clearCalls(api)
    // An "add" instruction: a bare mock document defaults to the add class,
    // whose post-condition is the verifier (004 TC-FID-09).
    let done = await act(api, bId, 'refine', { instruction: 'Include a human character' })
    expect(done.currentRevisionNumber).toBe(2)
    expect(await revisionModel(bId, 2)).toEqual({ model: SONNET, modelSubstitutedFrom: null })
    expect(done.designModel).toBe(SONNET)
    let calls = await readCalls(api)
    expectRan(calls, 'REFINE', SONNET, 'system')
    expectRan(calls, 'INTERNAL_VERIFIER', HAIKU, 'system')
    expect(on(calls, 'INTERNAL_VERIFIER').every((c) => c.key === 'HAIKU' && c.label === 'verify')).toBe(true)

    // Path A: the REFINE system default follows the draft's path.
    const a = await generate(api, 'A', `Models Refine A ${Date.now()}`)
    await clearCalls(api)
    const aDone = await act(api, a.id, 'refine', { instruction: 'Make the background darker' })
    expect(aDone.currentRevisionNumber).toBe(2)
    expect(await revisionModel(a.id as string, 2)).toEqual({ model: HAIKU, modelSubstitutedFrom: null })
    expect(aDone.designModel).toBe(HAIKU)
    expectRan(await readCalls(api), 'REFINE', HAIKU, 'system')

    // A team REFINE default of Opus.
    await putPolicy(api, policy({ defaults: { REFINE: 'OPUS' } }))
    await clearCalls(api)
    done = await act(api, bId, 'refine', { instruction: 'Make the headline bolder' })
    expect(done.currentRevisionNumber).toBe(3)
    expect(await revisionModel(bId, 3)).toEqual({ model: OPUS, modelSubstitutedFrom: null })
    expect(done.designModel).toBe(OPUS)
    calls = await readCalls(api)
    expectRan(calls, 'REFINE', OPUS, 'team')
    // The verifier is internal: never the team's choice.
    for (const c of on(calls, 'INTERNAL_VERIFIER')) expect(c.arg).toBe(HAIKU)

    // Restore revision 1: the draft's design stamp is that revision's own.
    const restore = await api.post(`/api/drafts/${bId}/revisions/1/restore`, {})
    expect(restore.status()).toBe(200)
    const restored = await read(api, bId)
    expect(restored.currentRevisionNumber).toBe(1)
    expect(restored.designModel).toBe(SONNET)
    expect(restored.designModelSubstitutedFrom).toBeNull()
  })

  // TC-MODEL-09 — AC-20 (FR-11): the scheduler and ACP use the team default.
  test('a scheduled HOLD entry and ACP generate_post both design on the team default', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    await putPolicy(api, policy({ defaults: { DESIGN_FREEFORM: 'OPUS' } }))

    // The scheduler (userId null → credential 'team'; API mode, so not gated).
    const f = await suiteFixture(api)
    const entryRes = await api.post(`/api/campaigns/${f.campaignId}/queue`, {
      topic: `Models Scheduled ${Date.now()}`,
      goal: 'Awareness',
      tone: 'professional',
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      generateAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
      postAction: 'HOLD',
    })
    expect(entryRes.status()).toBe(201)
    const entry = await entryRes.json()
    await prisma!.scheduledGeneration.update({
      where: { id: entry.id },
      data: { generateAt: new Date(Date.now() - 1000), nextRetryAt: null },
    })
    await clearCalls(api)
    expect((await api.post('/api/test/generation-tick', {})).status()).toBe(200)
    const after = await prisma!.scheduledGeneration.findUniqueOrThrow({ where: { id: entry.id } })
    expect(after.status).toBe('COMPLETED')
    expect(after.errorReason).toBeNull()
    const scheduled = await read(api, after.draftId)
    expect(scheduled.status).toBe('EXPORTED')
    expect(scheduled.designModel).toBe(OPUS)
    expect(await revisionModel(after.draftId!, 1)).toEqual({ model: OPUS, modelSubstitutedFrom: null })
    const tickCalls = (await readCalls(api)).filter((c) => c.surface === 'DESIGN_FREEFORM' && c.arg === OPUS)
    expect(tickCalls.length).toBeGreaterThan(0)
    expect(tickCalls.every((c) => c.source === 'team')).toBe(true)

    // ACP generate_post, on a team API key. The `request` fixture carries no
    // session, so the key is the only credential. An unknown `model` in the
    // input is ignored (FR-11: MCP/ACP have no model input).
    const created = await (await api.post('/api/team/api-keys', { label: `Models suite ${Date.now()}` })).json()
    try {
      await clearCalls(api)
      const gen = await request.post('/api/acp/run', {
        headers: { 'x-bistec-api-key': created.plaintext },
        data: {
          capability: 'generate_post',
          input: {
            topic: `Models ACP ${Date.now()}`,
            goal: 'Drive signups',
            tone: 'professional',
            channels: ['INSTAGRAM'],
            designMode: 'GENERATE',
            model: 'HAIKU',
          },
        },
      })
      expect(gen.status()).toBe(200)
      const { draftId } = (await gen.json()).output
      const acpDraft = await read(api, draftId)
      expect(acpDraft.designModel).toBe(OPUS)
      expect(captionOf(acpDraft, 'INSTAGRAM').model).toBe(HAIKU)
      expectRan(await readCalls(api), 'DESIGN_FREEFORM', OPUS, 'team')
    } finally {
      await api.del(`/api/team/api-keys/${created.id}`)
    }
  })

  // TC-MODEL-10 — AC-21 (FR-02, A7): the assistants and the stamp-less
  // surfaces record Sonnet (system), then Haiku (team) after a team default.
  test('the briefing chat, both Enhances, the brand-kit chat, image → template and both voice drafts follow the assistant defaults', async () => {
    if (!MOCKED()) { test.skip(); return }
    const f = await suiteFixture(api)
    const kitId = f.kitId
    // The improve route needs an active voice prompt to improve.
    expect((await api.post(`/api/admin/brandkits/${kitId}/prompts`, { content: 'You are the Models voice.' })).status()).toBe(201)
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    )

    const surfaces: { what: string; surface: Surface; label: string; run: () => Promise<number> }[] = [
      {
        what: 'campaign briefing chat',
        surface: 'ASSISTANT_BRIEFING',
        label: 'briefing',
        run: async () =>
          (await api.post(`/api/campaigns/${f.campaignId}/briefing/chat`, {
            messages: [{ role: 'user', content: 'Plan the launch' }],
          })).status(),
      },
      {
        what: 'campaign Enhance',
        surface: 'ASSISTANT_BRIEFING',
        label: 'briefing',
        run: async () =>
          (await api.post(`/api/campaigns/${f.campaignId}/briefing/enhance`, { content: 'rough briefing' })).status(),
      },
      {
        what: 'post-brief Enhance',
        surface: 'ASSISTANT_BRIEFING',
        label: 'briefing',
        run: async () =>
          (await api.post('/api/briefs/enhance', { topic: 'Models', content: 'rough post brief', campaignId: f.campaignId })).status(),
      },
      {
        what: 'brand-kit assistant chat',
        surface: 'ASSISTANT_BRANDKIT',
        label: 'brandkit',
        run: async () =>
          (await api.post(`/api/admin/brandkits/${kitId}/assistant/chat`, {
            messages: [{ role: 'user', content: 'Extract the brand voice' }],
          })).status(),
      },
      {
        what: 'image → template',
        surface: 'ASSISTANT_BRANDKIT',
        label: 'image-template',
        run: async () =>
          (await api.multipart(`/api/admin/brandkits/${kitId}/templates/from-image`, {
            file: { name: 'ref.png', mimeType: 'image/png', buffer: png },
          })).status(),
      },
      {
        what: 'voice draft (generate)',
        surface: 'ASSISTANT_BRANDKIT',
        label: 'brand-voice',
        run: async () =>
          (await api.post(`/api/admin/brandkits/${kitId}/prompts/generate`, { description: 'A calm, precise voice' })).status(),
      },
      {
        what: 'voice draft (improve)',
        surface: 'ASSISTANT_BRANDKIT',
        label: 'brand-voice',
        run: async () => (await api.post(`/api/admin/brandkits/${kitId}/prompts/improve`, {})).status(),
      },
    ]

    const runAll = async (arg: string, source: Call['source']) => {
      for (const s of surfaces) {
        await clearCalls(api)
        expect(await s.run(), s.what).toBe(200)
        const calls = await readCalls(api)
        expect(calls.map((c) => [c.surface, c.arg, c.source, c.label]), s.what).toEqual([[s.surface, arg, source, s.label]])
      }
    }

    await runAll(SONNET, 'system')
    await putPolicy(api, policy({ defaults: { ASSISTANT_BRIEFING: 'HAIKU', ASSISTANT_BRANDKIT: 'HAIKU' } }))
    await runAll(HAIKU, 'team')
  })
})

// ── AC-22: /team → Models ────────────────────────────────────────────────────

// 014's AC-19 axe rules (a11y.test.ts, T18). Copied, not imported: importing a
// spec file would register its tests a second time (the §W precedent).
const AXE_RULES = [
  'label',
  'select-name',
  'aria-input-field-name',
  'aria-toggle-field-name',
  'button-name',
  'link-name',
  'page-has-heading-one',
  'scrollable-region-focusable',
  'target-size',
  'aria-allowed-attr',
  'aria-valid-attr-value',
  'aria-required-attr',
]
async function expectNoAxeViolations(page: Page, what: string) {
  if (!(await page.evaluate(() => 'axe' in window))) {
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
  }
  const violations = await page.evaluate(async (rules) => {
    const { axe } = window as unknown as { axe: typeof import('axe-core') }
    const result = await axe.run(document, { runOnly: { type: 'rule', values: rules } })
    return result.violations.flatMap((v) => v.nodes.map((node) => `${v.id}: ${node.target.join(' ')}`))
  }, AXE_RULES)
  expect(violations, `axe (014 AC-19) on ${what}`).toEqual([])
}

test.describe('§Y — /team → Models', () => {
  let api: ApiClient
  let teamId: string | null = null
  test.beforeEach(async ({ request }) => {
    test.skip(!dbAvailable, 'requires test DB access')
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    teamId = await activeTeamId(api)
    await resetPolicy(teamId)
  })
  test.afterEach(async () => {
    await resetPolicy(teamId)
    await api?.dispose()
  })

  // TC-MODEL-11 — AC-22 (FR-14).
  test('the Models section names every control, saves an Opus-less list, and shows the template-fill 400 inline', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/team')

    await expect(page.getByRole('heading', { level: 2, name: 'Models', exact: true })).toBeVisible({ timeout: 20_000 })
    const models = page.getByRole('region', { name: 'Models', exact: true })
    const save = models.getByRole('button', { name: 'Save', exact: true })
    await expect(save).toBeVisible()

    // Every control has an accessible name.
    const allowed = models.getByRole('group', { name: 'Allowed models', exact: true })
    const haiku = allowed.getByRole('checkbox', { name: 'Haiku 4.5 · $ · fast', exact: true })
    const sonnet = allowed.getByRole('checkbox', { name: 'Sonnet 5.5 · $$ · medium', exact: true })
    const opus = allowed.getByRole('checkbox', { name: 'Opus 5.5 · $$$ · slow', exact: true })
    await expect(allowed.getByRole('checkbox')).toHaveCount(3)
    for (const box of [haiku, sonnet, opus]) await expect(box).toBeChecked()
    const defaults = models.getByRole('group', { name: 'Defaults', exact: true })
    await expect(defaults.getByRole('combobox')).toHaveCount(6)
    const systemDefaults: [string, string][] = [
      ['Captions', 'Haiku 4.5'],
      ['Template fill (Path A)', 'Haiku 4.5'],
      ['Freeform design (Path B)', 'Sonnet 5.5'],
      ['Refine', 'Sonnet 5.5'],
      ['Campaign briefing assistant', 'Sonnet 5.5'],
      ['Brand-kit assistant', 'Sonnet 5.5'],
    ]
    for (const [name, model] of systemDefaults) {
      const select = defaults.getByRole('combobox', { name, exact: true })
      await expect(select).toHaveCount(1)
      await expect(select.locator('option').first()).toHaveText(`System default (${model})`)
    }
    // Template fill never offers Opus.
    await expect(defaults.getByRole('combobox', { name: 'Template fill (Path A)', exact: true }).locator('option')).toHaveText([
      'System default (Haiku 4.5)',
      'Haiku 4.5',
      'Sonnet 5.5',
    ])
    // The switch: named, described, and disabled in API mode.
    const gate = models.getByRole('checkbox', { name: 'Opus requires a personal token', exact: true })
    await expect(gate).toBeDisabled()
    await expect(gate).toHaveAccessibleDescription(/Scheduled posts, MCP and ACP always use the team token\..*Only applies in CLI mode\./)
    await expectNoAxeViolations(page, '/team (Models section)')

    // Untick Opus and save: the GET shows it, and Opus is now a "New" entry.
    await opus.uncheck()
    await save.click()
    await expect(page.getByText('Models saved', { exact: true })).toBeVisible()
    await expect
      .poll(async () => (await (await api.get('/api/team/model-policy')).json()).allowed)
      .toEqual(['HAIKU', 'SONNET'])
    const stored = await (await api.get('/api/team/model-policy')).json()
    expect(stored).toMatchObject({ saved: true, newModels: ['OPUS'] })
    await expect(opus).not.toBeChecked()
    await expect(models.getByText('New', { exact: true })).toHaveCount(1)

    // Only Opus ticked: the server's 400, inline, and nothing saved.
    await opus.check()
    await haiku.uncheck()
    await sonnet.uncheck()
    await expect(defaults.getByRole('combobox', { name: 'Template fill (Path A)', exact: true }).locator('option').first()).toHaveText(
      'System default (none allowed)',
    )
    await save.click()
    const error = models.getByTestId('models-save-error')
    await expect(error).toBeVisible()
    await expect(error).toHaveRole('alert')
    await expect(error).toHaveText('Template fill needs Haiku or Sonnet allowed')
    expect((await (await api.get('/api/team/model-policy')).json()).allowed).toEqual(['HAIKU', 'SONNET'])
    await expectNoAxeViolations(page, '/team (Models section, save error showing)')
  })
})

// ── AC-23: the migration and its rollback ───────────────────────────────────

// The test DB URL, and a refusal to go on with anything else: the rollback
// must never meet the dev DB.
function testDbUrl(): string {
  const url = readEnvTest('DATABASE_URL')
  if (!url || !new URL(url).pathname.endsWith('_test')) {
    throw new Error(`refusing to run against a non-test database (${url ? new URL(url).pathname : 'unset'})`)
  }
  return url
}

function envTestVars(): Record<string, string> {
  const vars: Record<string, string> = {}
  try {
    for (const line of readFileSync(resolve(process.cwd(), '.env.test'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (m) vars[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  } catch {
    // .env.test absent.
  }
  return vars
}

// As §W's run(): .env.test wins over the runner's environment, and
// DATABASE_URL is pinned explicitly, last.
function run(cmd: string, databaseUrl: string): { status: number | null; output: string } {
  const res = spawnSync(cmd, {
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, ...envTestVars(), DATABASE_URL: databaseUrl },
    timeout: 120_000,
  })
  return { status: res.status, output: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}

// What 20261012120000_model_selection adds (spec FR-06): the ten columns, the
// two tables, the two enum types and its own migration row.
const ADDED_COLUMNS: [string, string][] = [
  ['Brief', 'captionModel'],
  ['Brief', 'designModel'],
  ['Draft', 'headlineModel'],
  ['Draft', 'headlineModelSubstitutedFrom'],
  ['Draft', 'designModel'],
  ['Draft', 'designModelSubstitutedFrom'],
  ['DraftRevision', 'model'],
  ['DraftRevision', 'modelSubstitutedFrom'],
  ['DraftCaption', 'model'],
  ['DraftCaption', 'modelSubstitutedFrom'],
]
const MIGRATION = '20261012120000_model_selection'

type Shape = { columns: string[]; tables: string[]; types: string[]; migration: number }
async function shapeOf(db: PrismaClient): Promise<Shape> {
  const columns = await db.$queryRaw<{ c: string }[]>`
    SELECT table_name || '.' || column_name || ' ' || data_type || '/' || udt_name || ' ' || is_nullable AS c
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (table_name IN ('TeamModelPolicy', 'TeamModelDefault')
        OR (table_name, column_name) IN (
          ('Brief','captionModel'), ('Brief','designModel'),
          ('Draft','headlineModel'), ('Draft','headlineModelSubstitutedFrom'),
          ('Draft','designModel'), ('Draft','designModelSubstitutedFrom'),
          ('DraftRevision','model'), ('DraftRevision','modelSubstitutedFrom'),
          ('DraftCaption','model'), ('DraftCaption','modelSubstitutedFrom')))
    ORDER BY 1`
  const tables = await db.$queryRaw<{ t: string }[]>`
    SELECT table_name AS t FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('TeamModelPolicy', 'TeamModelDefault') ORDER BY 1`
  const types = await db.$queryRaw<{ t: string }[]>`
    SELECT typname AS t FROM pg_type WHERE typname IN ('ModelKey', 'ModelSurface') ORDER BY 1`
  const migration = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM "_prisma_migrations" WHERE migration_name = ${MIGRATION} AND finished_at IS NOT NULL`
  return {
    columns: columns.map((r) => r.c),
    tables: tables.map((r) => r.t),
    types: types.map((r) => r.t),
    migration: Number(migration[0].n),
  }
}

test.describe('§Y — the 008 migration round trip (AC-23)', () => {
  test.beforeEach(() => {
    test.skip(!dbAvailable, 'requires test DB access')
  })

  // TC-MODEL-12 — AC-23 (FR-06), on a scratch database.
  //
  // AC-23 names a TEMPLATE copy of the test DB. CREATE DATABASE … TEMPLATE
  // needs the source to have no other sessions, and the running test server
  // holds connections to the test DB, so inside the suite the scratch DB is
  // built from empty by the same `prisma migrate deploy` the test DB was (an
  // identical schema, proven by comparing the two shapes below) — §W's
  // TC-CAP-13 precedent. The literal TEMPLATE run is a scripted step with the
  // server stopped, recorded in reports/T12.md.
  test('the down script removes every added object and its migration row, and migrate deploy re-applies 008', async () => {
    test.setTimeout(240_000)
    const testUrl = testDbUrl()
    const scratchName = 'bistec_studio_test_008_rollback'
    const scratch = new URL(testUrl)
    scratch.pathname = `/${scratchName}`
    const scratchUrl = scratch.toString()

    await prisma!.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`)
    await prisma!.$executeRawUnsafe(`CREATE DATABASE "${scratchName}"`)
    const db = new PrismaClient({ datasources: { db: { url: scratchUrl } } })
    try {
      const migrate = run('npx prisma migrate deploy', scratchUrl)
      expect(migrate.status, migrate.output).toBe(0)

      const forward = await shapeOf(db)
      expect(forward.columns).toHaveLength(ADDED_COLUMNS.length + 4 + 3) // + TeamModelPolicy's 4, TeamModelDefault's 3
      expect(forward.tables).toEqual(['TeamModelDefault', 'TeamModelPolicy'])
      expect(forward.types).toEqual(['ModelKey', 'ModelSurface'])
      expect(forward.migration).toBe(1)
      // The scratch schema is the test DB's own (the same migrations).
      expect(forward).toEqual(await shapeOf(prisma!))

      // Rows in every added object, so the down runs against data.
      const stamp = Date.now()
      const team = await db.team.create({ data: { name: `Rollback 008 ${stamp}` } })
      const user = await db.user.create({ data: { name: 'Rollback 008', email: `rollback-008-${stamp}@example.test` } })
      await db.teamModelPolicy.create({
        data: { teamId: team.id, allowedModels: ['HAIKU', 'SONNET'], defaults: { create: [{ surface: 'CAPTION', model: 'HAIKU' }] } },
      })
      const brief = await db.brief.create({
        data: {
          teamId: team.id,
          userId: user.id,
          topic: 'Rollback 008',
          goal: 'g',
          tone: 'professional',
          channels: ['INSTAGRAM'],
          designMode: 'GENERATE',
          copyProviderKey: 'cli',
          captionModel: 'HAIKU',
          designModel: 'OPUS',
        },
      })
      const draft = await db.draft.create({
        data: {
          teamId: team.id,
          briefId: brief.id,
          headline: 'Rollback',
          headlineModel: HAIKU,
          designModel: SONNET,
          designModelSubstitutedFrom: 'OPUS',
          captions: { create: [{ channel: 'INSTAGRAM', text: 'IG', status: 'READY', model: HAIKU }] },
          revisions: { create: [{ revisionNumber: 1, instruction: 'Original design', htmlSnapshot: '<html></html>', model: SONNET }] },
        },
      })

      const down = run(
        `npx prisma db execute --file prisma/rollback/008-model-selection.down.sql --url "${scratchUrl}"`,
        scratchUrl,
      )
      expect(down.status, down.output).toBe(0)
      expect(await shapeOf(db)).toEqual({ columns: [], tables: [], types: [], migration: 0 })
      // The rows outlive their stamps: only 008's objects went.
      const kept = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "Draft" WHERE id = ${draft.id}`
      expect(Number(kept[0].n)).toBe(1)

      // Roll forward: the down un-recorded the migration (L24), so the next
      // deploy re-applies it by itself.
      const again = run('npx prisma migrate deploy', scratchUrl)
      expect(again.status, again.output).toBe(0)
      expect(again.output).toContain(MIGRATION)
      expect(await shapeOf(db)).toEqual(forward)
    } finally {
      await db.$disconnect()
      await prisma!.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`)
    }
  })
})
