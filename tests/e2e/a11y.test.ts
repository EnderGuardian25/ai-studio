import { test, expect, type Locator, type Page } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  briefDraftIds,
  mintBrandKitFixture,
  mintCampaignFixture,
  mintExportedDraft,
  pageLogin,
} from '../helpers/ui'

// Change 014 — accessibility naming and the consistency pass. Each wave 2 and
// wave 3 task adds its own describe block here (design.md §6):
//   T9:  AC-05 (FR-06, one field-label style) and AC-11 (FR-12) for rows 6,
//        14, 21 and 22; the group captions name their groups (§8.3).

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
