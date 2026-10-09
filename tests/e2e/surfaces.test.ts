import { test, expect, type Locator, type Page, type Route } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  briefDraftIds,
  ONE_PX_PNG,
  expectNoHorizontalScroll,
  mintBrandKitFixture,
  mintCampaignFixture,
  mintExportedDraft,
  pageLogin,
  tabThreeFromMain,
  tabThreeWithVisibleFocus,
} from '../helpers/ui'

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
//   T7–T12, the screen groups: AC-12 (375 px, no horizontal scroll), AC-17
//          (visible focus on a screen's first three stops) and FR-12 (each
//          screen's controls, by role and name).

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
  cached = await mintExportedDraft(api, `surfaces-${Date.now()}`)
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

// ── Dashboard and library (T7: AC-12, AC-17, FR-12) ──────────────────────────

// Filter the library down to one tile by topic (the search is debounced).
async function filterLibraryTo(page: Page, topic: string) {
  await page.getByPlaceholder('Search by topic…').fill(topic)
  await expect(page.getByRole('button', { name: 'History', exact: true })).toHaveCount(1, { timeout: 20_000 })
  await expect(page.locator(`img[alt="${topic}"]`)).toBeVisible()
}

test.describe('Dashboard and library (T7)', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    await api.dispose()
  })

  test('AC-17: the dashboard shows a visible focus indicator on its first three stops', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    expect(await tabThreeFromMain(page)).toEqual(['Create Post', 'View Library', 'Manage Brand Kits'])
  })

  test('AC-17: the library shows a visible focus indicator on its first three stops', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/library')
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible()
    expect(await tabThreeFromMain(page)).toEqual(['Search by topic…', 'All', 'Ready'])
  })

  test('AC-12: dashboard (Recent Drafts expanded), library, publish dialog and history drawer at 375px', async ({ page }) => {
    test.skip(!MOCKED(), 'needs MOCK_AI + MOCK_PUPPETEER to mint a draft')
    const draft = await exportedDraft(api)
    await page.setViewportSize({ width: 375, height: 812 })
    await pageLogin(page)

    // The Recent Drafts table scrolls inside its own container; the page never
    // does. (The admin has at least the draft above, so the table renders.)
    await expect(page.getByRole('heading', { name: 'Recent Drafts' })).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()
    const expand = page.getByRole('button', { name: 'Expand' })
    if (await expand.isVisible()) await expand.click()
    await expectNoHorizontalScroll(page, 'dashboard (Recent Drafts expanded) at 375px')
    // The table is wider than the viewport, so its scroll container must be
    // keyboard-reachable (WCAG 2.1.1): a focusable, labelled region that scrolls.
    const region = page.getByRole('region', { name: 'Recent drafts' })
    await region.focus()
    await expect(region).toBeFocused()
    expect(await region.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => region.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)

    await page.goto('/library')
    await filterLibraryTo(page, draft.topic)
    await expectNoHorizontalScroll(page, 'library at 375px')

    // FR-12: every tile control is still there, by role and name.
    await expect(page.getByRole('link', { name: draft.topic })).toBeVisible()
    await expect(page.getByRole('button', { name: `View ${draft.topic} full screen` })).toBeAttached()
    await expect(page.getByRole('button', { name: `Delete ${draft.topic}` })).toBeVisible()

    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    const publish = page.getByRole('dialog', { name: 'Publish Post' })
    await expect(publish).toBeVisible()
    await expect(publish.getByRole('checkbox')).not.toHaveCount(0)
    await expect(publish.getByRole('button', { name: 'Confirm' })).toBeVisible()
    await expectNoHorizontalScroll(page, 'publish dialog at 375px')
    await publish.getByRole('button', { name: 'Cancel' }).click()
    await expect(publish).toBeHidden()

    await page.getByRole('button', { name: 'History', exact: true }).click()
    const history = page.getByRole('dialog', { name: 'Publish History' })
    await expect(history).toBeVisible()
    await expect(history.getByText('No publish history yet.')).toBeVisible()
    await expectNoHorizontalScroll(page, 'history drawer at 375px')
    await history.getByRole('button', { name: 'Close' }).click()
    await expect(history).toBeHidden()
  })

  test('library thumbnails are shown as rendered: no filter, transform, rounding or hover scale', async ({ page }) => {
    test.skip(!MOCKED(), 'needs MOCK_AI + MOCK_PUPPETEER to mint a draft')
    const draft = await exportedDraft(api)
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/library')
    await filterLibraryTo(page, draft.topic)
    const img = page.locator(`img[alt="${draft.topic}"]`)
    await img.hover()
    const read = () =>
      img.evaluate((el) => {
        const cs = getComputedStyle(el)
        const frame = getComputedStyle(el.parentElement as HTMLElement)
        return {
          filter: cs.filter,
          transform: cs.transform,
          opacity: cs.opacity,
          mixBlend: cs.mixBlendMode,
          radius: cs.borderRadius,
          frameRadius: frame.borderRadius,
          frameFilter: frame.filter,
        }
      })
    await expect.poll(read).toEqual({
      filter: 'none',
      transform: 'none',
      opacity: '1',
      mixBlend: 'normal',
      radius: '0px',
      frameRadius: '0px',
      frameFilter: 'none',
    })
  })
})

// ── Brief wizard (T8: AC-12, AC-17, FR-12) ───────────────────────────────────

test.describe('Brief wizard (T8)', () => {
  let api: ApiClient
  let before: Set<string>
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    before = new Set(await briefDraftIds(api))
  })
  // The walk below autosaves an unfinished brief; discard it, so the per-user
  // brief-draft cap that §P tests never sees this suite's rows.
  test.afterEach(async () => {
    for (const id of await briefDraftIds(api)) {
      if (!before.has(id)) await api.del(`/api/brief-drafts/${id}`)
    }
    await api.dispose()
  })

  test('AC-17: the wizard shows a visible focus indicator on its first three stops', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/brief')
    await expect(page.getByRole('heading', { name: 'New Brief', level: 1 })).toBeVisible()
    // The stepper's first three steps (numeral + label); the current one is announced.
    expect(await tabThreeFromMain(page)).toEqual(['1Campaign', '2Size & Design', '3Content'])
    await expect(page.locator('[aria-current="step"]')).toHaveCount(1)
    await expect(page.locator('[aria-current="step"]')).toHaveText(/Campaign/)
  })

  test('AC-12 + FR-12: every step at 375px keeps its controls and never scrolls sideways', async ({ page }) => {
    test.skip(!MOCKED(), 'needs MOCK_AI for the Enhance with AI before/after')
    await page.setViewportSize({ width: 375, height: 812 })
    await pageLogin(page)
    await page.goto('/brief')
    const cont = page.getByRole('button', { name: /continue/i })

    // Step 1 — Campaign
    await expect(page.getByRole('heading', { name: 'Select Campaign' })).toBeVisible()
    await expect(page.getByRole('button', { name: /No campaign \(Uncategorized\)/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Back' })).toBeDisabled()
    await expectNoHorizontalScroll(page, 'brief: campaign step at 375px')
    await cont.click()

    // Step 2 — Size & Design, the template picker, then Path B's reference picker
    await expect(page.getByRole('heading', { name: 'Size & Design' })).toBeVisible()
    for (const name of [/^1:1/, /^4:5/, /^9:16/, /Path A — Template/, /Path B — Freeform/]) {
      await expect(page.getByRole('button', { name })).toBeVisible()
    }
    const kit = page.getByRole('combobox', { name: 'Brand Kit' })
    if ((await kit.inputValue()) === '') {
      const values = await kit.locator('option').evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.value).filter(Boolean))
      await kit.selectOption(values[0])
    }
    await expect(page.getByText('Template', { exact: true })).toBeVisible()
    await expectNoHorizontalScroll(page, 'brief: size & design (Path A) at 375px')
    await page.getByRole('button', { name: /Path B — Freeform/ }).click()
    await expect(page.getByRole('button', { name: 'No reference' })).toHaveAttribute('aria-pressed', 'true')
    await expectNoHorizontalScroll(page, 'brief: size & design (Path B) at 375px')
    await cont.click()

    // Step 3 — Content, with the Enhance with AI before/after
    await expect(page.getByRole('heading', { name: 'Brief & Copy Direction' })).toBeVisible()
    await page.getByPlaceholder('e.g. Q3 product launch').fill(`T8 wizard ${Date.now()}`)
    await page.locator('textarea').fill('Announce the restyled brief wizard with a short call to action.')
    await expect(page.getByRole('combobox', { name: 'Goal' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Tone' })).toBeVisible()
    await page.getByRole('button', { name: 'Enhance with AI' }).click()
    await expect(page.getByRole('region', { name: 'AI suggestion' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('region', { name: 'Before' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Accept suggestion' })).toBeVisible()
    await expectNoHorizontalScroll(page, 'brief: content step (Enhance before/after) at 375px')
    await page.getByRole('button', { name: 'Discard', exact: true }).click()
    await expect(page.locator('textarea')).toBeVisible()
    await cont.click()

    // Step 4 — Images, with one uploaded row
    await expect(page.getByRole('heading', { name: /Images/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add image' })).toBeVisible()
    await page.locator('input[type=file]').setInputFiles({ name: 't8-1px.png', mimeType: 'image/png', buffer: ONE_PX_PNG })
    await expect(page.getByRole('button', { name: 'Remove image' })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Embed' }).click()
    await expect(page.getByRole('button', { name: 'Style ref' })).toBeVisible()
    await expectNoHorizontalScroll(page, 'brief: images step at 375px')
    await cont.click()

    // Step 5 — Review
    await expect(page.getByRole('heading', { name: 'Review & Generate' })).toBeVisible()
    await expect(page.getByRole('term')).toHaveCount(10)
    await expect(page.getByRole('definition').filter({ hasText: '1 image (0 embed, 1 reference)' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Generate Post' })).toBeVisible()
    await expectNoHorizontalScroll(page, 'brief: review step at 375px')

    // The stepper jumps back to a done step (its label is sr-only below sm).
    await page.getByRole('button', { name: 'Campaign', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Select Campaign' })).toBeVisible()
  })
})

// ── Draft review (T9: AC-12, AC-17, FR-12) ───────────────────────────────────

test.describe('Draft review (T9)', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    await api.dispose()
  })

  test('AC-17: the draft page shows a visible focus indicator on its first three stops', async ({ page }) => {
    test.skip(!MOCKED(), 'needs MOCK_AI + MOCK_PUPPETEER to mint a draft')
    const draft = await exportedDraft(api)
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto(`/drafts/${draft.id}`)
    await expect(page.getByRole('heading', { name: draft.topic, level: 1 })).toBeVisible({ timeout: 20_000 })
    // The back link, the post (opens the lightbox), then the action bar. The
    // one version is the current one, so it is not a button.
    expect(await tabThreeFromMain(page)).toEqual(['Library', 'View full screen', 'Regenerate design'])
  })

  test('AC-12 + FR-12: at 375px every control is there, with refine, versions and the inline editor open', async ({ page }) => {
    test.skip(!MOCKED(), 'needs MOCK_AI + MOCK_PUPPETEER to mint and refine a draft')
    const draft = await mintExportedDraft(api, `surfaces-t9-${Date.now()}`)
    await page.setViewportSize({ width: 375, height: 812 })
    await pageLogin(page)
    await page.goto(`/drafts/${draft.id}`)
    const fullScreen = page.getByRole('button', { name: 'View full screen', exact: true })
    await expect(fullScreen).toBeVisible({ timeout: 20_000 })
    await expectNoHorizontalScroll(page, 'draft page at 375px')

    // FR-12: every control the page had, by role and name.
    await expect(page.getByRole('link', { name: 'Library' }).first()).toBeVisible()
    const regenDesign = page.getByRole('button', { name: 'Regenerate design' })
    for (const name of ['Regenerate design', 'Edit inline', 'Re-export', 'Regenerate']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    }
    await expect(page.getByRole('button', { name: /^publish$/i })).toBeVisible()
    await expect(page.getByPlaceholder('Post copy…')).toBeVisible()
    for (const name of ['Make the background darker', 'Move the headline to top', 'Increase font size']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    }
    const ask = page.getByPlaceholder('e.g. Make the logo larger…')
    await expect(ask).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled()

    // A refine: the log gains an applied row, and v1 becomes a switchable frame.
    await ask.fill('Make the background darker')
    await ask.press('Enter')
    const log = page.getByRole('region', { name: 'Refine requests' })
    await expect(log.getByText('Applied', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Switch to v1' })).toBeVisible({ timeout: 20_000 })
    await expectNoHorizontalScroll(page, 'draft page with the refine log at 375px')

    // Regenerate design: its Undo now sits beside the versions.
    await regenDesign.click()
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible()
    await expect(regenDesign).toBeEnabled({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Switch to v2' })).toBeVisible({ timeout: 20_000 })
    await expectNoHorizontalScroll(page, 'draft page with versions and Undo at 375px')

    // Version switching still works from the contact sheet.
    await page.getByRole('button', { name: 'Switch to v1' }).click()
    await expect(page.locator('[aria-current="true"]')).toContainText('v1', { timeout: 20_000 })

    // The inline editor, in both modes.
    await page.getByRole('button', { name: 'Edit inline' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit inline' })
    await expect(dialog.locator('[data-editor-ready="true"]')).toBeAttached({ timeout: 20_000 })
    await expectNoHorizontalScroll(page, 'inline editor at 375px')
    await dialog.getByRole('tab', { name: 'Single element' }).click()
    await expect(dialog.getByRole('button', { name: 'Select the whole design' })).toBeVisible()
    await expectNoHorizontalScroll(page, 'inline editor, single element, at 375px')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('the post on the proof plate is shown as rendered: no filter, transform, rounding or crop', async ({ page }) => {
    test.skip(!MOCKED(), 'needs MOCK_AI + MOCK_PUPPETEER to mint a draft')
    const draft = await exportedDraft(api)
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto(`/drafts/${draft.id}`)
    const img = page.locator(`img[alt="${draft.topic}"]`)
    await expect(img).toBeVisible({ timeout: 20_000 })
    await img.hover()
    const read = () =>
      img.evaluate((el) => {
        const cs = getComputedStyle(el)
        const frame = getComputedStyle(el.parentElement as HTMLElement)
        return {
          filter: cs.filter,
          transform: cs.transform,
          opacity: cs.opacity,
          mixBlend: cs.mixBlendMode,
          radius: cs.borderRadius,
          fit: cs.objectFit,
          frameRadius: frame.borderRadius,
          frameFilter: frame.filter,
        }
      })
    await expect.poll(read).toEqual({
      filter: 'none',
      transform: 'none',
      opacity: '1',
      mixBlend: 'normal',
      radius: '0px',
      fit: 'contain',
      frameRadius: '0px',
      frameFilter: 'none',
    })
  })
})

// ── Campaigns and projects (T10: AC-12, AC-17, FR-12) ────────────────────────

test.describe('Campaigns and projects (T10)', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    await api.dispose()
  })

  test('AC-17: the campaigns list shows a visible focus indicator on its first three stops', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/campaigns')
    await expect(page.getByRole('heading', { name: 'Campaigns', level: 1 })).toBeVisible()
    await expect(page.getByText('Loading…')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
    // The two header actions, then the first group's project link or campaign
    // link (which one depends on the test DB's data).
    const stops = await tabThreeFromMain(page)
    expect(stops.slice(0, 2)).toEqual(['Show deleted', 'New Campaign'])
    expect(stops).toHaveLength(3)
  })

  test('AC-17: a campaign detail shows a visible focus indicator on its first three stops', async ({ page }) => {
    const camp = await (await api.post('/api/campaigns', { name: `T10 Standalone ${Date.now()}` })).json()
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto(`/campaigns/${camp.id}`)
    await expect(page.getByRole('heading', { name: camp.name, level: 1 })).toBeVisible()
    // The breadcrumb's back button, the briefing's Draft with AI, its first tab.
    expect(await tabThreeFromMain(page)).toEqual(['Campaigns', 'Draft with AI', 'Active'])
  })

  test('AC-12 + FR-12: campaigns and projects lists at 375px keep their controls and never scroll sideways', async ({ page }) => {
    const { project, camp } = await mintCampaignFixture(api)
    await page.setViewportSize({ width: 375, height: 812 })
    await pageLogin(page)

    await page.goto('/campaigns')
    await expect(page.getByRole('link', { name: camp.name })).toBeVisible()
    await expect(page.getByRole('link', { name: project.name })).toBeVisible()
    await expect(page.getByRole('button', { name: `Delete ${camp.name}` })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show deleted' })).toBeVisible()
    await page.getByRole('button', { name: 'New Campaign' }).click()
    await expect(page.getByRole('button', { name: 'New Campaign' })).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('textbox', { name: 'Campaign name' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Project' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Brand kit' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
    await expectNoHorizontalScroll(page, 'campaigns list (create form open) at 375px')

    await page.goto('/projects')
    await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: project.name })).toBeVisible()
    await expect(page.getByRole('button', { name: `Delete ${project.name}` })).toBeVisible()
    await page.getByRole('button', { name: 'New Project' }).click()
    await expect(page.getByRole('textbox', { name: 'Project name' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Default brand kit' })).toBeVisible()
    await expectNoHorizontalScroll(page, 'projects list (create form open) at 375px')

    await page.goto(`/projects/${project.id}`)
    await expect(page.getByRole('heading', { name: project.name, level: 1 })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('button', { name: 'Projects' })).toBeVisible()
    await expect(page.getByRole('link', { name: camp.name })).toBeVisible()
    await expect(page.getByRole('combobox')).toHaveCount(1)
    await expectNoHorizontalScroll(page, 'project detail at 375px')
  })

  test('AC-12 + FR-12: a campaign detail at 375px, with history, Enhance, the queue, its modal and the assistant', async ({ page }) => {
    test.skip(!MOCKED(), 'needs MOCK_AI for Enhance and the briefing assistant')
    const { project, camp } = await mintCampaignFixture(api)
    await page.setViewportSize({ width: 375, height: 812 })
    await pageLogin(page)
    await page.goto(`/campaigns/${camp.id}`)
    await expect(page.getByRole('heading', { name: camp.name, level: 1 })).toBeVisible()

    // The breadcrumb: Projects / <project> / <campaign>.
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(crumbs.getByRole('button', { name: 'Projects' })).toBeVisible()
    await expect(crumbs.getByRole('link', { name: project.name })).toBeVisible()
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText(camp.name)

    // The briefing and the queue, with the aside's two selects.
    await expect(page.getByRole('heading', { name: 'Campaign Briefing', level: 2 })).toBeVisible()
    await expect(page.getByText('T10 briefing v2, the active one')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Planned Posts (2)', level: 2 })).toBeVisible()
    await expect(page.getByRole('combobox')).toHaveCount(2)
    const queue = page.getByRole('region', { name: 'Planned posts' })
    await expect(queue.getByRole('button', { name: 'Edit' })).toHaveCount(1)
    await expect(queue.getByRole('button', { name: 'Cancel' })).toHaveCount(1)
    await expect(queue.getByRole('button', { name: 'Re-run' })).toHaveCount(1)
    await expectNoHorizontalScroll(page, 'campaign detail at 375px')
    // The table is wider than the viewport: its region scrolls by keyboard.
    await queue.focus()
    await expect(queue).toBeFocused()
    expect(await queue.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => queue.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)

    // History: the version rows, with Restore on the inactive one.
    await page.getByRole('tab', { name: 'History' }).click()
    const history = page.getByRole('region', { name: 'Briefing history' })
    await expect(history.getByRole('listitem')).toHaveCount(2)
    await expect(history.getByRole('button', { name: 'Restore' })).toHaveCount(1)
    await expectNoHorizontalScroll(page, 'briefing history at 375px')

    // New Version, then Enhance with AI's before/after.
    await page.getByRole('tab', { name: 'Active' }).click()
    await page.getByRole('button', { name: 'Edit as new version' }).click()
    await expect(page.getByRole('button', { name: 'Save as new version' })).toBeEnabled()
    await page.getByRole('button', { name: 'Enhance with AI' }).click()
    await expect(page.getByRole('region', { name: 'AI suggestion' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('region', { name: 'Before' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Accept suggestion' })).toBeVisible()
    await expectNoHorizontalScroll(page, 'briefing Enhance before/after at 375px')
    await page.getByRole('button', { name: 'Discard', exact: true }).click()

    // The queue entry modal.
    await page.getByRole('button', { name: 'Plan a post' }).click()
    const modal = page.getByRole('dialog', { name: 'Plan a post' })
    await expect(modal.getByRole('textbox', { name: 'Topic' })).toBeVisible()
    await expect(modal.getByRole('checkbox')).toHaveCount(2)
    await expect(modal.getByRole('radio')).toHaveCount(3)
    await expect(modal.getByRole('button', { name: 'Add to queue' })).toBeDisabled()
    await expectNoHorizontalScroll(page, 'queue entry modal at 375px')
    await modal.getByRole('button', { name: 'Cancel' }).click()
    await expect(modal).toBeHidden()

    // The assistant: a briefing reply with Apply, then a schedule plan.
    await page.getByRole('button', { name: 'Draft with AI' }).click()
    const drawer = page.getByRole('dialog', { name: 'Draft briefing with AI' })
    await expect(drawer.getByRole('button', { name: 'Add document' })).toBeVisible()
    const ask = drawer.getByPlaceholder('Tell the assistant about this campaign…')
    await expect(drawer.getByRole('button', { name: 'Send' })).toBeDisabled()
    await ask.fill('A T10 campaign for final-year students.')
    await ask.press('Enter')
    await expect(drawer.getByRole('button', { name: 'Apply this draft to the editor' })).toBeVisible({ timeout: 30_000 })
    await ask.fill('Please schedule a short series of posts.')
    await ask.press('Enter')
    const plan = drawer.getByRole('region', { name: 'Proposed schedule' })
    await expect(plan).toBeVisible({ timeout: 30_000 })
    for (const name of ['Move up', 'Move down', 'Remove post']) {
      await expect(plan.getByRole('button', { name })).toHaveCount(2)
    }
    await expect(plan.getByRole('button', { name: 'Schedule 2 posts' })).toBeVisible()
    await expectNoHorizontalScroll(page, 'briefing assistant with a plan at 375px')
    await drawer.getByRole('button', { name: 'Apply this draft to the editor' }).click()
    await expect(drawer).toBeHidden()
    await expect(page.locator('textarea')).toHaveValue(/Mock campaign briefing draft/)
  })
})

// ── Brand kits (T11: AC-12, AC-17, FR-12) ────────────────────────────────────

// The kit list's row button. Its name starts with the kit's name (the swatch
// titles follow it), and "Delete brand kit …" must not match.
function kitRow(page: Page, name: string): Locator {
  return page.getByRole('button', { name: new RegExp(`^${name}`) })
}

async function openKit(page: Page, name: string) {
  await page.goto('/admin/brandkits')
  await expect(page.getByRole('heading', { name: 'Brand Kits', level: 1 })).toBeVisible()
  await kitRow(page, name).click()
  await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible()
}

test.describe('Brand kits (T11)', () => {
  let api: ApiClient
  // Every kit a case mints is deleted after it, so repeated runs don't grow
  // the kit list (which would also shift which kit sorts first).
  const minted: string[] = []
  const mint = async () => {
    const fixture = await mintBrandKitFixture(api)
    minted.push(fixture.kit.id)
    return fixture
  }
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    for (const id of minted.splice(0)) await api.del(`/api/admin/brandkits/${id}`)
    await api.dispose()
  })

  test('AC-17: the brand kits page, with a kit open, shows a visible focus indicator on its first three stops', async ({ page }) => {
    const { kit } = await mint()
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await openKit(page, kit.name)
    // Add Kit, then the first kit row's select and delete buttons (which kit
    // is first depends on the test DB's data).
    const stops = await tabThreeFromMain(page)
    expect(stops[0]).toBe('Add Kit')
    expect(stops[2]).toMatch(/^Delete brand kit /)
    expect(stops).toHaveLength(3)
  })

  test('AC-12 + FR-12: at 375px a kit keeps its controls, with history, the editors, a template form, the assistant and the Add kit modal', async ({ page }) => {
    test.skip(!MOCKED(), 'needs MOCK_AI for the brand-kit assistant')
    const { kit, stamp } = await mint()
    await page.setViewportSize({ width: 375, height: 812 })
    await pageLogin(page)
    await openKit(page, kit.name)

    const kitPanel = page.getByRole('region', { name: kit.name, exact: true })
    // The kit's header and its numbered sections.
    for (const name of ['Extract from references', 'Set default', 'Edit']) {
      await expect(kitPanel.getByRole('button', { name, exact: true })).toBeVisible()
    }
    for (const name of ['Color Palette', 'Logos', 'Fonts', 'HTML Templates', 'Brand Voice Prompt', 'Artifacts']) {
      await expect(kitPanel.getByRole('heading', { name, level: 3 })).toBeVisible()
    }
    await expect(page.getByRole('button', { name: `Delete brand kit ${kit.name}`, exact: true })).toBeVisible()
    // Logos, templates and artifacts.
    for (const name of ['Add logo', 'From image', 'Upload']) {
      await expect(kitPanel.getByRole('button', { name })).toBeVisible()
    }
    await expect(kitPanel.getByRole('button', { name: 'Add', exact: true })).toBeVisible()
    await expect(kitPanel.getByRole('textbox', { name: 'Logo label' })).toHaveValue(`t11-logo-${stamp}`)
    await expect(kitPanel.getByRole('button', { name: 'Primary', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(kitPanel.getByRole('button', { name: `Delete logo t11-logo-${stamp}` })).toBeVisible()
    await expect(kitPanel.getByRole('button', { name: `Delete template T11 template ${stamp}` })).toBeVisible()
    await expect(kitPanel.getByRole('button', { name: `Feed t11-guide-${stamp}.txt to AI` })).toHaveAttribute('aria-pressed', 'false')
    await expect(kitPanel.getByRole('button', { name: `Delete artifact t11-guide-${stamp}.txt` })).toBeVisible()
    // The voice prompt.
    await expect(kitPanel.getByText('T11 voice v2, the active one')).toBeVisible()
    await expect(kitPanel.getByRole('button', { name: 'Improve with AI' })).toBeVisible()
    await expect(kitPanel.getByRole('button', { name: 'Write manually' })).toBeVisible()
    await expectNoHorizontalScroll(page, 'kit detail at 375px')

    // Prompt history: two version rows, Restore on the inactive one.
    await kitPanel.getByRole('tab', { name: 'History' }).click()
    const history = kitPanel.getByRole('region', { name: 'Prompt history' })
    await expect(history.getByRole('listitem')).toHaveCount(2)
    await expect(history.getByRole('button', { name: 'Restore' })).toHaveCount(1)
    await expectNoHorizontalScroll(page, 'prompt history at 375px')
    await kitPanel.getByRole('tab', { name: 'New Version' }).click()
    await expect(kitPanel.getByPlaceholder('Write your brand voice prompt…')).toBeVisible()
    await expect(kitPanel.getByRole('button', { name: 'Save as new version' })).toBeDisabled()
    await kitPanel.getByRole('tab', { name: 'Active' }).click()

    // Edit: the name field, the colour and font editors, the font combobox open.
    await kitPanel.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(kitPanel.getByRole('textbox', { name: 'Kit name' })).toHaveValue(kit.name)
    await expect(kitPanel.getByRole('button', { name: 'Remove color #0b6e4f' })).toBeVisible()
    await expect(kitPanel.getByRole('button', { name: 'Remove font DM Sans' })).toBeVisible()
    await kitPanel.getByRole('combobox').fill('Ro')
    await expect(kitPanel.getByRole('listbox', { name: 'Google Fonts matches' })).toBeVisible()
    await expectNoHorizontalScroll(page, 'kit edit mode at 375px')
    await kitPanel.getByRole('combobox').press('Escape')
    await expect(kitPanel.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
    await kitPanel.getByRole('button', { name: 'Cancel', exact: true }).click()

    // The template form: name, the size choices, the HTML field.
    await kitPanel.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(kitPanel.getByRole('textbox', { name: 'Template name' })).toBeVisible()
    const sizes = kitPanel.getByRole('group', { name: 'Size' }).getByRole('button')
    await expect(sizes.first()).toHaveAttribute('aria-pressed', 'true')
    await expect(kitPanel.getByRole('button', { name: 'Save template' })).toBeDisabled()
    await expectNoHorizontalScroll(page, 'template form at 375px')
    await kitPanel.getByRole('button', { name: 'Cancel', exact: true }).click()

    // The assistant: its source document, then a proposal to review and apply.
    await page.getByRole('button', { name: 'Extract from references' }).click()
    const drawer = page.getByRole('dialog', { name: 'Extract brand from references' })
    await expect(drawer.getByRole('button', { name: 'Add document' })).toBeVisible()
    await expect(drawer.getByRole('button', { name: `Delete t11-brand-book-${stamp}.txt` })).toBeVisible()
    await expect(drawer.getByRole('button', { name: 'Send' })).toBeDisabled()
    const ask = drawer.getByPlaceholder('e.g. Extract the brand voice and style from these references')
    await ask.fill('Extract the brand voice and style from these references')
    await ask.press('Enter')
    const proposal = drawer.getByRole('region', { name: 'Proposed brand' })
    await expect(proposal).toBeVisible({ timeout: 30_000 })
    await expect(proposal.getByRole('textbox', { name: 'Brand voice' })).not.toHaveValue('')
    await expect(proposal.getByRole('button', { name: /^Remove color / }).first()).toBeVisible()
    await expect(proposal.getByRole('button', { name: 'Dismiss' })).toBeVisible()
    await expectNoHorizontalScroll(page, 'assistant with a proposal at 375px')
    await proposal.getByRole('button', { name: 'Apply voice + colors' }).click()
    await expect(drawer).toBeHidden()

    // The Add kit modal.
    await page.getByRole('button', { name: 'Add Kit' }).click()
    const modal = page.getByRole('dialog', { name: 'New Brand Kit' })
    await expect(modal.getByRole('textbox', { name: 'Name' })).toBeVisible()
    await expect(modal.getByRole('button', { name: 'Create' })).toBeDisabled()
    await expectNoHorizontalScroll(page, 'Add kit modal at 375px')
    await modal.getByRole('button', { name: 'Cancel' }).click()
    await expect(modal).toBeHidden()
  })

  for (const theme of THEMES) {
    test(`a kit's colour swatches show the kit's own colour, not a token (${theme})`, async ({ page }) => {
      const { kit } = await mint()
      await storeTheme(page, theme)
      await page.setViewportSize({ width: 1440, height: 900 })
      await pageLogin(page)
      await openKit(page, kit.name)
      await expectTheme(page, theme)
      for (const [hex, rgb] of [['#0b6e4f', 'rgb(11, 110, 79)'], ['#f2c14e', 'rgb(242, 193, 78)']]) {
        // One in the kit's list row, one in the open kit's palette.
        const swatches = [
          kitRow(page, kit.name).locator(`span[title="${hex}"]`),
          page.getByRole('region', { name: kit.name, exact: true }).locator(`span[title="${hex}"]`),
        ]
        for (const swatch of swatches) {
          await expect(swatch).toHaveCount(1)
          await expect(swatch).toHaveCSS('background-color', rgb)
        }
      }
    })
  }
})

// ── Team, settings and admin (T12: AC-12, AC-17, FR-12) ──────────────────────

test.describe('Team, settings and admin (T12)', () => {
  // API keys a case creates through the UI, revoked after it (a key can't be
  // deleted, only revoked). The page's own request context carries the active
  // team cookie the /api/team routes need.
  const createdKeyLabels: string[] = []
  test.afterEach(async ({ page }) => {
    const labels = createdKeyLabels.splice(0)
    if (labels.length === 0) return
    const res = await page.request.get('/api/team/api-keys')
    const { keys } = (await res.json()) as { keys: { id: string; label: string; revokedAt: string | null }[] }
    for (const k of keys) {
      if (labels.includes(k.label) && !k.revokedAt) await page.request.delete(`/api/team/api-keys/${k.id}`)
    }
  })

  test('AC-17: /settings, /team, /admin/users and /admin/teams show a visible focus indicator on their first three stops', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)

    // /settings opens on the connect guide's OS tabs (no roving tabindex, so
    // each tab is a stop).
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Claude account', exact: true })).toBeVisible()
    expect(await tabThreeFromMain(page)).toEqual(['Windows', 'macOS', 'Linux'])

    // /team opens on the first provider row's quiet controls; which provider
    // is first depends on the test DB, so only the count is fixed.
    await page.goto('/team')
    await expect(page.getByRole('heading', { name: 'AI Providers' })).toBeVisible()
    await expect(page.getByTestId('image-default-state')).toBeVisible()
    expect(await tabThreeFromMain(page)).toHaveLength(3)

    // /admin/users: Add user, the table's scroll region, then the first
    // unlocked row's Reset password (your own row has no actions).
    await page.goto('/admin/users')
    // Wait for the rows: the region renders before the list loads.
    await expect(page.getByRole('button', { name: 'Reset password' }).first()).toBeVisible()
    const userStops = await tabThreeFromMain(page)
    expect(userStops.slice(0, 2)).toEqual(['Add user', 'Users'])
    expect(userStops[2]).toContain('Reset password')

    // /admin/teams: Add team, the scroll region, then the first row's Members.
    await page.goto('/admin/teams')
    await expect(page.getByRole('button', { name: 'Members', exact: true }).first()).toBeVisible()
    const teamStops = await tabThreeFromMain(page)
    expect(teamStops.slice(0, 2)).toEqual(['Add team', 'Teams'])
    expect(teamStops[2]).toContain('Members')
  })

  test('AC-12 + FR-12: /settings at 375px keeps its guide tabs, token fields and password form', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await pageLogin(page)
    await page.goto('/settings')

    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
    for (const name of ['Claude account', 'OpenAI key', 'Password']) {
      await expect(page.getByRole('heading', { name, exact: true, level: 2 })).toBeVisible()
    }
    const tablist = page.getByRole('tablist', { name: 'Operating system' })
    await expect(tablist.getByRole('tab')).toHaveText(['Windows', 'macOS', 'Linux'])
    for (const os of ['Windows', 'macOS', 'Linux']) {
      await tablist.getByRole('tab', { name: os }).click()
      await expect(tablist.getByRole('tab', { name: os })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('tabpanel').getByRole('button', { name: 'Copy command' }).first()).toBeVisible()
      await expectNoHorizontalScroll(page, `settings guide (${os}) at 375px`)
    }

    const claudeForm = page.locator('form', { has: page.getByLabel('Claude OAuth token') })
    await expect(claudeForm.getByRole('button', { name: /^(Connect|Replace)$/ })).toBeDisabled()
    const openAiForm = page.locator('form', { has: page.getByLabel('OpenAI API key') })
    await expect(openAiForm.getByRole('button', { name: /^(Connect|Replace)$/ })).toBeDisabled()
    for (const name of ['Current password', 'New password', 'Confirm new password']) {
      await expect(page.getByRole('textbox', { name, exact: true })).toBeVisible()
    }
    await expect(page.getByRole('button', { name: 'Change password' })).toBeDisabled()
    await expectNoHorizontalScroll(page, 'settings at 375px')
  })

  test('AC-12 + FR-12: /team at 375px keeps providers, channels, the team token and API keys, with the register form and key modals open', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await pageLogin(page)
    await page.goto('/team')

    await expect(page.getByRole('heading', { name: 'Team settings', level: 1 })).toBeVisible()
    for (const name of ['AI Providers', 'Social Channels', 'Team Claude account', 'API keys']) {
      await expect(page.getByRole('heading', { name, exact: true, level: 2 })).toBeVisible()
    }
    await expect(page.getByRole('heading', { name: 'Image generation', level: 3 })).toBeVisible()
    // Social channels: both rows, each with its token reveal and Save.
    await expect(page.getByRole('button', { name: 'Show access token' })).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(2)
    // The team token, with its guide.
    await expect(page.getByRole('textbox', { name: 'Team Claude OAuth token' })).toBeVisible()
    await expect(page.getByRole('tablist', { name: 'Operating system' }).getByRole('tab')).toHaveText(['Windows', 'macOS', 'Linux'])
    await expectNoHorizontalScroll(page, 'team at 375px')

    // The register form (API mode, so COPY and IMAGE are offered).
    await page.getByRole('button', { name: 'Register Provider' }).click()
    await expect(page.getByRole('heading', { name: 'Register new provider', level: 3 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show API key' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'COPY' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'IMAGE' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Register', exact: true })).toBeDisabled()
    await expectNoHorizontalScroll(page, 'register form at 375px')

    // Create an API key; the one-time reveal shows the plaintext and Copy.
    const label = `T12 key ${Date.now()}`
    await page.getByRole('button', { name: 'Create key' }).click()
    const create = page.getByRole('dialog', { name: 'Create API key' })
    await create.getByRole('textbox', { name: 'Label' }).fill(label)
    await expectNoHorizontalScroll(page, 'create key modal at 375px')
    createdKeyLabels.push(label)
    await create.getByRole('button', { name: 'Create', exact: true }).click()
    const reveal = page.getByRole('dialog', { name: `Key created — ${label}` })
    await expect(reveal.locator('code')).toHaveText(/^bstk_/)
    await expect(reveal.getByRole('button', { name: 'Copy' })).toBeVisible()
    await expectNoHorizontalScroll(page, 'key reveal modal at 375px')
    await reveal.getByRole('button', { name: 'Done' }).click()
    await expect(reveal).toBeHidden()
    // Its row: the label and a Revoke control.
    const row = page.getByRole('listitem').filter({ hasText: label })
    await expect(row.getByRole('button', { name: 'Revoke' })).toBeVisible()
  })

  test('AC-12 + FR-12: /admin/users at 375px keeps the table controls and its modals', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await pageLogin(page)
    await page.goto('/admin/users')

    await expect(page.getByRole('heading', { name: 'Users', level: 1 })).toBeVisible()
    const table = page.getByRole('region', { name: 'Users' })
    for (const name of ['Name', 'Username', 'Status', 'Created', 'Actions']) {
      await expect(table.getByRole('columnheader', { name, exact: true })).toHaveCount(1)
    }
    // The seeded editor's row: a status word, Reset password and Deactivate.
    const editorRow = table.getByRole('row').filter({ has: page.getByRole('cell', { name: 'editor', exact: true }) })
    await expect(editorRow.getByText(/^(Active|Deactivated)$/)).toBeVisible()
    await expect(editorRow.getByRole('button', { name: 'Reset password' })).toHaveCount(1)
    await expect(editorRow.getByRole('button', { name: /^(Deactivate|Reactivate)$/ })).toHaveCount(1)
    await expectNoHorizontalScroll(page, 'users at 375px')

    await page.getByRole('button', { name: 'Add user' }).click()
    const add = page.getByRole('dialog', { name: 'Add user' })
    for (const name of ['Name', 'Username', 'Initial password']) {
      await expect(add.getByRole('textbox', { name, exact: true })).toBeVisible()
    }
    await expect(add.getByRole('button', { name: 'Create user' })).toBeVisible()
    await expectNoHorizontalScroll(page, 'add user modal at 375px')
    await add.getByRole('button', { name: 'Cancel' }).click()
    await expect(add).toBeHidden()

    await editorRow.getByRole('button', { name: 'Reset password' }).click()
    const reset = page.getByRole('dialog', { name: /^Reset password — / })
    await expect(reset.getByRole('textbox', { name: 'New password' })).toBeVisible()
    await expectNoHorizontalScroll(page, 'reset password modal at 375px')
    await reset.getByRole('button', { name: 'Cancel' }).click()
    await expect(reset).toBeHidden()
  })

  test('AC-12 + FR-12: /admin/teams at 375px keeps the table, membership editing and its modals', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await pageLogin(page)
    await page.goto('/admin/teams')

    await expect(page.getByRole('heading', { name: 'Teams', level: 1 })).toBeVisible()
    const table = page.getByRole('region', { name: 'Teams' })
    const bistec = table.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Bistec', exact: true }) })
    for (const name of ['Members', 'Rename', 'Delete']) {
      await expect(bistec.getByRole('button', { name, exact: true })).toBeVisible()
    }
    await expectNoHorizontalScroll(page, 'teams at 375px')

    // Membership editing.
    const members = bistec.getByRole('button', { name: 'Members', exact: true })
    await expect(members).toHaveAttribute('aria-expanded', 'false')
    await members.click()
    await expect(members).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('heading', { name: 'Members of Bistec', level: 2 })).toBeVisible()
    await expect(page.getByRole('combobox', { name: /^Role for / }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove' }).first()).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'User to add' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Role for new member' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeDisabled()
    await expectNoHorizontalScroll(page, 'membership panel at 375px')
    await page.getByRole('button', { name: 'Close member panel' }).click()
    await expect(page.getByRole('heading', { name: 'Members of Bistec' })).toBeHidden()

    await bistec.getByRole('button', { name: 'Rename', exact: true }).click()
    const rename = page.getByRole('dialog', { name: 'Rename team — Bistec' })
    await expect(rename.getByRole('textbox', { name: 'Team name' })).toHaveValue('Bistec')
    await expectNoHorizontalScroll(page, 'rename modal at 375px')
    await rename.getByRole('button', { name: 'Cancel' }).click()
    await expect(rename).toBeHidden()

    await page.getByRole('button', { name: 'Add team' }).click()
    const add = page.getByRole('dialog', { name: 'Add team' })
    await expect(add.getByRole('textbox', { name: 'Team name' })).toBeVisible()
    await expect(add.getByRole('button', { name: 'Create team' })).toBeDisabled()
    await expectNoHorizontalScroll(page, 'add team modal at 375px')
    await add.getByRole('button', { name: 'Cancel' }).click()
    await expect(add).toBeHidden()
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
