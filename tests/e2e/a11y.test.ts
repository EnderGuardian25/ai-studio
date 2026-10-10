import { test, expect, type Locator, type Page } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  briefDraftIds,
  expectNoHorizontalScroll,
  mintBrandKitFixture,
  mintCampaignFixture,
  mintExportedDraft,
  pageLogin,
  tabThreeFromMain,
  tabThreeWithVisibleFocus,
} from '../helpers/ui'

// Change 014 — accessibility naming and the consistency pass. Each wave 2 and
// wave 3 task adds its own describe block here (design.md §6):
//   T9:  AC-05 (FR-06, one field-label style) and AC-11 (FR-12) for rows 6,
//        14, 21 and 22; the group captions name their groups (§8.3).
//   T10: AC-06 (FR-07, one control height per size, read from --control-*).
//   T11: brand kits — AC-07 (FR-08, one accent primary), AC-08 (FR-09, the
//        kit-list region), AC-11 (FR-12) for rows 12, 13, 15, 16 and 17, and
//        AC-15's kit part (FR-16, read-once swatches).
//   T12: AC-09 (FR-10, tabular figures on the body).
//   T13: AC-11 (FR-12) for rows 1–5 (login, library, brief) and AC-13 (FR-14,
//        the login h1).

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)

// ── Helpers ──────────────────────────────────────────────────────────────────

// The computed type of a field label (AC-05).
async function labelStyle(label: Locator) {
  await expect(label).toBeVisible()
  return label.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      textTransform: cs.textTransform,
      fontSize: cs.fontSize,
      letterSpacing: cs.letterSpacing,
      color: cs.color,
    }
  })
}

// The <label for> that names a field: the association, not the text, is what
// this finds.
async function labelFor(page: Page, field: Locator): Promise<Locator> {
  const id = await field.getAttribute('id')
  expect(id, 'the field has an id for its label').toBeTruthy()
  return page.locator(`label[for="${id}"]`)
}

// AC-11: the label names exactly one field, the label text is visible, and
// (where the field has a placeholder today) the placeholder still finds the
// same element.
async function expectLabelled(
  scope: Page | Locator,
  label: string,
  opts: { tag: 'INPUT' | 'TEXTAREA' | 'SELECT'; placeholder?: string },
) {
  const byLabel = scope.getByLabel(label, { exact: true })
  await expect(byLabel, `"${label}" names exactly one field`).toHaveCount(1)
  await expect(byLabel).toHaveJSProperty('tagName', opts.tag)
  await expect(
    scope.locator('label').filter({ hasText: new RegExp(`^${label}$`) }),
    `the "${label}" label is visible`,
  ).toBeVisible()
  if (opts.placeholder) {
    const byPlaceholder = scope.getByPlaceholder(opts.placeholder, { exact: true })
    await expect(byPlaceholder).toHaveCount(1)
    await expect(byLabel.and(byPlaceholder), 'label and placeholder find the same element').toHaveCount(1)
  }
}

// Walk /brief to step 2 (Size & Design), picking the first kit if none is set.
async function briefStepTwo(page: Page) {
  await page.goto('/brief')
  await expect(page.getByRole('heading', { name: 'Select Campaign' })).toBeVisible()
  await page.getByRole('button', { name: /continue/i }).click()
  await expect(page.getByRole('heading', { name: 'Size & Design' })).toBeVisible()
  const kit = page.getByRole('combobox', { name: 'Brand Kit' })
  // The kit options load after the step renders: wait for one before choosing.
  await expect(kit.locator('option:not([value=""])').first()).toBeAttached()
  if ((await kit.inputValue()) === '') {
    const values = await kit
      .locator('option')
      .evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.value).filter(Boolean))
    await kit.selectOption(values[0])
  }
  return kit
}

// ── T9: one field-label style (AC-05) and rows 6, 14, 21, 22 (AC-11) ─────────

test.describe('Field labels (T9)', () => {
  let api: ApiClient
  let before: Set<string>
  // Every kit a case mints is deleted after it.
  const mintedKits: string[] = []
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    before = new Set(await briefDraftIds(api))
  })
  // A brief walk can autosave an unfinished brief; discard any this suite made.
  test.afterEach(async () => {
    for (const id of await briefDraftIds(api)) {
      if (!before.has(id)) await api.del(`/api/brief-drafts/${id}`)
    }
    for (const id of mintedKits.splice(0)) await api.del(`/api/admin/brandkits/${id}`)
    await api.dispose()
  })

  test('AC-05: Input and Select labels share the brief FieldLabel style (small caps)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)

    // The reference: the brief's "Topic" FieldLabel on step 3.
    await briefStepTwo(page)
    // Path B needs no template, so step 2 can continue.
    await page.getByRole('button', { name: /Path B — Freeform/ }).click()
    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByRole('heading', { name: 'Brief & Copy Direction' })).toBeVisible()
    const reference = await labelStyle(page.locator('label').filter({ hasText: /^Topic$/ }))
    expect(reference.textTransform).toBe('uppercase')
    expect(reference.fontSize).toBe('11px')

    // The campaign create form: an Input label and a Select label.
    await page.goto('/campaigns')
    await expect(page.getByRole('heading', { name: 'Campaigns', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'New Campaign' }).click()
    const name = page.getByRole('textbox', { name: 'Campaign name', exact: true })
    const project = page.getByRole('combobox', { name: 'Project', exact: true })
    await expect(name).toBeVisible()
    await expect(project).toBeVisible()
    expect(await labelStyle(await labelFor(page, name)), 'the "Campaign name" Input label').toEqual(reference)
    expect(await labelStyle(await labelFor(page, project)), 'the "Project" Select label').toEqual(reference)
  })

  test('AC-05 + AC-11 row 6: the brief brand kit select is named "Brand Kit"', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    const kit = await briefStepTwo(page)
    await expect(kit).toHaveCount(1)
    await expectLabelled(page, 'Brand Kit', { tag: 'SELECT' })
  })

  test('AC-11 row 14: the template HTML/CSS field is labelled, and "Size" is a group caption', async ({ page }) => {
    const { kit } = await mintBrandKitFixture(api)
    mintedKits.push(kit.id)
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/admin/brandkits')
    await expect(page.getByRole('heading', { name: 'Brand Kits', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: new RegExp(`^${kit.name}`) }).click()
    await expect(page.getByRole('heading', { name: kit.name, level: 2 })).toBeVisible()

    // The innermost section holding the HTML Templates head (the kit's own
    // section holds it too, and comes first).
    const templates = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'HTML Templates', level: 3 }) })
      .last()
    await templates.getByRole('button', { name: 'Add', exact: true }).click()
    await expectLabelled(templates, 'HTML/CSS', { tag: 'TEXTAREA', placeholder: '<!DOCTYPE html>…' })
    // The size caption is a span over a group named by its own aria-label.
    const size = templates.getByRole('group', { name: 'Size' })
    await expect(size).toBeVisible()
    await expect(templates.locator('label').filter({ hasText: /^Size$/ })).toHaveCount(0)
    await expect(templates.locator('span').filter({ hasText: /^Size$/ })).toBeVisible()
  })

  test('AC-11 rows 21 and 22: the queue modal labels Post specifics and the Template select', async ({ page }) => {
    const { camp } = await mintCampaignFixture(api)
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto(`/campaigns/${camp.id}`)
    await expect(page.getByRole('heading', { name: camp.name, level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Plan a post' }).click()
    const modal = page.getByRole('dialog', { name: 'Plan a post' })
    await expect(modal).toBeVisible()

    // Row 21.
    await expectLabelled(modal, 'Post specifics', {
      tag: 'TEXTAREA',
      placeholder: 'What this specific post should say — the campaign briefing carries the rest.',
    })

    // Row 22: the select appears on the Template design path.
    await modal.getByRole('tab', { name: 'Template', exact: true }).click()
    await expectLabelled(modal, 'Template', { tag: 'SELECT' })
    await expect(modal.getByRole('combobox', { name: 'Template', exact: true })).toBeVisible()
  })

  test('§8.3: the Channels and After generation captions name their groups', async ({ page }) => {
    test.skip(!MOCKED(), 'needs MOCK_AI + MOCK_PUPPETEER to mint an exported draft')
    const { camp } = await mintCampaignFixture(api)
    const draft = await mintExportedDraft(api, `a11y-groups-${Date.now()}`)
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)

    // The queue modal: the channel checkboxes and the post-action radios.
    await page.goto(`/campaigns/${camp.id}`)
    await expect(page.getByRole('heading', { name: camp.name, level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Plan a post' }).click()
    const modal = page.getByRole('dialog', { name: 'Plan a post' })
    const queueChannels = modal.getByRole('group', { name: 'Channels', exact: true })
    await expect(queueChannels).toBeVisible()
    await expect(queueChannels.getByRole('checkbox')).toHaveCount(2)
    const action = modal.getByRole('radiogroup', { name: 'After generation', exact: true })
    await expect(action).toBeVisible()
    await expect(action.getByRole('radio')).toHaveCount(3)
    await modal.getByRole('button', { name: 'Cancel' }).click()
    await expect(modal).toBeHidden()

    // The publish dialog, from the draft page.
    await page.goto(`/drafts/${draft.id}`)
    await page.getByRole('button', { name: /^publish$/i }).click()
    const publish = page.getByRole('dialog', { name: 'Publish Post' })
    const publishChannels = publish.getByRole('group', { name: 'Channels', exact: true })
    await expect(publishChannels).toBeVisible()
    await expect(publishChannels.getByRole('checkbox')).toHaveCount(2)
  })
})

// ── T10: one control height per size, from the --control-* tokens (AC-06) ────

const CONTROL_PX = { sm: 30, md: 36 } as const
// Values no literal utility produces, for the override check below.
const OVERRIDE_PX = { sm: 44, md: 52 } as const

async function heightOf(control: Locator) {
  await expect(control).toBeVisible()
  return (await control.boundingBox())?.height ?? NaN
}

// Each control is its size's token height (± 0.5 px). Then the tokens are
// overridden on :root and every control must follow: a control that writes its
// height as a literal (h-9, h-[30px]) would keep its old height and fail.
async function expectControlHeights(page: Page, controls: [string, Locator, keyof typeof CONTROL_PX][]) {
  for (const [name, control, size] of controls) {
    expect(await heightOf(control), `${name}: --control-${size}`).toBeCloseTo(CONTROL_PX[size], 0)
  }
  await page.evaluate((px) => {
    for (const [size, value] of Object.entries(px)) {
      document.documentElement.style.setProperty(`--control-${size}`, `${value}px`)
    }
  }, OVERRIDE_PX)
  try {
    for (const [name, control, size] of controls) {
      await expect
        .poll(() => heightOf(control), { message: `${name} follows --control-${size}` })
        .toBeCloseTo(OVERRIDE_PX[size], 0)
    }
  } finally {
    await page.evaluate(() => {
      for (const size of ['sm', 'md']) document.documentElement.style.removeProperty(`--control-${size}`)
    })
  }
}

test.describe('Control heights (T10)', () => {
  let api: ApiClient
  const mintedKits: string[] = []
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    for (const id of mintedKits.splice(0)) await api.del(`/api/admin/brandkits/${id}`)
    await api.dispose()
  })

  test('AC-06: the campaign form Input, Select and md Button are --control-md tall', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/campaigns')
    await expect(page.getByRole('heading', { name: 'Campaigns', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'New Campaign' }).click()
    const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Create', exact: true }) })
    await expectControlHeights(page, [
      ['"Campaign name" Input', form.getByRole('textbox', { name: 'Campaign name', exact: true }), 'md'],
      ['"Project" Select', form.getByRole('combobox', { name: 'Project', exact: true }), 'md'],
      ['"Create" md Button', form.getByRole('button', { name: 'Create', exact: true }), 'md'],
    ])
  })

  test('AC-06: in kit edit mode the add-colour field and its sm "Add" are --control-sm tall', async ({ page }) => {
    const { kit } = await mintBrandKitFixture(api)
    mintedKits.push(kit.id)
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/admin/brandkits')
    await expect(page.getByRole('heading', { name: 'Brand Kits', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: new RegExp(`^${kit.name}`) }).click()
    await expect(page.getByRole('heading', { name: kit.name, level: 2 })).toBeVisible()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()

    const colour = page.getByPlaceholder('#1A2B3C', { exact: true })
    // The colour editor's own row: the field and the Add beside it.
    const row = page.locator('div').filter({ has: colour }).filter({ has: page.getByRole('button', { name: 'Add' }) }).last()
    await expectControlHeights(page, [
      ['add-colour field (COMPACT_FIELD)', colour, 'sm'],
      ['colour "Add" sm Button', row.getByRole('button', { name: 'Add', exact: true }), 'sm'],
      // A raw single-line input on the same view (inputClasses).
      ['font search field', page.getByPlaceholder('Search Google Fonts…', { exact: true }), 'md'],
    ])
  })
})

// ── T11: brand kits — one accent primary, the kit-list region, labels, swatches ─

// Open a kit from the list and wait for its panel (a region named by the kit).
async function openKit(page: Page, name: string): Promise<Locator> {
  await page.goto('/admin/brandkits')
  await expect(page.getByRole('heading', { name: 'Brand Kits', level: 1 })).toBeVisible()
  await page
    .getByRole('region', { name: 'Brand kits', exact: true })
    .getByRole('button', { name: new RegExp(`^${name}`) })
    .click()
  await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible()
  return page.getByRole('region', { name, exact: true })
}

// The innermost section holding a kit section's h3 (the kit's own section
// holds it too, and comes first).
function kitSection(page: Page, title: string): Locator {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: title, level: 3 }) }).last()
}

test.describe('Brand kits (T11)', () => {
  let api: ApiClient
  const mintedKits: string[] = []
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    for (const id of mintedKits.splice(0)) await api.del(`/api/admin/brandkits/${id}`)
    await api.dispose()
  })
  const mint = async () => {
    const fixture = await mintBrandKitFixture(api)
    mintedKits.push(fixture.kit.id)
    return fixture
  }

  test('AC-07: with a kit in edit mode, the template form and New Version open, the kit Save is the only accent fill', async ({ page }) => {
    const { kit } = await mint()
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    const kitPanel = await openKit(page, kit.name)
    await kitPanel.getByRole('button', { name: 'Edit', exact: true }).click()
    await kitSection(page, 'HTML Templates').getByRole('button', { name: 'Add', exact: true }).click()
    await kitPanel.getByRole('tab', { name: 'New Version' }).click()
    const saveTemplate = kitPanel.getByRole('button', { name: 'Save template' })
    const saveVersion = kitPanel.getByRole('button', { name: 'Save as new version' })
    await expect(saveTemplate).toBeVisible()
    await expect(saveVersion).toBeVisible()

    // The tokens as computed colours, read off :root.
    const { accent, fg } = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement)
      const rgb = (name: string) => `rgb(${root.getPropertyValue(name).trim().split(/\s+/).join(', ')})`
      return { accent: rgb('--accent'), fg: rgb('--fg') }
    })
    const accentFilled = await page.locator('main button').evaluateAll(
      (buttons, colour) =>
        buttons
          .filter((b) => getComputedStyle(b).backgroundColor === colour)
          .map((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim()),
      accent,
    )
    expect(accentFilled, 'the accent-filled buttons in main').toEqual(['Save'])
    // The inline-form submits are Ink.
    await expect(saveTemplate).toHaveCSS('background-color', fg)
    await expect(saveVersion).toHaveCSS('background-color', fg)
  })

  test('AC-08: the kit list is a capped, focusable "Brand kits" region with a visible focus indicator', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/admin/brandkits')
    await expect(page.getByRole('heading', { name: 'Brand Kits', level: 1 })).toBeVisible()
    const list = page.getByRole('region', { name: 'Brand kits', exact: true })
    await expect(list.getByRole('listitem').first()).toBeVisible()
    await expect(list).toHaveAttribute('tabindex', '0')
    await expect(list).toHaveCSS('max-height', '512px')
    await expect(list).toHaveCSS('overflow-y', 'auto')
    // With no kit open, Add Kit is the first stop and the region the second;
    // the helper fails a stop that draws no focus indicator.
    const stops = await tabThreeFromMain(page)
    expect(stops.slice(0, 2)).toEqual(['Add Kit', 'Brand kits'])
  })

  test('AC-15 (kit part): a kit row is named by the kit alone; its swatches are aria-hidden and keep their titles', async ({ page }) => {
    const { kit } = await mint()
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/admin/brandkits')
    const row = page
      .getByRole('region', { name: 'Brand kits', exact: true })
      .getByRole('button', { name: new RegExp(`^${kit.name}( default)?$`) })
    await expect(row).toHaveCount(1)
    await expect(row).toHaveAccessibleName(kit.name)
    const swatches = row.locator('span[title^="#"]')
    await expect(swatches).toHaveCount(2)
    for (const hex of ['#0b6e4f', '#f2c14e']) {
      await expect(row.locator(`span[title="${hex}"]`)).toHaveAttribute('aria-hidden', 'true')
    }
  })

  test('AC-11 rows 12, 13 and 16: the add-colour field, the font search and the voice prompt are labelled', async ({ page }) => {
    const { kit } = await mint()
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    const kitPanel = await openKit(page, kit.name)

    // Row 16, on the New Version tab.
    await kitPanel.getByRole('tab', { name: 'New Version' }).click()
    await expectLabelled(kitPanel, 'Brand voice prompt', { tag: 'TEXTAREA', placeholder: 'Write your brand voice prompt…' })

    // Rows 12 and 13, in edit mode.
    await kitPanel.getByRole('button', { name: 'Edit', exact: true }).click()
    await expectLabelled(kitPanel, 'Add color', { tag: 'INPUT', placeholder: '#1A2B3C' })
    await expectLabelled(kitPanel, 'Search Google Fonts', { tag: 'INPUT', placeholder: 'Search Google Fonts…' })
    await expect(kitPanel.getByRole('combobox', { name: 'Search Google Fonts', exact: true })).toBeVisible()
  })

  test('AC-11 rows 15 and 17: the brand description and the assistant message are labelled', async ({ page }) => {
    // A kit with no voice prompt, so the brand description field shows.
    const kit = await (
      await api.post('/api/admin/brandkits', { name: `T11 Bare Kit ${Date.now()}`, colors: ['#0b6e4f'] })
    ).json()
    mintedKits.push(kit.id)
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    const kitPanel = await openKit(page, kit.name)

    // Row 15.
    await expect(kitPanel.getByText('No active prompt. Generate one below.')).toBeVisible()
    await expectLabelled(kitPanel, 'Brand description', {
      tag: 'INPUT',
      placeholder: 'Describe your brand in a few sentences…',
    })

    // Row 17, in the assistant drawer.
    await kitPanel.getByRole('button', { name: 'Extract from references' }).click()
    const drawer = page.getByRole('dialog', { name: 'Extract brand from references' })
    await expect(drawer).toBeVisible()
    await expectLabelled(drawer, 'Message', {
      tag: 'INPUT',
      placeholder: 'e.g. Extract the brand voice and style from these references',
    })
  })
})

// ── T12: tabular figures on the body (AC-09) ─────────────────────────────────

test.describe('Body figures (T12)', () => {
  test('AC-09: the body computes font-variant-numeric: tabular-nums, signed out and in', async ({ page }) => {
    const bodyFigures = () => page.evaluate(() => getComputedStyle(document.body).fontVariantNumeric)

    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    expect(await bodyFigures()).toBe('tabular-nums')

    await pageLogin(page)
    await page.goto('/library')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await bodyFigures()).toBe('tabular-nums')
  })
})

// ── T13: labels on login, library and brief (AC-11 rows 1–5); the login h1 ───

test.describe('Labels: login, library, brief (T13)', () => {
  test('AC-11 rows 1 and 2: the login Username and Password fields are labelled', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expectLabelled(page, 'Username', { tag: 'INPUT', placeholder: 'Username' })
    await expectLabelled(page, 'Password', { tag: 'INPUT', placeholder: 'Password' })
    // The accessible names are unchanged.
    await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toHaveAttribute('type', 'text')
  })

  test('AC-13: /login has one sr-only h1 "Sign in to Studio", and its focus stops are unchanged', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expect(page.locator('h1')).toHaveCount(1)
    const h1 = page.getByRole('heading', { level: 1, name: 'Sign in to Studio', exact: true })
    await expect(h1).toHaveCount(1)
    await expect(h1).toHaveClass(/(^|\s)sr-only(\s|$)/)
    expect(await tabThreeWithVisibleFocus(page)).toEqual(['Username', 'Password', 'Sign in'])
  })

  test('AC-11 row 3: the library search is labelled "Search by topic", above the field', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await pageLogin(page)
    await page.goto('/library')
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible()
    await expectLabelled(page, 'Search by topic', { tag: 'INPUT', placeholder: 'Search by topic…' })

    // The label sits over the field, which keeps its 288 px column (sm:w-72).
    const field = page.getByLabel('Search by topic', { exact: true })
    const label = page.locator('label').filter({ hasText: /^Search by topic$/ })
    const [f, l] = [await field.boundingBox(), await label.boundingBox()]
    expect(f && l, 'the field and its label have boxes').toBeTruthy()
    expect(l!.y + l!.height).toBeLessThanOrEqual(f!.y)
    expect(Math.abs(l!.x - f!.x)).toBeLessThan(1)
    expect(f!.width).toBeCloseTo(288, 0)

    // The head still fits at the md and phone widths.
    for (const width of [768, 375]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(field).toBeVisible()
      await expectNoHorizontalScroll(page, `library at ${width}px`)
    }
  })

  test('AC-11 rows 4 and 5: the brief Topic and Brief fields are labelled', async ({ page, request }) => {
    const api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
    const before = new Set(await briefDraftIds(api))
    try {
      await page.setViewportSize({ width: 1440, height: 900 })
      await pageLogin(page)
      await briefStepTwo(page)
      await page.getByRole('button', { name: /Path B — Freeform/ }).click()
      await page.getByRole('button', { name: /continue/i }).click()
      await expect(page.getByRole('heading', { name: 'Brief & Copy Direction' })).toBeVisible()
      await expectLabelled(page, 'Topic', { tag: 'INPUT', placeholder: 'e.g. Q3 product launch' })
      await expectLabelled(page, 'Brief', {
        tag: 'TEXTAREA',
        placeholder:
          'e.g. Announce our Q3 product launch with excitement. Highlight that it saves the marketing team hours on post creation. Include a CTA to try it.',
      })
    } finally {
      // A brief walk can autosave an unfinished brief; discard any this case made.
      for (const id of await briefDraftIds(api)) {
        if (!before.has(id)) await api.del(`/api/brief-drafts/${id}`)
      }
      await api.dispose()
    }
  })
})
