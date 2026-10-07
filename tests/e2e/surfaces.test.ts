import { test, expect, type Locator, type Page, type Route } from '@playwright/test'
import { loginAs, waitForDraft, type ApiClient } from '../helpers/api'

// Change 011 — the opaque surface model and reduced motion.
//   AC-09 (FR-08): every fixed or floating surface has an opaque background
//          (alpha 1) and no backdrop-filter, in both themes.
//   AC-18 (NFR-03): under reduced motion a modal stays centred, and its
//          animation is 150 ms or less; menus and toasts fade.
//   AC-19 (NFR-04, NFR-05): an OS-dark first visit paints dark from the
//          start, and no request in this suite goes to a font or icon CDN.

const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const THEMES = ['light', 'dark'] as const
type Theme = (typeof THEMES)[number]

// Font and icon CDNs the app must never call at runtime (fonts are self-hosted
// by next/font, icons are lucide-react).
const CDN_HOSTS =
  /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|use\.fontawesome\.com|kit\.fontawesome\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fonts\.bunny\.net|use\.typekit\.net|code\.iconify\.design|api\.iconify\.design)$/

// ── Helpers ──────────────────────────────────────────────────────────────────

// Store the manual theme choice before any page script runs (themeInitScript
// reads `bistec-theme` before first paint).
async function storeTheme(page: Page, theme: Theme) {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('bistec-theme', t)
    } catch {
      // storage blocked: nothing to do
    }
  }, theme)
}

// Same flow as ui.test.ts pageLogin. A super admin with more than one team
// lands on /choose-team.
async function pageLogin(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('Username').fill(ADMIN_EMAIL)
  await page.getByPlaceholder('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/choose-team')
  await page.goto('/')
  if (page.url().includes('/choose-team')) {
    await page.getByRole('button', { name: 'Bistec' }).click()
    await page.waitForURL((url) => url.pathname === '/')
  }
}

async function expectTheme(page: Page, theme: Theme) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
    .toBe(theme === 'dark')
}

// The alpha channel of a computed colour: `rgb(r, g, b)` is 1, `rgba(…, a)` is
// a. Anything else (a colour() function, a keyword) fails the parse loudly.
function alphaOf(color: string): number {
  const m = color.match(/^rgba?\(([^)]+)\)$/)
  if (!m) throw new Error(`unparsed colour: ${color}`)
  const parts = m[1].split(/[\s,/]+/).filter(Boolean)
  return parts.length === 4 ? Number(parts[3]) : 1
}

// AC-09: the element's own background is fully opaque, and it applies no
// backdrop-filter.
async function expectOpaque(locator: Locator, what: string) {
  await expect(locator, `${what} is visible`).toBeVisible()
  const style = await locator.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { bg: cs.backgroundColor, backdrop: cs.backdropFilter }
  })
  expect(alphaOf(style.bg), `${what} background-color ${style.bg}`).toBe(1)
  expect(style.backdrop, `${what} backdrop-filter`).toBe('none')
}

// Mint an EXPORTED draft via the API (owned by the admin, so the browser
// session can open it). Cached per worker: one draft serves every case.
let cached: { id: string; topic: string } | null = null
async function exportedDraft(api: ApiClient): Promise<{ id: string; topic: string }> {
  if (cached) return cached
  const topic = `surfaces-${Date.now()}`
  const kit = await (
    await api.post('/api/admin/brandkits', { name: `Surfaces Kit ${topic}`, colors: ['#8c4812'] })
  ).json()
  const camp = await (
    await api.post('/api/campaigns', { name: `Surfaces Camp ${topic}`, brandKitId: kit.id })
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
  const res = await api.post('/api/generate/assemble-b', { briefId: brief.id })
  expect(res.status()).toBe(202)
  const { draftId } = await res.json()
  const draft = await waitForDraft(api, draftId)
  expect(draft.status).toBe('EXPORTED')
  cached = { id: draftId, topic }
  return cached
}

// Make the campaign create fail, so each submit toasts its error without
// writing anything.
async function stubCampaignCreateFailure(page: Page) {
  await page.route('**/api/campaigns', (route: Route) => {
    if (route.request().method() !== 'POST') return route.continue()
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Surfaces toast' }),
    })
  })
}

async function fireToast(page: Page): Promise<Locator> {
  await stubCampaignCreateFailure(page)
  await page.goto('/campaigns')
  await page.getByRole('button', { name: 'New Campaign' }).click()
  await page.getByPlaceholder('e.g. Summer Product Launch').fill('Surfaces toast campaign')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByText('Surfaces toast', { exact: true })).toBeVisible()
  return page.locator('[data-sonner-toast]').first()
}

// AC-19 (no CDN): every request any page in this file makes is checked.
const cdnRequests: string[] = []
test.beforeEach(async ({ page }) => {
  cdnRequests.length = 0
  page.on('request', (req) => {
    try {
      if (CDN_HOSTS.test(new URL(req.url()).hostname)) cdnRequests.push(req.url())
    } catch {
      // not a URL with a host (data:, blob:)
    }
  })
})
test.afterEach(() => {
  expect(cdnRequests, 'font/icon CDN requests').toEqual([])
})

// ── AC-09: opaque fixed and floating surfaces ────────────────────────────────

for (const theme of THEMES) {
  test.describe(`AC-09 opaque surfaces (${theme})`, () => {
    let api: ApiClient
    test.beforeEach(async ({ request, page }) => {
      api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
      await storeTheme(page, theme)
    })
    test.afterEach(async () => {
      await api.dispose()
    })

    test(`header, desktop sidebar and Create post button (${theme})`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await pageLogin(page)
      await expectTheme(page, theme)
      await expectOpaque(page.locator('header').first(), 'header')
      await expectOpaque(page.locator('aside').first(), 'desktop sidebar')
      await expectOpaque(page.getByTestId('create-post-fab'), 'Create post button')
    })

    test(`mobile sidebar at 375px (${theme})`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 })
      await pageLogin(page)
      await expectTheme(page, theme)
      await expectOpaque(page.locator('header').first(), 'header (375px)')
      await page.getByRole('button', { name: 'Open sidebar' }).click()
      const nav = page.getByRole('dialog', { name: 'Navigation' })
      await expectOpaque(nav.locator('aside'), 'mobile sidebar')
    })

    test(`team-switcher menu (${theme})`, async ({ page }) => {
      // The seeded super admin sees every team, so it gets the switcher menu.
      await page.setViewportSize({ width: 1440, height: 900 })
      await pageLogin(page)
      await page.getByRole('button', { name: 'Switch team' }).click()
      await expectOpaque(page.getByRole('menu'), 'team-switcher menu')
      await page.keyboard.press('Escape')
    })

    test(`a toast (${theme})`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await pageLogin(page)
      await expectTheme(page, theme)
      await expectOpaque(await fireToast(page), 'toast')
    })

    test(`publish modal (${theme})`, async ({ page }) => {
      test.skip(!MOCKED(), 'needs MOCK_AI + MOCK_PUPPETEER to mint a draft')
      const draft = await exportedDraft(api)
      await page.setViewportSize({ width: 1440, height: 900 })
      await pageLogin(page)
      await page.goto(`/drafts/${draft.id}`)
      await page.getByRole('button', { name: /^publish$/i }).click({ timeout: 20_000 })
      await expectOpaque(page.getByRole('dialog', { name: 'Publish Post' }), 'publish modal')
      await page.keyboard.press('Escape')
    })

    test(`confirm dialog, cancelled (${theme})`, async ({ page }) => {
      test.skip(!MOCKED(), 'needs MOCK_AI + MOCK_PUPPETEER to mint a draft')
      const draft = await exportedDraft(api)
      await page.setViewportSize({ width: 1440, height: 900 })
      await pageLogin(page)
      await page.goto('/library')
      await page.getByRole('button', { name: `Delete ${draft.topic}` }).click({ timeout: 20_000 })
      const dialog = page.getByRole('dialog', { name: 'Delete this post?' })
      await expectOpaque(dialog, 'confirm dialog')
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await expect(dialog).toBeHidden()
      // Cancel really cancelled: the draft is still there.
      expect((await api.get(`/api/drafts/${draft.id}`)).status()).toBe(200)
    })

    test(`lightbox chrome (${theme})`, async ({ page }) => {
      test.skip(!MOCKED(), 'needs MOCK_AI + MOCK_PUPPETEER to mint a draft')
      const draft = await exportedDraft(api)
      await page.setViewportSize({ width: 1440, height: 900 })
      await pageLogin(page)
      await page.goto(`/drafts/${draft.id}`)
      await page.getByRole('button', { name: 'View full screen', exact: true }).click({ timeout: 20_000 })
      const close = page.getByRole('button', { name: 'Close preview' })
      await expectOpaque(close, 'lightbox close button')
      // The caption bar: the Download button's container.
      await expectOpaque(
        page.getByRole('button', { name: 'Download' }).locator('xpath=..'),
        'lightbox caption bar',
      )
      await close.click()
    })
  })
}

// ── AC-18 / NFR-03: reduced motion ───────────────────────────────────────────

// Computed animation-duration in ms (the first of a comma list).
function durationMs(value: string): number {
  const first = value.split(',')[0].trim()
  return first.endsWith('ms') ? Number(first.slice(0, -2)) : Number(first.slice(0, -1)) * 1000
}

test.describe('AC-18 reduced motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  test('a modal stays centred, and its animation is 150 ms or less', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/admin/teams')
    await page.getByRole('button', { name: 'Add team' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add team' })
    await expect(dialog).toBeVisible()
    // The 1 ms reduced-motion transition applies to every property: let it
    // settle before reading the geometry and computed style.
    await page.waitForTimeout(300)
    const box = await dialog.boundingBox()
    const vp = page.viewportSize()!
    expect(box).not.toBeNull()
    expect(Math.abs(box!.x + box!.width / 2 - vp.width / 2)).toBeLessThanOrEqual(2)
    expect(Math.abs(box!.y + box!.height / 2 - vp.height / 2)).toBeLessThanOrEqual(2)
    const duration = await dialog.evaluate((el) => getComputedStyle(el).animationDuration)
    expect(durationMs(duration)).toBeLessThanOrEqual(150)
    await page.keyboard.press('Escape')
  })

  test('menus and toasts swap their entrance for a 150 ms fade', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)

    await page.getByRole('button', { name: 'Switch team' }).click()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    const menuAnim = await menu.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { name: cs.animationName, duration: cs.animationDuration }
    })
    expect(menuAnim.name).toBe('fade')
    expect(durationMs(menuAnim.duration)).toBe(150)
    await page.keyboard.press('Escape')

    const toast = await fireToast(page)
    const toastAnim = await toast.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { name: cs.animationName, duration: cs.animationDuration }
    })
    expect(toastAnim.name).toBe('fade')
    expect(durationMs(toastAnim.duration)).toBe(150)
  })
})

// ── AC-19: dark first paint ──────────────────────────────────────────────────

test.describe('AC-19 dark first paint', () => {
  test.use({ colorScheme: 'dark' })

  test('a fresh OS-dark visit has html.dark before <body> exists', async ({ page }) => {
    // Fresh context: no stored theme, so the OS preference decides. Record the
    // class at the moment <body> is inserted — nothing can paint before that.
    await page.addInitScript(() => {
      const w = window as unknown as { __darkAtBody?: boolean }
      const observer = new MutationObserver(() => {
        if (document.body && w.__darkAtBody === undefined) {
          w.__darkAtBody = document.documentElement.classList.contains('dark')
          observer.disconnect()
        }
      })
      observer.observe(document, { childList: true, subtree: true })
    })
    await page.goto('/login')
    const darkAtBody = await page.evaluate(
      () => (window as unknown as { __darkAtBody?: boolean }).__darkAtBody,
    )
    expect(darkAtBody).toBe(true)
    expect(await page.evaluate(() => localStorage.getItem('bistec-theme'))).toBeNull()
  })
})
