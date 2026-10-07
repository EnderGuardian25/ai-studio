import { test, expect, type Locator, type Page, type Route } from '@playwright/test'
import { loginAs, waitForDraft, type ApiClient } from '../helpers/api'

// Change 011 — the opaque surface model and reduced motion.
//   AC-09 (FR-08): every fixed or floating surface has an opaque background
//          (alpha 1) and no backdrop-filter, in both themes.
//   AC-18 (NFR-03): under reduced motion a modal stays centred, and its
//          animation is 150 ms or less; menus and toasts fade.
//   AC-19 (NFR-04, NFR-05): an OS-dark first visit paints dark from the
//          start, and no request in this suite goes to a font or icon CDN.
//   T6, the shell group: AC-11 (the 375 px sidebar opens, traps focus,
//          reaches every link and closes; no horizontal scroll), AC-12
//          (login, choose-team and the shell at 375 px), AC-17 (visible focus
//          on the first three stops of login and the shell), the "Studio"
//          wordmark, the theme toggle, and the Create post button's motion.

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

// ── The shell, login and choose-team (T6: AC-11, AC-12, AC-17) ───────────────

// AC-11 / AC-12: the page never scrolls sideways.
async function expectNoHorizontalScroll(page: Page, what: string) {
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }))
  expect(sw, `${what}: scrollWidth ${sw} > clientWidth ${cw}`).toBeLessThanOrEqual(cw)
}

// AC-17: Tab from the top of the page three times. Each stop is a
// :focus-visible element that draws an outline or a ring (box-shadow). Polled,
// because a ring can transition in. Returns a short label per stop.
async function tabThreeWithVisibleFocus(page: Page): Promise<string[]> {
  const stops: string[] = []
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Tab')
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null
          if (!el || el === document.body) return 'nothing focused'
          const cs = getComputedStyle(el)
          const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0
          const ring = cs.boxShadow !== 'none'
          if (!el.matches(':focus-visible')) return 'not :focus-visible'
          return outline || ring ? 'visible' : 'no indicator'
        }),
      )
      .toBe('visible')
    stops.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        return (el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.textContent ?? '').trim()
      }),
    )
  }
  return stops
}

test.describe('Shell, login and choose-team (T6)', () => {
  test('AC-11: at 375px the mobile sidebar opens, traps focus, reaches every link and closes', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await pageLogin(page)
    await expectNoHorizontalScroll(page, 'dashboard at 375px')

    const open = page.getByRole('button', { name: 'Open sidebar' })
    await open.click()
    const nav = page.getByRole('dialog', { name: 'Navigation' })
    await expect(nav).toBeVisible()
    await expectNoHorizontalScroll(page, 'sidebar open at 375px')

    const links = nav.getByRole('link')
    const hrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''))
    expect(hrefs.length).toBeGreaterThan(0)
    for (let i = 0; i < hrefs.length; i++) await expect(links.nth(i)).toBeVisible()

    // Tab past the end of the panel: focus wraps inside it (the trap) and
    // lands on every link on the way.
    const reached = new Set<string>()
    for (let i = 0; i < hrefs.length + 8; i++) {
      await page.keyboard.press('Tab')
      const at = await page.evaluate(() => {
        const el = document.activeElement
        return { inside: !!el?.closest('[role="dialog"]'), href: el?.getAttribute('href') ?? null }
      })
      expect(at.inside, 'focus stays inside the open sidebar').toBe(true)
      if (at.href) reached.add(at.href)
    }
    expect([...reached].sort()).toEqual([...hrefs].sort())

    await page.keyboard.press('Escape')
    await expect(nav).toBeHidden()

    await open.click()
    await expect(nav).toBeVisible()
    await nav.getByRole('button', { name: 'Close sidebar' }).click()
    await expect(nav).toBeHidden()
  })

  test('AC-12: login, choose-team and the shell load at 375px with no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expectNoHorizontalScroll(page, 'login at 375px')

    await pageLogin(page)
    await expectNoHorizontalScroll(page, 'dashboard at 375px')
    await page.goto('/choose-team')
    await expect(page.getByRole('heading', { name: 'Choose a team' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Bistec' })).toBeVisible()
    await expectNoHorizontalScroll(page, 'choose-team at 375px')
  })

  test('AC-17: login shows a visible focus indicator on its first three stops', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    expect(await tabThreeWithVisibleFocus(page)).toEqual(['Username', 'Password', 'Sign in'])
  })

  test('AC-17: the shell shows a visible focus indicator on its first three stops', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/choose-team')
    await expect(page.getByRole('button', { name: 'Bistec' })).toBeVisible()
    // The header's theme toggle (two buttons, named by their visible text),
    // then the sidebar's team switcher.
    const stops = await tabThreeWithVisibleFocus(page)
    expect(stops).toEqual(['Light', 'Dark', 'Switch team'])
  })

  test('the "Studio" wordmark is the logo, typeset in the display face', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/login')
    await expect(page.getByRole('img', { name: 'Studio' })).toHaveText('Studio')
    await pageLogin(page)
    const logo = page.getByRole('banner').getByRole('img', { name: 'Studio' })
    await expect(logo).toHaveText('Studio')
    const style = await logo.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { family: cs.fontFamily, style: cs.fontStyle, image: cs.backgroundImage }
    })
    expect(style.family).toMatch(/Fraunces/i)
    expect(style.style).toBe('italic')
    expect(style.image).toBe('none')
  })

  test('the theme toggle switches the theme and its pressed state follows', async ({ page }) => {
    await storeTheme(page, 'light')
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await expectTheme(page, 'light')
    const group = page.getByRole('group', { name: 'Theme' })
    const light = group.getByRole('button', { name: 'Light', exact: true })
    const dark = group.getByRole('button', { name: 'Dark', exact: true })
    await expect(light).toHaveAttribute('aria-pressed', 'true')
    await expect(dark).toHaveAttribute('aria-pressed', 'false')
    // Pressing the current theme is a no-op.
    await light.click()
    await expectTheme(page, 'light')
    await dark.click()
    await expectTheme(page, 'dark')
    await expect(dark).toHaveAttribute('aria-pressed', 'true')
    await expect(light).toHaveAttribute('aria-pressed', 'false')
  })

  test('the Create post button lifts 1px on hover', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    const fab = page.getByTestId('create-post-fab')
    await fab.hover()
    await expect
      .poll(() => fab.evaluate((el) => getComputedStyle(el).transform))
      .toBe('matrix(1, 0, 0, 1, -1, -1)')
  })
})

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
    // The 1 ms reduced-motion transition applies to every property, so poll
    // the geometry until it settles: the modal's centre is within 2 px of the
    // viewport's on both axes.
    const vp = page.viewportSize()!
    await expect
      .poll(async () => {
        const box = await dialog.boundingBox()
        if (!box) return Number.POSITIVE_INFINITY
        return Math.max(
          Math.abs(box.x + box.width / 2 - vp.width / 2),
          Math.abs(box.y + box.height / 2 - vp.height / 2),
        )
      })
      .toBeLessThanOrEqual(2)
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

  test('the Create post button does not move on hover (shell)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    const fab = page.getByTestId('create-post-fab')
    await fab.hover()
    await expect.poll(() => fab.evaluate((el) => getComputedStyle(el).transform)).toBe('none')
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
