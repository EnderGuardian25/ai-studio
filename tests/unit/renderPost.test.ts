// 030 T2: renderPost's mock path, the bounded headline check and the mock HTML
// seams (FR-06, FR-10, AC-08). No Chromium: the in-page half is exercised by
// tests/render/headlineCheck.test.ts, and here the collector's page is a stub.
import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.restoreAllMocks()
})

async function load() {
  vi.stubEnv('MOCK_PUPPETEER', 'true')
  vi.resetModules()
  const renderer = await import('@/lib/renderer/puppeteer')
  const hooks = await import('@/lib/testHooks')
  return { ...renderer, ...hooks }
}

describe('renderPost under MOCK_PUPPETEER (FR-10)', () => {
  it('returns the mock PNG and a null check when asked for none', async () => {
    const { renderPost, MOCK_PNG_BUFFER } = await load()
    const out = await renderPost('<html><body>x</body></html>', 1080, 1080, null, null)
    expect(out.png).toBe(MOCK_PNG_BUFFER)
    expect(out.headlineCheck).toBeNull()
  })

  it('checks the headline in the mock HTML', async () => {
    const { renderPost, buildMockHtml } = await load()
    const html = buildMockHtml('', 1080, 1080, 'Big Launch')
    expect((await renderPost(html, 1080, 1080, null, { headline: 'big  launch' })).headlineCheck).toBe('painted')
    expect((await renderPost(html, 1080, 1080, null, { headline: 'Other words' })).headlineCheck).toBe('not-found')
  })

  it('reads the hidden sentinel as not-visible', async () => {
    const { renderPost, buildMockHtml } = await load()
    const html = buildMockHtml('topic __MOCK_HEADLINE_HIDDEN__', 1080, 1080, 'Big Launch')
    expect((await renderPost(html, 1080, 1080, null, { headline: 'Big Launch' })).headlineCheck).toBe('not-visible')
  })

  it('renderHtmlToPng keeps returning the bare PNG', async () => {
    const { renderHtmlToPng, MOCK_PNG_BUFFER } = await load()
    expect(await renderHtmlToPng('<html></html>', 1080, 1080, null)).toBe(MOCK_PNG_BUFFER)
  })
})

describe('runHeadlineCheck is bounded and never throws (FR-06, NFR-03, AC-08)', () => {
  const canvas = { width: 1080, height: 1080 }

  it('a throw in the page is not-checked and logged once', async () => {
    const { runHeadlineCheck } = await load()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const page = { evaluate: async () => { throw new Error('page crashed') } }
    expect(await runHeadlineCheck(page as never, 'Hi', canvas)).toBe('not-checked')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toBe('[renderer] headline check: page crashed')
  })

  it('a hang is not-checked after the timeout', async () => {
    const { runHeadlineCheck } = await load()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const page = { evaluate: () => new Promise(() => {}) }
    const started = Date.now()
    expect(await runHeadlineCheck(page as never, 'Hi', canvas, 30)).toBe('not-checked')
    expect(Date.now() - started).toBeLessThan(2000)
    expect(warn.mock.calls[0][0]).toContain('[renderer] headline check: timed out')
  })

  it('the default bound is the shared constant', async () => {
    const { HEADLINE_CHECK_TIMEOUT_MS } = await import('@/lib/renderedText')
    expect(HEADLINE_CHECK_TIMEOUT_MS).toBe(5000)
  })

  it('facts from the page go through the pure verdict', async () => {
    const { runHeadlineCheck } = await load()
    const facts = {
      candidates: [
        {
          visible: true,
          rects: [{ left: 10, top: 10, width: 100, height: 40 }],
          clipBoxes: [],
          topmost: [true],
        },
      ],
    }
    const page = { evaluate: async () => facts }
    expect(await runHeadlineCheck(page as never, 'Hi', canvas)).toBe('painted')
  })
})

describe('buildMockHtml and the refine reply (030)', () => {
  it('is byte-identical with no headline and no sentinel', async () => {
    const { buildMockHtml } = await load()
    const html = buildMockHtml('#123456 brand', 1080, 1080)
    expect(html).not.toContain('headline')
    expect(html).toContain('<body><div class="card" data-mock="true">MOCK DESIGN</div></body>')
  })

  it('adds an escaped headline element after the card', async () => {
    const { buildMockHtml } = await load()
    const html = buildMockHtml('', 1080, 1080, 'Fish & <Chips>')
    expect(html).toContain(
      '<div class="headline" data-mock-headline="true">Fish &amp; &lt;Chips&gt;</div></body>',
    )
    expect(html.indexOf('MOCK DESIGN')).toBeLessThan(html.indexOf('data-mock-headline'))
  })

  it('the default refine reply carries the headline element and nothing else', async () => {
    const { buildMockHtml, buildMockRefineReply } = await load()
    const current = buildMockHtml('', 1080, 1080, 'Big Launch')
    const reply = buildMockRefineReply({
      slimHtml: current,
      instruction: 'make it bluer',
      attempt: 1,
      width: 1080,
      height: 1080,
    })
    expect(reply).toBe(current)
    const none = buildMockRefineReply({
      slimHtml: buildMockHtml('', 1080, 1080),
      instruction: 'make it bluer',
      attempt: 1,
      width: 1080,
      height: 1080,
    })
    expect(none).toBe(buildMockHtml('', 1080, 1080))
  })
})
