import { test, expect, type APIRequestContext } from '@playwright/test'
import { loginAs } from '../helpers/api'
import { ADMIN_EMAIL, ADMIN_PASSWORD } from '../helpers/ui'

// §AG: product screenshots (change 025). TC-SHOT-01 only for now (T2); the rest
// of the suite arrives with T10. Same MOCK_AI + MOCK_PUPPETEER seams as §AF.
// The request runs in its OWN fresh team, disposed afterwards, so it does not
// depend on the seeded team's providers.

async function withFreshTeam(
  request: APIRequestContext,
  run: (t: { api: Awaited<ReturnType<typeof loginAs>>; kitId: string; copyKey: string }) => Promise<void>,
) {
  const sa = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  const name = `Shot ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const teamRes = await sa.post('/api/admin/teams', { name })
  expect(teamRes.status()).toBe(201)
  const team = await teamRes.json()
  const api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD, { team: name })
  try {
    const kitRes = await api.post('/api/admin/brandkits', { name: 'Shot Kit', colors: ['#0284c7', '#020617'] })
    expect(kitRes.status()).toBe(201)
    const kit = await kitRes.json()
    const copyRes = await api.post('/api/admin/providers', {
      apiKey: 'shotcopy_key_123456789',
      slot: 'COPY',
      providerName: 'shotcopy',
      label: 'Shot Copy',
    })
    expect(copyRes.status()).toBe(201)
    const copy = await copyRes.json()
    await run({ api, kitId: kit.id, copyKey: copy.providerKey })
  } finally {
    await api.dispose()
    await sa.del(`/api/admin/teams/${team.id}`)
    await sa.dispose()
  }
}

test.describe('§AG product screenshots', () => {
  test('TC-SHOT-01: device-screen with no screenshot is 400 IMAGE_STYLE_NEEDS_SCREENSHOT', async ({ request }) => {
    await withFreshTeam(request, async (t) => {
      const res = await t.api.post('/api/briefs', {
        topic: 'Shot no source',
        goal: 'awareness',
        tone: 'professional',
        channels: ['LINKEDIN'],
        designMode: 'GENERATE',
        copyProviderKey: t.copyKey,
        brandKitId: t.kitId,
        imageStyle: 'device-screen',
      })
      expect(res.status()).toBe(400)
      expect((await res.json()).code).toBe('IMAGE_STYLE_NEEDS_SCREENSHOT')
    })
  })
})
