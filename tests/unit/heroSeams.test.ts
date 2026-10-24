// 009 T4: the hero pipeline wiring and the mock seams, unit half.
//
// What this proves (design sections 8 and 11):
//   - the art-director decision stays CLOSED: { needed, prompt } only, and for a
//     hero plan the `needed` flag is ignored;
//   - exactly ONE image call on every exit, with the quality option only for a
//     hero plan with IMAGE_QUALITY set (AC-13);
//   - the pixel check fails closed: a busy, low-contrast, unresolved, errored
//     or timed-out check all settle to classic over the same image, and only
//     an explicit { ok: true } keeps the archetype (AC-07);
//   - the __MOCK_HERO_* seams feed the REAL planner, evaluateRegions,
//     evaluateLayout and settleComposition, and are dormant with MOCK_AI off;
//   - runPathBDesign keeps the contract in the design prompt only for a kept
//     archetype, observes the layout only then, and records (never gates) a
//     violation.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import type { Brief } from '@prisma/client'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import {
  archetypes,
  evaluateLayout,
  evaluateRegions,
  planComposition,
  settleComposition,
  type ArchetypeMap,
  type Region,
} from '@/lib/designData'

const h = vi.hoisted(() => ({
  resolveImageProvider: vi.fn(),
  runClaudeCli: vi.fn(),
  anthropicCreate: vi.fn(),
  persistDataUrlImage: vi.fn(),
  sample: vi.fn(),
  imageQuality: undefined as 'standard' | 'high' | undefined,
  // The pipeline mode: API for the background step (the decision goes through
  // the Anthropic mock), CLI for runPathBDesign (the design goes through the CLI mock).
  cli: false,
  // pathB wiring
  designCalls: [] as Array<{ systemPrompt: string; userMessage: string }>,
  background: vi.fn(),
  observe: vi.fn(),
}))

vi.mock('@/lib/agent/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agent/config')>()
  return { ...actual, isCliMode: () => h.cli, pipelineMode: () => (h.cli ? 'cli' : 'api') }
})
vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>()
  return {
    ...actual,
    env: new Proxy(actual.env, { get: (t, k) => (k === 'IMAGE_QUALITY' ? h.imageQuality : (t as never)[k]) }),
  }
})
vi.mock('@/providers/registry', () => ({ resolveImageProvider: h.resolveImageProvider }))
vi.mock('@/lib/agent/claudeCli', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agent/claudeCli')>()
  return { ...actual, runClaudeCli: h.runClaudeCli }
})
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: h.anthropicCreate } } }))
vi.mock('@/lib/storage/minio', () => ({ persistDataUrlImage: h.persistDataUrlImage }))
vi.mock('@/lib/renderer/puppeteer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/renderer/puppeteer')>()
  return { ...actual, sampleRegionLuminance: h.sample }
})
vi.mock('@/lib/prisma', () => ({
  prisma: {
    brandKitArtifact: { findMany: async () => [] },
    brandKitTemplate: { findFirst: async () => null },
  },
}))
vi.mock('@/lib/agent/designAgentCli', () => ({
  runDesignAgentCli: async (o: { systemPrompt: string; userMessage: string }) => {
    h.designCalls.push({ systemPrompt: o.systemPrompt, userMessage: o.userMessage })
    return { htmlContent: '<html>design</html>', exportUrl: 'exports/x.png' }
  },
  runDesignAgentCliRefine: vi.fn(),
}))
vi.mock('@/lib/agent/designAgent', () => ({ runDesignAgent: vi.fn(), runDesignAgentRefine: vi.fn() }))

const kit: ResolvedBrandKit = {
  id: 'kit-1',
  name: 'Bistec',
  colors: ['#14377D', '#2CB34A'],
  fonts: [{ name: 'Lato', url: 'https://fonts.example.com/lato.woff2' }],
  logoUrl: 'https://cdn.example.com/logo.svg',
  logos: [
    { label: 'Primary logo', url: 'https://cdn.example.com/logo.svg', primary: true },
    { label: 'Reversed', url: 'https://cdn.example.com/logo-white.svg', primary: false },
  ],
  voicePrompt: 'Warm, confident, human.',
  source: 'system',
}
const actor = { userId: 'user-actor', teamId: 'team-actor' }
const mkBrief = (over: Record<string, unknown> = {}) =>
  ({
    id: 'brief-1',
    teamId: 'team-actor',
    userId: 'user-owner',
    topic: 'Q3 launch',
    description: 'Announce the launch',
    goal: 'awareness',
    tone: 'professional',
    channels: ['LINKEDIN'],
    aspectRatio: 'SQUARE',
    imageStyle: 'product-showcase',
    imageProviderKey: null,
    briefImages: null,
    referenceTemplateId: null,
    ...over,
  }) as unknown as Brief

function decisionReply(obj: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] }
}
const provider = (url = 'data:image/png;base64,AAAA') => ({ generateImage: vi.fn(async () => ({ url })) })

// 256 calm dark samples over a 45% area (a pass for light text).
const calm = (areaPct = 45) => ({ luminance: Array.from({ length: 256 }, (_, i) => 0.02 + (i % 2 ? 0.001 : -0.001)), areaPct })
const busy = (areaPct = 45) => ({ luminance: Array.from({ length: 256 }, (_, i) => (i % 2 ? 0.6 : 0.02)), areaPct })
const midGrey = (areaPct = 45) => ({ luminance: Array.from({ length: 256 }, () => 0.4), areaPct })

const background = await import('@/lib/agent/background')
const { HeroCheckError } = await import('@/lib/renderer/puppeteer')
const { parseBackgroundDecision, generateBackgroundForBrief } = background

function heroPlanFor(brief: Brief) {
  const plan = planComposition({ imageStyle: brief.imageStyle, aspectRatio: brief.aspectRatio })
  if (plan.kind !== 'hero') throw new Error('expected a hero plan')
  return plan
}

beforeEach(() => {
  h.cli = false
  h.imageQuality = undefined
  h.resolveImageProvider.mockReset()
  h.anthropicCreate.mockReset()
  h.runClaudeCli.mockReset()
  h.persistDataUrlImage.mockReset().mockImplementation(async () => 'https://minio.example.com/bg.png')
  h.sample.mockReset()
  h.designCalls.length = 0
})

describe('the art-director decision is closed (FR-05, AC-23)', () => {
  it('feeds archetype, safeArea, regions and role and gets { needed, prompt } only', () => {
    const raw = JSON.stringify({
      needed: true,
      prompt: 'a laptop on a desk',
      archetype: 'product-showcase',
      safeArea: { x: 0, y: 0, w: 99, h: 100 },
      regions: [{ x: 0, y: 0, w: 99, h: 100 }],
      role: 'hero',
    })
    expect(parseBackgroundDecision(raw)).toEqual({ needed: true, prompt: 'a laptop on a desk' })
  })

  it('no source file reads a region, safe area or archetype from a model reply', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/lib/agent/background.ts', 'utf8')
    expect(src).not.toMatch(/decision\.(archetype|safeArea|regions|role)/)
    expect(src).toMatch(/const decisionSchema = z\.object\(\{\s*needed: z\.boolean\(\),\s*prompt: z\.string\(\)\.optional\(\)\.default\(''\),\s*\}\)/)
  })
})

describe('the hero background step: one image call, the check, the fallback (FR-04, FR-09, FR-16)', () => {
  const run = (brief: Brief) => generateBackgroundForBrief(brief, kit, 'Big news!', null, actor, heroPlanFor(brief))

  it('a pass keeps the archetype: the check result is { ok: true } and the decision `needed: false` is ignored', async () => {
    const p = provider()
    h.resolveImageProvider.mockResolvedValue(p)
    h.anthropicCreate.mockResolvedValue(decisionReply({ needed: false, prompt: 'a laptop on a dark desk' }))
    h.sample.mockResolvedValue([calm()])
    const brief = mkBrief()
    const result = await run(brief)
    expect(result).toEqual({ url: 'https://minio.example.com/bg.png', check: { ok: true } })
    expect(p.generateImage).toHaveBeenCalledTimes(1)
    // The sampler gets the data: URL the provider returned (not the stored URL), the plan's regions and the canvas.
    expect(h.sample).toHaveBeenCalledWith(
      'data:image/png;base64,AAAA',
      heroPlanFor(brief).sizeContract.regions,
      { width: 1080, height: 1080 },
    )
    expect(settleComposition(heroPlanFor(brief), result)).toMatchObject({
      requestedArchetype: 'product-showcase',
      appliedArchetype: 'product-showcase',
      contractVersion: 2,
    })
  })

  it('the decision prompt is written from the contract (the region wording reaches the model)', async () => {
    h.resolveImageProvider.mockResolvedValue(provider())
    h.anthropicCreate.mockResolvedValue(decisionReply({ needed: true, prompt: 'x' }))
    h.sample.mockResolvedValue([calm()])
    await run(mkBrief())
    const [params] = h.anthropicCreate.mock.calls[0] as [{ system: string }]
    expect(params.system).toContain('The left 45% of the frame, full height must be an empty, calm, dark area with no detail.')
    expect(params.system).toContain('The user chose the Product showcase style, so an image is required')
  })

  it.each([
    ['busy', () => [busy()], 'busy'],
    ['contrast', () => [midGrey()], 'contrast'],
    ['region-invalid (a region the mapping rejects)', () => [null], 'region-invalid'],
    ['region-invalid (too small a share)', () => [calm(5)], 'region-invalid'],
    ['region-invalid (too few samples)', () => [{ luminance: [0.02, 0.02], areaPct: 45 }], 'region-invalid'],
  ] as const)('%s: classic over the SAME image, one image call', async (_name, samples, reason) => {
    const p = provider()
    h.resolveImageProvider.mockResolvedValue(p)
    h.anthropicCreate.mockResolvedValue(decisionReply({ needed: true, prompt: 'a laptop' }))
    h.sample.mockResolvedValue(samples())
    const brief = mkBrief()
    const result = await run(brief)
    expect(result).toEqual({ url: 'https://minio.example.com/bg.png', check: { ok: false, reason } })
    expect(p.generateImage).toHaveBeenCalledTimes(1)
    expect(settleComposition(heroPlanFor(brief), result)).toEqual({
      requestedArchetype: 'product-showcase',
      appliedArchetype: 'classic',
      contractVersion: null,
      fallbackReason: reason,
      imageQuality: 'default',
    })
  })

  it('a band look (Spotlight, STORY) makes exactly one image call and samples both bands, on a pass and on a fallback', async () => {
    for (const [samples, check] of [
      [() => [calm(22), calm(22)], { ok: true }],
      [() => [calm(22), busy(22)], { ok: false, reason: 'busy' }],
    ] as const) {
      const p = provider()
      h.resolveImageProvider.mockResolvedValue(p)
      h.anthropicCreate.mockResolvedValue(decisionReply({ needed: true, prompt: 'a lit emblem' }))
      h.sample.mockResolvedValue(samples())
      const brief = mkBrief({ imageStyle: 'spotlight', aspectRatio: 'STORY' })
      const result = await run(brief)
      expect(result).toEqual({ url: 'https://minio.example.com/bg.png', check })
      expect(p.generateImage).toHaveBeenCalledTimes(1)
      expect(h.sample.mock.calls.at(-1)![1]).toHaveLength(2)
    }
  })

  it('fails closed: a sampler error, a timeout, or garbage from the sampler is check-error, never a pass', async () => {
    for (const fail of [
      () => Promise.reject(new HeroCheckError('hero check timed out after 20000 ms')),
      () => Promise.reject(new Error('boom')),
      () => Promise.resolve(undefined),
      () => Promise.resolve('nope'),
    ]) {
      const p = provider()
      h.resolveImageProvider.mockResolvedValue(p)
      h.anthropicCreate.mockResolvedValue(decisionReply({ needed: true, prompt: 'a laptop' }))
      h.sample.mockImplementation(fail)
      const result = await run(mkBrief())
      expect(result).toEqual({ url: 'https://minio.example.com/bg.png', check: { ok: false, reason: 'check-error' } })
      expect(p.generateImage).toHaveBeenCalledTimes(1)
    }
  })

  it('an empty prompt is no image: skipped as NOT_NEEDED, the provider never called, and settle says no-image', async () => {
    const p = provider()
    h.resolveImageProvider.mockResolvedValue(p)
    h.anthropicCreate.mockResolvedValue(decisionReply({ needed: true, prompt: '   ' }))
    const brief = mkBrief()
    const result = await run(brief)
    expect(result).toEqual({ url: null, skip: 'NOT_NEEDED' })
    expect(p.generateImage).not.toHaveBeenCalled()
    expect(h.sample).not.toHaveBeenCalled()
    expect(settleComposition(heroPlanFor(brief), result)).toMatchObject({ appliedArchetype: 'classic', fallbackReason: 'no-image' })
  })

  it('a provider error is the existing PROVIDER_ERROR skip and settles to no-image', async () => {
    h.resolveImageProvider.mockResolvedValue({ generateImage: vi.fn(async () => { throw new Error('rate limited') }) })
    h.anthropicCreate.mockResolvedValue(decisionReply({ needed: true, prompt: 'x' }))
    const brief = mkBrief()
    const result = await run(brief)
    expect(result).toMatchObject({ url: null, skip: 'PROVIDER_ERROR' })
    expect(settleComposition(heroPlanFor(brief), result).fallbackReason).toBe('no-image')
  })

  it('a provider that returns a URL, not a data: URL, cannot be sampled: check-error (the sampler refuses)', async () => {
    h.resolveImageProvider.mockResolvedValue(provider('https://provider.example.com/x.png'))
    h.anthropicCreate.mockResolvedValue(decisionReply({ needed: true, prompt: 'x' }))
    h.sample.mockImplementation(async (url: string) => {
      if (!url.startsWith('data:')) throw new HeroCheckError('hero check accepts data: URLs only')
      return [calm()]
    })
    const result = await run(mkBrief())
    expect(result).toMatchObject({ check: { ok: false, reason: 'check-error' } })
  })

  describe('quality (FR-16, AC-13)', () => {
    const imageArgs = async (opts: { quality?: 'standard' | 'high'; hero: boolean }) => {
      const p = provider()
      h.resolveImageProvider.mockResolvedValue(p)
      h.anthropicCreate.mockResolvedValue(decisionReply({ needed: true, prompt: 'x' }))
      h.sample.mockResolvedValue([calm()])
      h.imageQuality = opts.quality
      const brief = mkBrief()
      await (opts.hero ? run(brief) : generateBackgroundForBrief(brief, kit, 'c', null, actor))
      return p.generateImage.mock.calls[0] as unknown[]
    }

    it('a classic call has exactly three arguments, even with IMAGE_QUALITY set', async () => {
      expect(await imageArgs({ hero: false })).toHaveLength(3)
      expect(await imageArgs({ hero: false, quality: 'high' })).toHaveLength(3)
    })

    it('a hero call with no tier has three arguments too', async () => {
      expect(await imageArgs({ hero: true })).toHaveLength(3)
    })

    it('a hero call with a tier passes { quality } as the fourth', async () => {
      const args = await imageArgs({ hero: true, quality: 'high' })
      expect(args).toHaveLength(4)
      expect(args[3]).toEqual({ quality: 'high' })
    })

    it('the tier the provider reports reaches the stamp; a provider that reports none stamps default', async () => {
      h.resolveImageProvider.mockResolvedValue({
        generateImage: vi.fn(async () => ({ url: 'data:image/png;base64,AAAA', quality: 'high' })),
      })
      h.anthropicCreate.mockResolvedValue(decisionReply({ needed: true, prompt: 'x' }))
      h.sample.mockResolvedValue([calm()])
      h.imageQuality = 'high'
      const brief = mkBrief()
      const reported = await run(brief)
      expect(settleComposition(heroPlanFor(brief), reported).imageQuality).toBe('high')
      h.resolveImageProvider.mockResolvedValue(provider())
      const unreported = await run(brief)
      expect(settleComposition(heroPlanFor(brief), unreported).imageQuality).toBe('default')
    })
  })
})

// ── the seams (MOCK_AI on), through the real pure logic ─────────────────────

async function loadFresh(env: Record<string, string>) {
  vi.resetModules()
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  const hooks = await import('@/lib/testHooks')
  const bg = await import('@/lib/agent/background')
  return { hooks, bg }
}

describe('the __MOCK_HERO_* seams drive the real planner and evaluators', () => {
  const previous = { ...process.env }
  afterAll(() => {
    vi.unstubAllEnvs()
    for (const k of ['MOCK_AI', 'MOCK_PUPPETEER']) {
      if (previous[k] === undefined) delete process.env[k]
      else process.env[k] = previous[k]
    }
    vi.resetModules()
  })

  const regionsOf = (brief: Brief): Region[] => [...heroPlanFor(brief).sizeContract.regions]

  it('calm samples pass the REAL evaluateRegions for both tones', async () => {
    const { hooks } = await loadFresh({ MOCK_AI: 'true' })
    const regions = regionsOf(mkBrief())
    expect(evaluateRegions(hooks.mockRegionSamples('x __MOCK_BG__', regions, 'light')!, regions, 'light')).toEqual({ ok: true })
    expect(evaluateRegions(hooks.mockRegionSamples('x __MOCK_BG__', regions, 'dark')!, regions, 'dark')).toEqual({ ok: true })
  })

  it('__MOCK_HERO_BUSY__ is busy and __MOCK_HERO_CONTRAST__ is contrast, for both tones', async () => {
    const { hooks } = await loadFresh({ MOCK_AI: 'true' })
    const regions = regionsOf(mkBrief())
    for (const tone of ['light', 'dark'] as const) {
      expect(evaluateRegions(hooks.mockRegionSamples('__MOCK_BG__ __MOCK_HERO_BUSY__', regions, tone)!, regions, tone)).toMatchObject({ ok: false, reason: 'busy' })
      expect(evaluateRegions(hooks.mockRegionSamples('__MOCK_BG__ __MOCK_HERO_CONTRAST__', regions, tone)!, regions, tone)).toMatchObject({ ok: false, reason: 'contrast' })
    }
  })

  it('__MOCK_HERO_CHECK_ERROR__ throws from the seam, and the step settles it to check-error through the real planner', async () => {
    const { bg } = await loadFresh({ MOCK_AI: 'true' })
    h.resolveImageProvider.mockResolvedValue(provider())
    const brief = mkBrief({ topic: 'Q3 __MOCK_BG__ __MOCK_HERO_CHECK_ERROR__' })
    const result = await bg.generateBackgroundForBrief(brief, kit, 'c', null, actor, heroPlanFor(brief))
    expect(result).toMatchObject({ check: { ok: false, reason: 'check-error' } })
    expect(settleComposition(heroPlanFor(brief), result)).toMatchObject({ appliedArchetype: 'classic', fallbackReason: 'check-error' })
  })

  it('region-invalid is reachable through the seam: a contract whose region needs more area than the frame gives', async () => {
    const { bg } = await loadFresh({ MOCK_AI: 'true' })
    const source: ArchetypeMap = {
      'product-showcase': {
        key: 'product-showcase',
        label: 'Product showcase',
        summary: 's',
        status: 'active',
        current: 1,
        versions: {
          1: {
            role: 'hero',
            textTone: 'light',
            sizes: { SQUARE: { subject: 'a device', regions: [{ rect: { x: 0, y: 0, w: 45, h: 100 }, purpose: 'text', minAreaPct: 90 }] } },
          },
        },
      },
    }
    const brief = mkBrief({ topic: 'Q3 __MOCK_BG__' })
    const plan = planComposition({ imageStyle: 'product-showcase', aspectRatio: 'SQUARE' }, source)
    if (plan.kind !== 'hero') throw new Error('expected hero')
    h.resolveImageProvider.mockResolvedValue(provider())
    const result = await bg.generateBackgroundForBrief(brief, kit, 'c', null, actor, plan)
    expect(result).toMatchObject({ check: { ok: false, reason: 'region-invalid' } })
    expect(settleComposition(plan, result)).toMatchObject({ appliedArchetype: 'classic', fallbackReason: 'region-invalid' })
  })

  it('without a __MOCK_BG__ sentinel a hero plan has no image under MOCK_AI: no-image', async () => {
    const { bg } = await loadFresh({ MOCK_AI: 'true' })
    const brief = mkBrief({ topic: 'Q3 plain' })
    const result = await bg.generateBackgroundForBrief(brief, kit, 'c', null, actor, heroPlanFor(brief))
    expect(result).toEqual({ url: null, skip: 'NOT_NEEDED' })
    expect(settleComposition(heroPlanFor(brief), result).fallbackReason).toBe('no-image')
  })

  it('layout boxes are inside the regions by default and one box is outside for __MOCK_HERO_LAYOUT__ (real evaluateLayout)', async () => {
    const { hooks } = await loadFresh({ MOCK_AI: 'true' })
    for (const [style, size] of [['product-showcase', 'SQUARE'], ['product-showcase', 'PORTRAIT'], ['editorial-split', 'SQUARE'], ['editorial-split', 'PORTRAIT']] as const) {
      const plan = heroPlanFor(mkBrief({ imageStyle: style, aspectRatio: size }))
      const regions = [...plan.sizeContract.regions].filter((r) => r.purpose === 'text')
      expect(evaluateLayout(hooks.mockLayoutBoxes('x', regions)!, regions)).toEqual({ ok: true })
      expect(evaluateLayout(hooks.mockLayoutBoxes('x __MOCK_HERO_LAYOUT__', regions)!, regions)).toEqual({ ok: false, outside: 1 })
    }
  })

  it('AC-09: for every (key, version, size) one box lies outside every text region and one inside the first', async () => {
    const { hooks } = await loadFresh({ MOCK_AI: 'true' })
    for (const a of Object.values(archetypes)) {
      for (const [v, contract] of Object.entries(a.versions)) {
        for (const [size, sc] of Object.entries(contract.sizes)) {
          const regions = [...sc!.regions].filter((r) => r.purpose === 'text')
          const where = `${a.key}@${v}:${size}`
          const inside = hooks.mockLayoutBoxes('x', regions)!
          expect(evaluateLayout(inside, regions), where).toEqual({ ok: true })
          const first = regions[0].rect
          expect(inside[0].x, where).toBeGreaterThanOrEqual(first.x)
          expect(inside[0].x + inside[0].w, where).toBeLessThanOrEqual(first.x + first.w)
          expect(inside[0].y, where).toBeGreaterThanOrEqual(first.y)
          expect(inside[0].y + inside[0].h, where).toBeLessThanOrEqual(first.y + first.h)
          const both = hooks.mockLayoutBoxes('x __MOCK_HERO_LAYOUT__', regions)!
          expect(both.length, where).toBe(2)
          expect(evaluateLayout(both, regions), where).toEqual({ ok: false, outside: 1 })
        }
      }
    }
  })

  it('mockRegionSamples returns one sample per region for Spotlight', async () => {
    const { hooks } = await loadFresh({ MOCK_AI: 'true' })
    for (const size of ['SQUARE', 'PORTRAIT', 'STORY'] as const) {
      const regions = [...archetypes.spotlight.versions[1].sizes[size]!.regions]
      expect(regions).toHaveLength(2)
      expect(hooks.mockRegionSamples('x __MOCK_BG__', regions, 'light')).toHaveLength(2)
    }
  })

  it('every seam is dormant with MOCK_AI off: no samples, no boxes, no throw even on a sentinel', async () => {
    const { hooks } = await loadFresh({ MOCK_AI: 'false' })
    const regions = regionsOf(mkBrief())
    expect(hooks.MOCK_AI).toBe(false)
    expect(hooks.mockRegionSamples('__MOCK_BG__ __MOCK_HERO_BUSY__', regions, 'light')).toBeNull()
    expect(hooks.mockRegionSamples('__MOCK_BG__ __MOCK_HERO_CHECK_ERROR__', regions, 'light')).toBeNull()
    expect(hooks.mockLayoutBoxes('__MOCK_HERO_LAYOUT__', regions)).toBeNull()
    expect(hooks.shouldMockBackground('__MOCK_BG__ __MOCK_HERO_BUSY__')).toBe(false)
  })

  it('mockImageProvider keeps its signature: it ignores the options and returns the fixture', async () => {
    const { hooks } = await loadFresh({ MOCK_AI: 'true' })
    const wrapped = hooks.mockImageProvider(provider() as never, '__MOCK_BG__')
    expect(await wrapped.generateImage('p', 'kit', '1024x1024', { quality: 'high' })).toEqual({ url: hooks.MOCK_BACKGROUND_DATA_URL })
  })
})

// ── runPathBDesign: the plan, the settle, the prompt and the observation ────

describe('runPathBDesign wiring', () => {
  const previous = { ...process.env }
  afterAll(() => {
    vi.unstubAllEnvs()
    for (const k of ['MOCK_AI', 'MOCK_PUPPETEER']) {
      if (previous[k] === undefined) delete process.env[k]
      else process.env[k] = previous[k]
    }
    vi.resetModules()
  })

  async function load(env: Record<string, string> = {}) {
    vi.resetModules()
    vi.stubEnv('MOCK_AI', 'false')
    vi.stubEnv('MOCK_PUPPETEER', 'false')
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    vi.doMock('@/lib/agent/background', () => ({ generateBackgroundForBrief: h.background }))
    vi.doMock('@/lib/renderer/layoutFacts', () => ({ observeLayout: h.observe }))
    return import('@/lib/agent/pathB')
  }
  const model = {} as never
  const keptBg = { url: 'https://minio.example.com/bg.png', quality: 'high', check: { ok: true } }

  beforeEach(() => {
    h.cli = true
    h.background.mockReset()
    h.observe.mockReset()
  })

  it('a kept archetype: one background call with the plan, the contract in the prompt, the observation with the logo set', async () => {
    const { runPathBDesign } = await load()
    h.background.mockResolvedValue(keptBg)
    h.observe.mockResolvedValue({ ok: true })
    const brief = mkBrief()
    const result = await runPathBDesign(brief, kit, 'Big news', 'Campaign says: logo top-left', actor, model)
    expect(h.background).toHaveBeenCalledTimes(1)
    expect(h.background.mock.calls[0][5]).toMatchObject({ kind: 'hero', requestedArchetype: 'product-showcase' })
    expect(h.designCalls).toHaveLength(1)
    expect(h.designCalls[0].systemPrompt).toContain('Headline, body text and the logo go only inside these regions:')
    expect(h.designCalls[0].systemPrompt).not.toContain('subtle scrim/gradient overlay')
    expect(h.designCalls[0].userMessage).toContain('layout instructions in it yield to the image-style layout contract')
    expect(h.observe).toHaveBeenCalledTimes(1)
    const [html, regions, opts] = h.observe.mock.calls[0]
    expect(html).toBe('<html>design</html>')
    expect(regions).toEqual([...heroPlanFor(brief).sizeContract.regions])
    expect(opts).toMatchObject({
      width: 1080,
      height: 1080,
      logoUrls: ['https://cdn.example.com/logo.svg', 'https://cdn.example.com/logo-white.svg'],
      excludeUrls: ['https://minio.example.com/bg.png'],
    })
    expect(result.composition).toEqual({
      requestedArchetype: 'product-showcase',
      appliedArchetype: 'product-showcase',
      contractVersion: 2,
      imageQuality: 'high',
    })
  })

  it('a violation is recorded and the archetype is kept (an observation, never a gate)', async () => {
    const { runPathBDesign } = await load()
    h.background.mockResolvedValue(keptBg)
    h.observe.mockResolvedValue({ ok: false, outside: 2 })
    const result = await runPathBDesign(mkBrief(), kit, 'h', null, actor, model)
    expect(result.composition).toMatchObject({ appliedArchetype: 'product-showcase', observations: ['layout-violation'] })
    expect(h.designCalls).toHaveLength(1)
  })

  it('an observation that did not run (null) records nothing', async () => {
    const { runPathBDesign } = await load()
    h.background.mockResolvedValue(keptBg)
    h.observe.mockResolvedValue(null)
    const result = await runPathBDesign(mkBrief(), kit, 'h', null, actor, model)
    expect(result.composition).not.toHaveProperty('observations')
  })

  it.each(['busy', 'contrast', 'region-invalid', 'check-error'] as const)(
    'a failed check (%s): the classic prompt over the same image, no observation, the reason stamped',
    async (reason) => {
      const { runPathBDesign } = await load()
      h.background.mockResolvedValue({ url: 'https://minio.example.com/bg.png', check: { ok: false, reason } })
      const result = await runPathBDesign(mkBrief(), kit, 'h', 'briefing text', actor, model)
      expect(h.background).toHaveBeenCalledTimes(1)
      expect(h.designCalls[0].systemPrompt).toContain('Layer a subtle scrim/gradient overlay')
      expect(h.designCalls[0].systemPrompt).toContain('https://minio.example.com/bg.png')
      expect(h.designCalls[0].systemPrompt).not.toContain('go only inside these regions')
      expect(h.designCalls[0].userMessage).not.toContain('yield to the image-style layout contract')
      expect(h.observe).not.toHaveBeenCalled()
      expect(result.composition).toEqual({
        requestedArchetype: 'product-showcase',
        appliedArchetype: 'classic',
        contractVersion: null,
        fallbackReason: reason,
        imageQuality: 'default',
      })
    },
  )

  it('a hero style with no image: no-image, classic, no observation', async () => {
    const { runPathBDesign } = await load()
    h.background.mockResolvedValue({ url: null, skip: 'NO_PROVIDER' })
    const result = await runPathBDesign(mkBrief(), kit, 'h', null, actor, model)
    expect(result.composition).toMatchObject({ appliedArchetype: 'classic', fallbackReason: 'no-image' })
    expect(h.observe).not.toHaveBeenCalled()
  })

  it('a classic request: no hero plan, no observation, a classic stamp with no reason', async () => {
    const { runPathBDesign } = await load()
    h.background.mockResolvedValue({ url: 'https://minio.example.com/bg.png' })
    const result = await runPathBDesign(mkBrief({ imageStyle: 'classic' }), kit, 'h', null, actor, model)
    expect(h.background.mock.calls[0][5]).toBeUndefined()
    expect(h.observe).not.toHaveBeenCalled()
    expect(result.composition).toEqual({
      requestedArchetype: 'classic',
      appliedArchetype: 'classic',
      contractVersion: null,
      imageQuality: 'default',
    })
  })

  it.each([
    ['an unknown key', { imageStyle: 'no-such-style' }, 'unknown-archetype'],
    // The unsupported-size cases moved to compositionPlan.test.ts (a fixture
    // dataset declaring SQUARE only): every shipped look declares STORY (028).
  ])('%s: classic with its reason, no hero plan', async (_n, over, reason) => {
    const { runPathBDesign } = await load()
    h.background.mockResolvedValue({ url: 'https://minio.example.com/bg.png' })
    const result = await runPathBDesign(mkBrief(over), kit, 'h', null, actor, model)
    expect(h.background.mock.calls[0][5]).toBeUndefined()
    expect(result.composition).toMatchObject({ appliedArchetype: 'classic', fallbackReason: reason })
  })

  it('under MOCK_PUPPETEER the observation is not run; the seam boxes feed the real evaluateLayout', async () => {
    const { runPathBDesign } = await load({ MOCK_AI: 'true', MOCK_PUPPETEER: 'true' })
    h.background.mockResolvedValue(keptBg)
    const ok = await runPathBDesign(mkBrief(), kit, 'h', null, actor, model)
    expect(ok.composition).not.toHaveProperty('observations')
    const bad = await runPathBDesign(mkBrief({ topic: 'Q3 __MOCK_HERO_LAYOUT__' }), kit, 'h', null, actor, model)
    expect(bad.composition).toMatchObject({ appliedArchetype: 'product-showcase', observations: ['layout-violation'] })
    expect(h.observe).not.toHaveBeenCalled()
  })
})

// ── the layout observation is bounded (T3 review carry-over) ────────────────

describe('observeLayout timeout', () => {
  afterAll(() => {
    vi.doUnmock('@/lib/renderer/puppeteer')
    vi.resetModules()
  })

  it('a measurement that never settles records nothing once its bound passes, and never throws', async () => {
    vi.resetModules()
    vi.doUnmock('@/lib/renderer/layoutFacts') // the pathB wiring tests mock it
    vi.stubEnv('MOCK_PUPPETEER', 'false')
    vi.doMock('@/lib/renderer/puppeteer', () => ({ evaluateInRenderedPage: () => new Promise(() => {}) }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { observeLayout, LAYOUT_OBSERVE_TIMEOUT_MS } = await import('@/lib/renderer/layoutFacts')
    const regions = [{ rect: { x: 0, y: 0, w: 45, h: 100 }, purpose: 'text' as const, minAreaPct: 20 }]
    const started = Date.now()
    const result = await observeLayout('<html/>', regions, { width: 1080, height: 1080, logoUrls: [] }, 30)
    expect(result).toBeNull()
    expect(Date.now() - started).toBeLessThan(2000)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('timed out after 30 ms'))
    // The production bound is the one the action budget models.
    expect(LAYOUT_OBSERVE_TIMEOUT_MS).toBe(15_000)
    warn.mockRestore()
    vi.unstubAllEnvs()
  })
})
