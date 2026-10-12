import { test, expect, type Page } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'
import { ADMIN_EMAIL, ADMIN_PASSWORD, mintExportedDraft, pageLogin } from '../helpers/ui'

// Change 015 — the draft-page settle race (the red fork CI).
//   AC-01: a refine whose background run finishes before the post-202 draft
//          refetch is served still resolves its row to "Applied", re-enables
//          the input and lists v2.
//   AC-02: the same race on Regenerate design still lists the new revision.
// The race is forced: the first draft GET after the action POST is held for
// 3 s, so the in-process mock action always finishes first — the order the
// slower CI runner produces on its own.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)

// Holds the first GET /api/drafts/<id> (the exact path, not /revisions) sent
// after a POST to `actionPath`. Returns a getter for whether the hold happened.
async function holdFirstRefetchAfter(page: Page, draftId: string, actionPath: string) {
  let actionSent = false
  let held = false
  await page.route(`**/api/drafts/${draftId}/${actionPath}`, async (route) => {
    if (route.request().method() === 'POST') actionSent = true
    await route.continue()
  })
  await page.route(`**/api/drafts/${draftId}`, async (route) => {
    if (actionSent && !held && route.request().method() === 'GET') {
      held = true
      await new Promise((r) => setTimeout(r, 3000))
    }
    await route.continue()
  })
  return () => held
}

const currentVersion = (page: Page) => page.getByRole('listitem').filter({ hasText: 'Current' })

test.describe('§X — draft-page settle race (015)', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    test.skip(!MOCKED(), 'needs MOCK_AI + MOCK_PUPPETEER to mint and act on a draft')
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    await api?.dispose()
  })

  // TC-RACE-01 — AC-01.
  test('a refine that finishes before the post-202 refetch still resolves to Applied', async ({ page }) => {
    const draft = await mintExportedDraft(api, `settle-race-refine-${Date.now()}`)
    await pageLogin(page)
    const held = await holdFirstRefetchAfter(page, draft.id, 'refine')
    await page.goto(`/drafts/${draft.id}`)
    await expect(page.getByRole('button', { name: 'View full screen', exact: true })).toBeVisible({ timeout: 20_000 })

    const ask = page.getByPlaceholder('e.g. Make the logo larger…')
    await ask.fill('Make the background darker')
    await ask.press('Enter')

    const log = page.getByRole('region', { name: 'Refine requests' })
    await expect(log.getByText('Applied', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(ask).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Switch to v1' })).toBeVisible()
    await expect(currentVersion(page)).toContainText('v2')
    expect(held()).toBe(true)
  })

  // TC-RACE-02 — AC-02.
  test('a design regenerate that finishes before the post-202 refetch still lists the new revision', async ({ page }) => {
    const draft = await mintExportedDraft(api, `settle-race-regen-${Date.now()}`)
    await pageLogin(page)
    const held = await holdFirstRefetchAfter(page, draft.id, 'regenerate-design')
    await page.goto(`/drafts/${draft.id}`)
    await expect(page.getByRole('button', { name: 'View full screen', exact: true })).toBeVisible({ timeout: 20_000 })

    const regen = page.getByRole('button', { name: 'Regenerate design', exact: true })
    await regen.click()

    await expect(currentVersion(page)).toContainText('v2', { timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Switch to v1' })).toBeVisible()
    await expect(regen).toBeEnabled()
    expect(held()).toBe(true)
  })
})
