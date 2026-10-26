import { test, expect } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'
import { pageLogin } from '../helpers/ui'

// §AL (docs/e2e-test-plan.md): 031 FR-30 to FR-32, the briefing assistant's
// schedule uses post styles. TC-AS-04 to TC-AS-06 (the brand-kit assistant)
// follow in T12.
//
// Under MOCK_AI the schedule reply (`buildMockBriefingReply`) has two rows:
// "Mock scheduled post 1" with the active style `launch`, and
// "Mock scheduled post 2" with the bad key `flash-sale`, which the parser
// replaces with the campaign default (or General). No model is called.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const ADMIN_EMAIL = 'admin@bisteccare.lk'
const PASSWORD = 'BistecStudio2026!'

async function makeCampaign(api: ApiClient, label: string, defaultPostStyle?: string) {
  const name = `AS ${label} ${Date.now()}`
  const res = await api.post('/api/campaigns', { name, ...(defaultPostStyle ? { defaultPostStyle } : {}) })
  expect(res.status()).toBe(201)
  return { ...(await res.json()), name } as { id: string; name: string }
}

async function openPlan(page: import('@playwright/test').Page, campId: string) {
  await pageLogin(page)
  await page.goto(`/campaigns/${campId}`)
  await page.getByRole('button', { name: 'Draft with AI' }).click()
  const drawer = page.getByRole('dialog', { name: 'Draft briefing with AI' })
  await expect(drawer).toBeVisible()
  const ask = drawer.getByLabel('Message', { exact: true })
  await ask.fill('Please schedule a short series of posts.')
  const replied = page.waitForResponse(
    (r) => r.url().endsWith(`/api/campaigns/${campId}/briefing/chat`) && r.request().method() === 'POST',
  )
  await ask.press('Enter')
  expect((await replied).status()).toBe(200)
  const plan = drawer.getByRole('region', { name: 'Proposed schedule' })
  await expect(plan).toBeVisible({ timeout: 30_000 })
  return { drawer, plan, rows: plan.getByRole('listitem') }
}

test.describe.configure({ mode: 'serial' })

test.describe('Briefing assistant schedule with post styles (031)', () => {
  let admin: ApiClient
  test.beforeEach(async ({ request }) => {
    admin = await loginAs(request, ADMIN_EMAIL, PASSWORD)
  })
  test.afterEach(async () => {
    await admin.dispose()
  })

  test('TC-AS-01: each plan row has a post-style select and no goal text', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(90_000)
    const camp = await makeCampaign(admin, '01')
    const { plan, rows } = await openPlan(page, camp.id)
    await expect(rows).toHaveCount(2)
    for (let i = 0; i < 2; i++) {
      await expect(rows.nth(i).getByRole('combobox', { name: 'Post style' })).toHaveCount(1)
    }
    await expect(rows.nth(0).getByRole('combobox', { name: 'Post style' })).toHaveValue('launch')
    await expect(plan).not.toContainText('awareness')
  })

  test('TC-AS-02: a bad style key is replaced by the campaign default and the row says so', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(90_000)
    const camp = await makeCampaign(admin, '02', 'event')
    const { rows } = await openPlan(page, camp.id)
    const bad = rows.nth(1)
    await expect(bad.getByRole('combobox', { name: 'Post style' })).toHaveValue('event')
    await expect(bad.getByTestId('style-replaced')).toHaveText(
      'Suggested style flash-sale is not available; using Event',
    )
    await expect(rows.nth(0).getByTestId('style-replaced')).toHaveCount(0)
  })

  test('TC-AS-03: Schedule creates queue entries whose postStyle is the shown value', async ({ page }) => {
    if (!MOCKED()) { test.skip(); return }
    test.setTimeout(90_000)
    const camp = await makeCampaign(admin, '03', 'event')
    const { plan, rows } = await openPlan(page, camp.id)
    // The user changes the replaced row's style before scheduling.
    await rows.nth(1).getByRole('combobox', { name: 'Post style' }).selectOption('tip')
    await expect(rows.nth(1).getByTestId('style-replaced')).toHaveCount(0)

    const batch = page.waitForResponse(
      (r) => r.url().endsWith(`/api/campaigns/${camp.id}/queue/batch`) && r.request().method() === 'POST',
    )
    await plan.getByRole('button', { name: /^Schedule 2 posts$/ }).click()
    const res = await batch
    expect(res.status()).toBe(201)
    expect(res.request().postDataJSON().entries.every((e: Record<string, unknown>) => !('goal' in e))).toBe(true)

    const queue = (await (await admin.get(`/api/campaigns/${camp.id}/queue`)).json()) as Array<{
      topic: string
      postStyle: string
    }>
    const byTopic = Object.fromEntries(queue.map((e) => [e.topic, e.postStyle]))
    expect(byTopic).toEqual({ 'Mock scheduled post 1': 'launch', 'Mock scheduled post 2': 'tip' })
  })
})
