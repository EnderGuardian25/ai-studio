import { test, expect } from '@playwright/test'
import { loginAs, waitForDraft, type ApiClient } from '../helpers/api'

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const MOCKED = () => process.env.MOCK_PUPPETEER === 'true'

async function createExportedDraft(api: ApiClient, topic: string) {
  const kit = await (
    await api.post('/api/admin/brandkits', { name: `Inline Kit ${topic}`, colors: ['#0284c7'] })
  ).json()
  const camp = await (
    await api.post('/api/campaigns', { name: `Inline Camp ${topic}`, brandKitId: kit.id })
  ).json()
  const brief = await (
    await api.post('/api/briefs', {
      topic,
      goal: 'g',
      tone: 'professional',
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      copyProviderKey: 'cli',
      campaignId: camp.id,
    })
  ).json()
  const assembleRes = await api.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(assembleRes.status()).toBe(202)
  const { draftId } = await assembleRes.json()
  const draft = await waitForDraft(api, draftId)
  expect(draft.status).toBe('EXPORTED')
  return draft
}

// §T — Manual inline edit (synchronous save → new revision).
test.describe('§T — draft inline edit', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    await api.dispose()
  })

  // TC-INLINE-01 — save edited HTML → new revision, pointer advances, re-rendered.
  test('inline-edit saves a new revision and advances the pointer', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Save ${Date.now()}`)
    expect(draft.currentRevisionNumber).toBe(1)

    const edited =
      '<!doctype html><html><body style="width:1080px;height:1080px">Edited headline</body></html>'
    const res = await api.post(`/api/drafts/${draft.id}/inline-edit`, { html: edited })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.revisionId).toBeTruthy()
    expect(body.exportUrl).toMatch(/^https?:\/\//)

    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.currentRevisionNumber).toBe(2)
    expect(after.htmlContent).toContain('Edited headline')

    const revisions = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(
      revisions.some((r: { instruction: string }) => r.instruction === 'Manual inline edit'),
    ).toBe(true)
  })

  // TC-INLINE-02 — restore to the prior revision still works after an inline edit.
  test('the prior revision is restorable after an inline edit', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Restore ${Date.now()}`)
    await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      html: '<!doctype html><html><body style="width:1080px;height:1080px">v2</body></html>',
    })

    const restore = await api.post(`/api/drafts/${draft.id}/revisions/1/restore`, {})
    expect(restore.status()).toBe(200)
    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.currentRevisionNumber).toBe(1)
  })

  // TC-INLINE-03 — empty html → 400; missing html → 400.
  test('rejects a missing/empty html body with 400', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Bad ${Date.now()}`)
    const res = await api.post(`/api/drafts/${draft.id}/inline-edit`, {})
    expect(res.status()).toBe(400)

    const emptyRes = await api.post(`/api/drafts/${draft.id}/inline-edit`, { html: '' })
    expect(emptyRes.status()).toBe(400)
  })

  // TC-INLINE-05 — element mode (change 004 T23 smoke): one element edit → 200
  // with exactly one new revision; the SAME locator afterwards is stale → 409
  // (its text fingerprint no longer matches the current HTML — AC-25).
  test('element mode edits one node, then a stale fingerprint is 409', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Element ${Date.now()}`)
    // Pin a known document through the whole-document mode first (revision 2).
    const base =
      '<!doctype html><html><head></head><body style="width:1080px;height:1080px"><h1>Old headline</h1><p>Keep me</p></body></html>'
    expect((await api.post(`/api/drafts/${draft.id}/inline-edit`, { html: base })).status()).toBe(200)

    const locator = { path: [0], tag: 'H1', text: 'Old headline' }
    const res = await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      mode: 'element',
      locator,
      edit: { kind: 'text', value: '<script>alert(1)</script>' },
      selector: 'p', // AC-26: ignored — the server resolves the target itself
    })
    expect(res.status()).toBe(200)
    expect((await res.json()).revisionId).toBeTruthy()

    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.currentRevisionNumber).toBe(3)
    expect(after.htmlContent).toBe(
      base.replace('<h1>Old headline</h1>', '<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>'),
    )
    const revisions = await (await api.get(`/api/drafts/${draft.id}/revisions`)).json()
    expect(revisions).toHaveLength(3)
    expect(revisions[0].instruction).toBe('Element edit: text')

    const stale = await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      mode: 'element',
      locator,
      edit: { kind: 'text', value: 'Second write' },
    })
    expect(stale.status()).toBe(409)
    expect((await stale.json()).code).toBe('element-stale')
    const unchanged = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(unchanged.currentRevisionNumber).toBe(3)
  })

  // TC-INLINE-06 — element mode grammar: a colour that tries to break out of
  // its declaration is 400 and writes nothing (AC-22).
  test('element mode rejects a colour outside the grammar with 400', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const draft = await createExportedDraft(api, `Inline Element Bad ${Date.now()}`)
    const before = await (await api.get(`/api/drafts/${draft.id}`)).json()
    const res = await api.post(`/api/drafts/${draft.id}/inline-edit`, {
      mode: 'element',
      locator: { path: [], tag: 'body', text: '' },
      edit: { kind: 'color', value: 'red; background: url(http://evil.test/x)' },
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).code).toBe('invalid-color')
    const after = await (await api.get(`/api/drafts/${draft.id}`)).json()
    expect(after.currentRevisionNumber).toBe(before.currentRevisionNumber)
    expect(after.htmlContent).toBe(before.htmlContent)
  })

  // TC-INLINE-04 — a foreign draft id is a 404 (no existence leak).
  test('an unknown draft id is 404', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const res = await api.post('/api/drafts/does-not-exist/inline-edit', {
      html: '<!doctype html><html><body>x</body></html>',
    })
    expect(res.status()).toBe(404)
  })
})
