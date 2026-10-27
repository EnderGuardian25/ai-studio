// 033: docs/ui-reference/screen-{light,dark}.png by 011 T13's method (as 032 T12):
// the draft review page of the newest EXPORTED draft, 1440 x 1120 viewport,
// nextjs-portal hidden, light and dark. gate.sh pipes it via stdin from the repo
// root so '@playwright/test' resolves from the repo's node_modules.
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:3001'
const browser = await chromium.launch()
for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ baseURL: BASE, colorScheme: theme, viewport: { width: 1440, height: 1120 } })
  await context.addInitScript((t) => { try { localStorage.setItem('bistec-theme', t) } catch {} }, theme)
  const page = await context.newPage()
  await page.goto('/login')
  await page.getByPlaceholder('Username').fill('admin@bisteccare.lk')
  await page.getByPlaceholder('Password').fill('BistecStudio2026!')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((u) => u.pathname === '/' || u.pathname === '/choose-team')
  await page.goto('/')
  if (page.url().includes('/choose-team')) {
    await page.getByRole('button', { name: 'Bistec' }).click()
    await page.waitForURL((u) => u.pathname === '/')
  }
  const lib = await (await page.request.get('/api/library?pageSize=1')).json()
  const id = lib.drafts?.[0]?.id
  if (!id) throw new Error('no EXPORTED draft visible')
  await page.goto(`/drafts/${id}`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
  await page.waitForTimeout(500)
  const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  await page.screenshot({ path: `docs/ui-reference/screen-${theme}.png`, animations: 'disabled' })
  console.log(`screen-${theme}.png draft=${id} htmlDark=${dark}`)
  await context.close()
}
await browser.close()
