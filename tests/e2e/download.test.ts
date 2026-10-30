import { test, expect } from '@playwright/test'
import { loginAs, waitForDraft, type ApiClient } from '../helpers/api'
import { ADMIN_EMAIL, ADMIN_PASSWORD, pageLogin } from '../helpers/ui'
import { prisma, dbAvailable } from '../helpers/db'

// §AI — Download (037 AC-06, AC-09; docs/e2e-test-plan.md).
//
// Contract (src/app/api/drafts/[id]/download/route.ts):
//   GET /api/drafts/[id]/download
//     → 200 image/png, Content-Disposition: attachment; filename "<topic-slug>-<id>.png"
//     → emits draft.downloaded (rendered: false when the stored PNG is current)
// Requires MOCK_AI + MOCK_PUPPETEER to mint a draft deterministically.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)

test.describe.configure({ mode: 'serial' })

let api: ApiClient
test.beforeEach(async ({ request }) => {
  api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
})
test.afterEach(async () => {
  await api.dispose()
})

type Draft = Record<string, unknown> & { id: string; exportUrl: string | null }

async function generate(topic: string): Promise<Draft> {
  const brief = await api.post('/api/briefs', {
    topic,
    goal: 'g',
    tone: 'professional',
    channels: ['INSTAGRAM'],
    designMode: 'GENERATE',
    copyProviderKey: 'cli',
  })
  expect(brief.status()).toBe(201)
  const { id: briefId } = await brief.json()
  const res = await api.post('/api/generate/assemble-b', { briefId })
  expect(res.status()).toBe(202)
  const { draftId } = await res.json()
  const draft = (await waitForDraft(api, draftId)) as Draft
  expect(draft.status).toBe('EXPORTED')
  return draft
}

type AEvent = { name: string; outcome: string | null; payload: Record<string, unknown> }
async function downloadedEvents(draftId: string, count: number): Promise<AEvent[]> {
  const read = async () => {
    const res = await api.get(`/api/test/analytics-events?draftId=${draftId}`)
    expect(res.status()).toBe(200)
    return ((await res.json()).events as AEvent[]).filter((e) => e.name === 'draft.downloaded')
  }
  await expect.poll(async () => (await read()).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(count)
  return read()
}

test.describe('§AI Download', () => {
  test('TC-DL-01: a current draft downloads its stored PNG with no render', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await generate(`Download Current ${Date.now()}`)

    const res = await api.get(`/api/drafts/${draft.id}/download`)
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toBe('image/png')
    expect(res.headers()['content-disposition']).toMatch(/^attachment; filename="download-current-\d+-.+\.png"$/)
    expect((await res.body()).length).toBeGreaterThan(0)

    const after = (await (await api.get(`/api/drafts/${draft.id}`)).json()) as Draft
    expect(after.exportUrl).toBe(draft.exportUrl)
    const [event] = await downloadedEvents(draft.id, 1)
    expect(event.outcome).toBe('ok')
    expect(event.payload.rendered).toBe(false)
  })

  test('TC-DL-02: a draft with no stored PNG renders once, and the next download does not', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draft = await generate(`Download Render ${Date.now()}`)
    await prisma!.draft.update({ where: { id: draft.id }, data: { exportUrl: null } })

    expect((await api.get(`/api/drafts/${draft.id}/download`)).status()).toBe(200)
    const row = await prisma!.draft.findUnique({ where: { id: draft.id }, select: { exportUrl: true } })
    expect(row?.exportUrl).toBeTruthy()
    expect((await api.get(`/api/drafts/${draft.id}/download`)).status()).toBe(200)

    const events = await downloadedEvents(draft.id, 2)
    expect(events.map((e) => e.payload.rendered).sort()).toEqual([false, true])
  })

  test('TC-DL-03: an unknown draft answers 404', async () => {
    if (!MOCKED()) { test.skip(); return }
    expect((await api.get('/api/drafts/does-not-exist/download')).status()).toBe(404)
  })

  test('TC-DL-04: the draft page has Download and no Export; Download saves a .png', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await generate(`Download Page ${Date.now()}`)
    await pageLogin(page)
    await page.goto(`/drafts/${draft.id}`)
    const button = page.getByRole('button', { name: 'Download', exact: true })
    await expect(button).toBeVisible({ timeout: 20_000 })
    await expect(button).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Re-export', exact: true })).toHaveCount(0)

    // The download listener is created before the click.
    const downloadPromise = page.waitForEvent('download')
    await button.click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.png$/)
  })

  test('TC-DL-05: a stale headline shows the download line next to the button', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    const draft = await generate(`Download Stale ${Date.now()}`)
    expect((await api.patch(`/api/drafts/${draft.id}`, { headline: 'A brand new headline' })).status()).toBe(200)
    await pageLogin(page)
    await page.goto(`/drafts/${draft.id}`)
    await expect(page.getByTestId('download-line')).toHaveText('The image shows an older headline.', {
      timeout: 20_000,
    })
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeEnabled()
  })
})
