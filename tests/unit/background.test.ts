import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import type { Brief } from '@prisma/client'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import {
  buildBackgroundDecisionPrompt,
  buildRefineBackgroundDecisionPrompt,
} from '@/lib/agent/prompts/background'
import {
  BACKGROUND_SKIP_CLEARED,
  backgroundSkippedFor,
  clipSkipDetail,
  generationSkipFields,
  refineSkipFields,
  SKIP_DETAIL_MAX,
} from '@/lib/drafts/backgroundNotice'

// For generation, resolveImageProvider is resolved FIRST inside the background
// step, before any model call — a null resolution (no personal/team key
// configured) must short-circuit the whole step without ever reaching the
// decision model. Guard the model-calling seams so a wiring regression fails
// loudly (assertion) instead of silently making a real network call.
const h = vi.hoisted(() => ({
  resolveImageProvider: vi.fn(),
  // No generic pinned to the initial (throwing) implementation — later tests
  // reassign a resolving implementation via .mockResolvedValue/.mockImplementation.
  runClaudeCli: vi.fn().mockImplementation(() => {
    throw new Error('runClaudeCli should not be called when the image provider is null')
  }),
  anthropicCreate: vi.fn().mockImplementation(() => {
    throw new Error('Anthropic.messages.create should not be called when the image provider is null')
  }),
  persistDataUrlImage: vi.fn(),
  // commitDraftRevision's draft writes (the refine writer, FR-07).
  draftUpdates: [] as Array<Record<string, unknown>>,
}))

// A minimal transaction fake for commitDraftRevision (exportKey supplied, so
// it never renders): the next-number read, the revision insert, the
// not-applied discard, then the final draft write this file asserts on.
vi.mock('@/lib/prisma', () => {
  const tx = {
    draftRevision: {
      findFirst: async () => ({ revisionNumber: 1 }),
      create: async () => ({ id: 'rev-2' }),
      updateMany: async () => ({ count: 0 }),
    },
    draft: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        h.draftUpdates.push(data)
        return {}
      },
    },
  }
  return { prisma: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } }
})

vi.mock('@/providers/registry', () => ({ resolveImageProvider: h.resolveImageProvider }))
vi.mock('@/lib/agent/claudeCli', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agent/claudeCli')>()
  return { ...actual, runClaudeCli: h.runClaudeCli }
})
// A real class (not vi.fn().mockImplementation(arrowFn)) — an arrow function
// has no [[Construct]] slot, so `new Anthropic(...)` in background.ts would
// throw "is not a constructor" if the mock were arrow-based.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: h.anthropicCreate }
  },
}))
vi.mock('@/lib/storage/minio', () => ({ persistDataUrlImage: h.persistDataUrlImage }))

const { parseBackgroundDecision, imageSizeFor, generateBackgroundForBrief, generateBackgroundForRefine } =
  await import('@/lib/agent/background')

const kit: ResolvedBrandKit = {
  id: 'kit-1',
  name: 'Bistec',
  colors: ['#14377D', '#2CB34A'],
  fonts: [{ name: 'Lato', url: 'https://fonts.example.com/lato.woff2' }],
  logoUrl: 'https://cdn.example.com/logo.svg',
  logos: [{ label: 'Primary logo', url: 'https://cdn.example.com/logo.svg', primary: true }],
  voicePrompt: 'Warm, confident, human.',
  source: 'system',
}

function decisionReply(text: string) {
  return { content: [{ type: 'text', text }] }
}

function providerReturning(url: string) {
  return { generateImage: vi.fn(async () => ({ url })) }
}

describe('parseBackgroundDecision', () => {
  it('parses a bare JSON decision', () => {
    expect(parseBackgroundDecision('{"needed": true, "prompt": "deep navy abstract waves"}')).toEqual({
      needed: true,
      prompt: 'deep navy abstract waves',
    })
  })

  it('parses a fenced JSON decision (models sometimes wrap despite instructions)', () => {
    const raw = '```json\n{"needed": false, "prompt": ""}\n```'
    expect(parseBackgroundDecision(raw)).toEqual({ needed: false, prompt: '' })
  })

  it('tolerates surrounding prose by isolating the outermost object', () => {
    const raw = 'Here is my decision: {"needed": true, "prompt": "sunrise gradient"} — done.'
    expect(parseBackgroundDecision(raw)).toEqual({ needed: true, prompt: 'sunrise gradient' })
  })

  it('defaults a missing prompt to empty string', () => {
    expect(parseBackgroundDecision('{"needed": false}')).toEqual({ needed: false, prompt: '' })
  })

  it('returns null for non-JSON output', () => {
    expect(parseBackgroundDecision('I think a background would be nice.')).toBeNull()
  })

  it('returns null when the shape is wrong (needed not boolean)', () => {
    expect(parseBackgroundDecision('{"needed": "yes", "prompt": "x"}')).toBeNull()
  })
})

describe('imageSizeFor', () => {
  it('maps SQUARE to 1024x1024 and PORTRAIT to 1024x1536', () => {
    expect(imageSizeFor('SQUARE')).toBe('1024x1024')
    expect(imageSizeFor('PORTRAIT')).toBe('1024x1536')
  })
})

describe('background decision prompts', () => {
  it('generation prompt is biased toward yes and bans text in the image', () => {
    const p = buildBackgroundDecisionPrompt({
      kit,
      topic: 'Q3 launch',
      description: 'Announce the launch',
      goal: 'awareness',
      tone: 'professional',
      copyText: 'Big news!',
    })
    expect(p.system).toContain('default to "needed": true')
    expect(p.system).toContain('NO text')
    expect(p.system).toContain('#14377D') // brand kit context flows through
    expect(p.user).toContain('Q3 launch')
  })

  it('refine prompt is neutral: only when the instruction asks for a background', () => {
    const p = buildRefineBackgroundDecisionPrompt({
      kit,
      topic: 'Q3 launch',
      instruction: 'make the headline bigger',
    })
    expect(p.system).toContain('ONLY when the instruction')
    expect(p.user).toContain('make the headline bigger')
  })

  it('builders are pure — same input, same output', () => {
    const opts = { kit, topic: 't', instruction: 'i' }
    expect(buildRefineBackgroundDecisionPrompt(opts)).toEqual(buildRefineBackgroundDecisionPrompt(opts))
  })
})

// The brief's OWNER (userId 'user-owner') is deliberately different from the
// ACTOR passed to every call below ('user-actor') — these fixtures exist to
// catch a regression back to deriving the image-provider ctx from brief.userId
// (the bug the reviewer caught: a teammate refining a shared brief resolved
// the brief OWNER's personal key instead of their own).
const brief = {
  id: 'brief-1',
  teamId: 'brief-team', // also deliberately different from the actor's teamId
  userId: 'user-owner',
  topic: 'Q3 launch',
  description: 'Announce the launch',
  goal: 'awareness',
  tone: 'professional',
  aspectRatio: 'SQUARE',
  imageProviderKey: null,
} as unknown as Brief

const actor = { userId: 'user-actor', teamId: 'team-actor' }

describe('generateBackgroundForBrief — skip reasons (FR-06)', () => {
  beforeEach(() => {
    h.resolveImageProvider.mockReset().mockResolvedValue(null)
    h.runClaudeCli.mockClear()
    h.anthropicCreate.mockClear()
    h.persistDataUrlImage.mockReset()
  })

  it('no provider configured (personal+team both absent) ⇒ NO_PROVIDER, decision model never called', async () => {
    await expect(generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)).resolves.toEqual({
      url: null,
      skip: 'NO_PROVIDER',
    })
    // The ctx passed to resolveImageProvider must be the ACTOR's, never the
    // brief's own teamId/userId (brief-team / user-owner).
    expect(h.resolveImageProvider).toHaveBeenCalledWith(
      { teamId: 'team-actor', userId: 'user-actor' },
      undefined
    )
    expect(h.runClaudeCli).not.toHaveBeenCalled()
    expect(h.anthropicCreate).not.toHaveBeenCalled()
  })

  it('a rejected provider resolution ⇒ PROVIDER_ERROR with the error as detail (never fails the pipeline)', async () => {
    h.resolveImageProvider.mockReset().mockRejectedValue(new Error('db unreachable'))
    await expect(generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)).resolves.toEqual({
      url: null,
      skip: 'PROVIDER_ERROR',
      detail: 'db unreachable',
    })
    expect(h.anthropicCreate).not.toHaveBeenCalled()
  })

  it('a decision reply that is not valid JSON ⇒ DECISION_ERROR', async () => {
    h.resolveImageProvider.mockResolvedValue(providerReturning('https://cdn.example.com/x.png'))
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('I think a background would be nice.'))
    const result = await generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)
    expect(result).toMatchObject({ url: null, skip: 'DECISION_ERROR' })
  })

  it('the decision call itself throwing ⇒ DECISION_ERROR (stage before the parse), even when the message says "provider"', async () => {
    h.resolveImageProvider.mockResolvedValue(providerReturning('https://cdn.example.com/x.png'))
    h.anthropicCreate.mockRejectedValueOnce(new Error('image provider exploded'))
    await expect(generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)).resolves.toEqual({
      url: null,
      skip: 'DECISION_ERROR',
      detail: 'image provider exploded',
    })
  })

  it('needed:false ⇒ NOT_NEEDED, the provider is never asked for an image', async () => {
    const provider = providerReturning('https://cdn.example.com/x.png')
    h.resolveImageProvider.mockResolvedValue(provider)
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('{"needed": false, "prompt": ""}'))
    await expect(generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)).resolves.toEqual({
      url: null,
      skip: 'NOT_NEEDED',
    })
    expect(provider.generateImage).not.toHaveBeenCalled()
  })

  it('needed:true with an empty prompt ⇒ NOT_NEEDED', async () => {
    h.resolveImageProvider.mockResolvedValue(providerReturning('https://cdn.example.com/x.png'))
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('{"needed": true, "prompt": "   "}'))
    await expect(generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)).resolves.toMatchObject({
      skip: 'NOT_NEEDED',
    })
  })

  it('generateImage throwing ⇒ PROVIDER_ERROR (stage after the parse), even when the message says "decision"', async () => {
    h.resolveImageProvider.mockResolvedValue({
      generateImage: async () => {
        throw new Error('decision was fine but the image request was rejected')
      },
    })
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('{"needed": true, "prompt": "waves"}'))
    await expect(generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)).resolves.toEqual({
      url: null,
      skip: 'PROVIDER_ERROR',
      detail: 'decision was fine but the image request was rejected',
    })
  })

  it('persisting the image failing ⇒ PROVIDER_ERROR', async () => {
    h.resolveImageProvider.mockResolvedValue(providerReturning('data:image/png;base64,AAAA'))
    h.persistDataUrlImage.mockRejectedValueOnce(new Error('Unsupported image content-type from provider: image/svg+xml'))
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('{"needed": true, "prompt": "waves"}'))
    await expect(generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)).resolves.toMatchObject({
      url: null,
      skip: 'PROVIDER_ERROR',
    })
  })

  it('a long provider error is clipped to 300 chars in detail', async () => {
    h.resolveImageProvider.mockResolvedValue({
      generateImage: async () => {
        throw new Error('x'.repeat(5000))
      },
    })
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('{"needed": true, "prompt": "waves"}'))
    const result = await generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)
    expect(result.url).toBeNull()
    if (result.url !== null) throw new Error('unreachable')
    expect(result.detail!.length).toBeLessThanOrEqual(SKIP_DETAIL_MAX)
  })

  it('a produced background ⇒ { url } (a data: URL is persisted first)', async () => {
    h.resolveImageProvider.mockResolvedValue(providerReturning('data:image/png;base64,AAAA'))
    h.persistDataUrlImage.mockResolvedValueOnce('http://minio.example.com/generated-images/background-1.png')
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('{"needed": true, "prompt": "waves"}'))
    await expect(generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)).resolves.toEqual({
      url: 'http://minio.example.com/generated-images/background-1.png',
    })
    expect(h.persistDataUrlImage).toHaveBeenCalledWith('data:image/png;base64,AAAA', 'background')
  })
})

describe('generateBackgroundForRefine — refine semantics (FR-07)', () => {
  beforeEach(() => {
    h.resolveImageProvider.mockReset().mockResolvedValue(null)
    h.runClaudeCli.mockClear()
    h.anthropicCreate.mockReset()
    h.persistDataUrlImage.mockReset()
  })

  it('instruction did not ask for a background ⇒ NOT_NEEDED, and no provider is resolved', async () => {
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('{"needed": false}'))
    await expect(generateBackgroundForRefine(brief, kit, 'make the headline bigger', actor)).resolves.toEqual({
      url: null,
      skip: 'NOT_NEEDED',
    })
    expect(h.resolveImageProvider).not.toHaveBeenCalled()
  })

  it('wanted a background but no provider is configured ⇒ NO_PROVIDER (the decision runs first)', async () => {
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('{"needed": true, "prompt": "a city skyline"}'))
    await expect(generateBackgroundForRefine(brief, kit, 'add a background', actor)).resolves.toEqual({
      url: null,
      skip: 'NO_PROVIDER',
    })
    expect(h.anthropicCreate).toHaveBeenCalledTimes(1)
    expect(h.resolveImageProvider).toHaveBeenCalledWith(
      { teamId: 'team-actor', userId: 'user-actor' },
      undefined
    )
  })

  it('wanted a background and generation failed ⇒ PROVIDER_ERROR', async () => {
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('{"needed": true, "prompt": "a city skyline"}'))
    h.resolveImageProvider.mockResolvedValue({
      generateImage: async () => {
        throw new Error('rate limited')
      },
    })
    await expect(generateBackgroundForRefine(brief, kit, 'add a background', actor)).resolves.toEqual({
      url: null,
      skip: 'PROVIDER_ERROR',
      detail: 'rate limited',
    })
  })

  it('the decision failing ⇒ DECISION_ERROR (never throws)', async () => {
    h.anthropicCreate.mockRejectedValueOnce(new Error('overloaded'))
    await expect(generateBackgroundForRefine(brief, kit, 'add a background', actor)).resolves.toEqual({
      url: null,
      skip: 'DECISION_ERROR',
      detail: 'overloaded',
    })
  })
})

// The reviewer's specific regression test: distinguish the ACTING teammate
// from the brief's OWNER. Teammate B (the actor) refining/regenerating
// teammate A's (the owner's) shared brief must resolve B's identity, never
// A's — a personal-key lookup keyed on the wrong id would silently bill or
// use the wrong person's OpenAI account.
describe('generateBackgroundForBrief / generateBackgroundForRefine — actor vs. brief owner', () => {
  const OWNER_ID = 'user-owner' // brief.userId — must NEVER be consulted here
  const ACTOR_ID = 'user-actor-b' // the acting teammate
  const TEAM_ID = 'team-shared'

  const sharedBrief = { ...brief, userId: OWNER_ID, teamId: TEAM_ID } as unknown as Brief

  beforeEach(() => {
    h.resolveImageProvider.mockReset()
    h.runClaudeCli.mockReset()
    // The decision step must run this time (a resolved provider is available),
    // so give the Anthropic-mode decision call a valid strict-JSON answer.
    h.anthropicCreate.mockReset().mockResolvedValue(decisionReply('{"needed": true, "prompt": "a nice background"}'))
  })

  it("actor B (ACTIVE personal key) refining owner A's brief → B's identity resolves, not A's", async () => {
    h.resolveImageProvider.mockImplementation(
      async (ctx: { teamId: string; userId?: string | null }) => {
        if (ctx.userId === ACTOR_ID) {
          return { generateImage: async () => ({ url: `https://cdn.example.com/personal-${ctx.userId}.png` }) }
        }
        // In particular, a ctx keyed on the brief OWNER must never reach here.
        throw new Error(`unexpected resolveImageProvider ctx: ${JSON.stringify(ctx)}`)
      }
    )

    const result = await generateBackgroundForBrief(sharedBrief, kit, 'Big news!', null, {
      userId: ACTOR_ID,
      teamId: TEAM_ID,
    })

    expect(result).toEqual({ url: `https://cdn.example.com/personal-${ACTOR_ID}.png` })
    expect(h.resolveImageProvider).toHaveBeenCalledWith({ teamId: TEAM_ID, userId: ACTOR_ID }, undefined)
    for (const call of h.resolveImageProvider.mock.calls) {
      expect(call[0].userId).not.toBe(OWNER_ID)
    }
  })

  it('no acting user (userId: null, e.g. an unattended scheduler run) → the owner tier is never consulted; the team default applies', async () => {
    h.resolveImageProvider.mockImplementation(
      async (ctx: { teamId: string; userId?: string | null }) => {
        if (ctx.userId === null) {
          return { generateImage: async () => ({ url: 'https://cdn.example.com/team-default.png' }) }
        }
        throw new Error(`unexpected resolveImageProvider ctx: ${JSON.stringify(ctx)}`)
      }
    )

    const result = await generateBackgroundForRefine(sharedBrief, kit, 'add a background', {
      userId: null,
      teamId: TEAM_ID,
    })

    expect(result).toEqual({ url: 'https://cdn.example.com/team-default.png' })
    expect(h.resolveImageProvider).toHaveBeenCalledWith({ teamId: TEAM_ID, userId: null }, undefined)
  })
})

// ── NFR-06: the background mock seam ─────────────────────────────────────────
// MOCK_AI is read once at module load, so these cases re-import background.ts
// (and testHooks.ts) with MOCK_AI=true. The registry stays the vi.mock above:
// the point of the seam is that resolution RUNS (that mock is called with the
// actor's ctx), and only the resolved provider's generateImage is replaced.
describe('background mock seam (MOCK_AI + __MOCK_BG__ sentinels)', () => {
  const previous = process.env.MOCK_AI
  let seam: typeof import('@/lib/agent/background')
  let hooks: typeof import('@/lib/testHooks')

  beforeEach(async () => {
    process.env.MOCK_AI = 'true'
    vi.resetModules()
    seam = await import('@/lib/agent/background')
    hooks = await import('@/lib/testHooks')
    h.resolveImageProvider.mockReset()
    h.anthropicCreate.mockClear()
    h.runClaudeCli.mockClear()
    h.persistDataUrlImage.mockReset().mockImplementation(async (url: string) =>
      url.startsWith('data:image/png;base64,') ? 'http://minio.example.com/generated-images/background-mock.png' : Promise.reject(new Error('bad'))
    )
  })
  afterAll(() => {
    if (previous === undefined) delete process.env.MOCK_AI
    else process.env.MOCK_AI = previous
    vi.resetModules()
  })

  const seamBrief = (topic: string) => ({ ...brief, topic }) as unknown as Brief

  it('shouldMockBackground: only with MOCK_AI and a __MOCK_BG__ prefix sentinel', () => {
    expect(hooks.shouldMockBackground('Launch __MOCK_BG__')).toBe(true)
    expect(hooks.shouldMockBackground('Launch __MOCK_BG_FAIL__')).toBe(true)
    expect(hooks.shouldMockBackground('Launch __MOCK_BG_NOT_NEEDED__')).toBe(true)
    expect(hooks.shouldMockBackground('Launch')).toBe(false)
  })

  it('the fixture is a valid PNG data URL (persistDataUrlImage-compatible)', () => {
    const m = hooks.MOCK_BACKGROUND_DATA_URL.match(/^data:([^;]+);base64,(.+)$/)
    expect(m?.[1]).toBe('image/png')
    const bytes = Buffer.from(m![2], 'base64')
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  })

  it('no sentinel ⇒ today\'s early return: NOT_NEEDED, nothing resolved, no model call', async () => {
    await expect(seam.generateBackgroundForBrief(seamBrief('Plain'), kit, 'c', null, actor)).resolves.toEqual({
      url: null,
      skip: 'NOT_NEEDED',
    })
    await expect(seam.generateBackgroundForRefine(seamBrief('Plain'), kit, 'add a background', actor)).resolves.toEqual({
      url: null,
      skip: 'NOT_NEEDED',
    })
    expect(h.resolveImageProvider).not.toHaveBeenCalled()
    expect(h.anthropicCreate).not.toHaveBeenCalled()
  })

  it('__MOCK_BG__: resolution runs for real, the decision model is skipped, the fixture replaces generateImage', async () => {
    const real = providerReturning('https://real-provider.example.com/should-not-be-used.png')
    h.resolveImageProvider.mockResolvedValue(real)
    const result = await seam.generateBackgroundForBrief(seamBrief('Launch __MOCK_BG__'), kit, 'c', null, actor)
    expect(result).toEqual({ url: 'http://minio.example.com/generated-images/background-mock.png' })
    expect(h.resolveImageProvider).toHaveBeenCalledWith({ teamId: 'team-actor', userId: 'user-actor' }, undefined)
    expect(real.generateImage).not.toHaveBeenCalled()
    expect(h.persistDataUrlImage).toHaveBeenCalledWith(hooks.MOCK_BACKGROUND_DATA_URL, 'background')
    expect(h.anthropicCreate).not.toHaveBeenCalled()
    expect(h.runClaudeCli).not.toHaveBeenCalled()
  })

  it('__MOCK_BG__ with nothing resolvable ⇒ NO_PROVIDER', async () => {
    h.resolveImageProvider.mockResolvedValue(null)
    await expect(seam.generateBackgroundForBrief(seamBrief('Launch __MOCK_BG__'), kit, 'c', null, actor)).resolves.toEqual({
      url: null,
      skip: 'NO_PROVIDER',
    })
  })

  it('__MOCK_BG_FAIL__ ⇒ the fixture throws ⇒ PROVIDER_ERROR', async () => {
    h.resolveImageProvider.mockResolvedValue(providerReturning('https://x.example.com/x.png'))
    await expect(seam.generateBackgroundForBrief(seamBrief('Launch __MOCK_BG_FAIL__'), kit, 'c', null, actor)).resolves.toMatchObject({
      url: null,
      skip: 'PROVIDER_ERROR',
    })
  })

  it('__MOCK_BG_NOT_NEEDED__ ⇒ NOT_NEEDED with a provider present', async () => {
    const real = providerReturning('https://x.example.com/x.png')
    h.resolveImageProvider.mockResolvedValue(real)
    await expect(seam.generateBackgroundForBrief(seamBrief('Launch __MOCK_BG_NOT_NEEDED__'), kit, 'c', null, actor)).resolves.toEqual({
      url: null,
      skip: 'NOT_NEEDED',
    })
    expect(real.generateImage).not.toHaveBeenCalled()
  })

  it('refine reads the sentinel from the brief topic', async () => {
    h.resolveImageProvider.mockResolvedValue(null)
    await expect(seam.generateBackgroundForRefine(seamBrief('Launch __MOCK_BG__'), kit, 'make it pop', actor)).resolves.toEqual({
      url: null,
      skip: 'NO_PROVIDER',
    })
    await expect(seam.generateBackgroundForRefine(seamBrief('Launch __MOCK_BG_NOT_NEEDED__'), kit, 'make it pop', actor)).resolves.toEqual({
      url: null,
      skip: 'NOT_NEEDED',
    })
  })
})

// ── FR-07: the writer rules + the poll's notice table ────────────────────────
describe('generationSkipFields — generation / regenerate-design / Path A', () => {
  it('a produced background clears the fields', () => {
    expect(generationSkipFields({ url: 'https://x/bg.png' })).toEqual(BACKGROUND_SKIP_CLEARED)
  })
  it('NOT_NEEDED clears the fields (a design choice, not a failure)', () => {
    expect(generationSkipFields({ url: null, skip: 'NOT_NEEDED' })).toEqual(BACKGROUND_SKIP_CLEARED)
  })
  it('Path A (no background step: null) clears the fields', () => {
    expect(generationSkipFields(null)).toEqual(BACKGROUND_SKIP_CLEARED)
  })
  it.each(['NO_PROVIDER', 'PROVIDER_ERROR', 'DECISION_ERROR'] as const)('%s sets the reason and the detail', (reason) => {
    expect(generationSkipFields({ url: null, skip: reason, detail: 'why' })).toEqual({
      backgroundSkipReason: reason,
      backgroundSkipDetail: 'why',
    })
  })
  it('a skip with no detail stores detail null', () => {
    expect(generationSkipFields({ url: null, skip: 'NO_PROVIDER' })).toEqual({
      backgroundSkipReason: 'NO_PROVIDER',
      backgroundSkipDetail: null,
    })
  })
})

describe('refineSkipFields — refine only touches the skip when it wanted a background', () => {
  it('a produced background clears the fields', () => {
    expect(refineSkipFields({ url: 'https://x/bg.png' })).toEqual(BACKGROUND_SKIP_CLEARED)
  })
  it.each(['NO_PROVIDER', 'PROVIDER_ERROR'] as const)('wanted one and %s ⇒ sets the reason', (reason) => {
    expect(refineSkipFields({ url: null, skip: reason, detail: 'd' })).toEqual({
      backgroundSkipReason: reason,
      backgroundSkipDetail: 'd',
    })
  })
  it.each(['NOT_NEEDED', 'DECISION_ERROR'] as const)('%s ⇒ undefined (leave the fields unchanged)', (reason) => {
    expect(refineSkipFields({ url: null, skip: reason })).toBeUndefined()
  })
})

describe('backgroundSkippedFor — the poll payload', () => {
  it('nothing stored ⇒ null', () => {
    expect(backgroundSkippedFor(null, null)).toBeNull()
  })
  it('NOT_NEEDED (never stored, but defensive) and unknown values ⇒ null', () => {
    expect(backgroundSkippedFor('NOT_NEEDED', null)).toBeNull()
    expect(backgroundSkippedFor('SOMETHING_ELSE', null)).toBeNull()
  })
  it('NO_PROVIDER ⇒ the fixed fix-it message', () => {
    expect(backgroundSkippedFor('NO_PROVIDER', null)).toEqual({
      reason: 'NO_PROVIDER',
      message:
        'No AI background was added because no image provider is set up. Add an OpenAI key in Settings, or ask a team admin to add an image provider in Team settings.',
    })
  })
  it('PROVIDER_ERROR carries the clipped detail', () => {
    expect(backgroundSkippedFor('PROVIDER_ERROR', '429 rate limited')).toEqual({
      reason: 'PROVIDER_ERROR',
      message: "The image provider couldn't create a background (429 rate limited). The post was designed without one.",
    })
  })
  it('PROVIDER_ERROR with no detail reads cleanly', () => {
    expect(backgroundSkippedFor('PROVIDER_ERROR', null)!.message).toBe(
      "The image provider couldn't create a background. The post was designed without one.",
    )
  })
  it('a moderation refusal reads as "the image request was refused", never the raw provider text', () => {
    const openAi = backgroundSkippedFor(
      'PROVIDER_ERROR',
      '400 Your request was rejected as a result of our safety system. moderation_blocked',
    )!
    expect(openAi.message).toBe(
      "The image provider couldn't create a background (the image request was refused). The post was designed without one.",
    )
    expect(openAi.message).not.toContain('safety system')
    expect(backgroundSkippedFor('PROVIDER_ERROR', 'Gemini blocked the prompt: SAFETY')!.message).toContain(
      'the image request was refused',
    )
  })
  it('DECISION_ERROR ⇒ the fixed message, provider/model text never echoed', () => {
    expect(backgroundSkippedFor('DECISION_ERROR', 'overloaded_error')).toEqual({
      reason: 'DECISION_ERROR',
      message: 'The background step failed, so the post was designed without an AI image.',
    })
  })
  it('detail longer than the limit is clipped before it reaches the message', () => {
    const msg = backgroundSkippedFor('PROVIDER_ERROR', 'y'.repeat(1000))!.message
    expect(msg.length).toBeLessThan(SKIP_DETAIL_MAX + 120)
  })
  it('clipSkipDetail clips to SKIP_DETAIL_MAX (300)', () => {
    expect(SKIP_DETAIL_MAX).toBe(300)
    expect(clipSkipDetail('z'.repeat(301)).length).toBe(300)
    expect(clipSkipDetail('short')).toBe('short')
  })
})

describe('commitDraftRevision — the refine skip write rides the same draft write', () => {
  const base = { draftId: 'd1', instruction: 'add a background', html: '<html></html>', width: 1080, height: 1080, exportKey: 'exports/x.png' }

  beforeEach(() => {
    h.draftUpdates.length = 0
  })

  it('backgroundSkip set ⇒ both fields written next to imageUrl', async () => {
    const { commitDraftRevision } = await import('@/lib/drafts/revisions')
    await commitDraftRevision({
      ...base,
      backgroundSkip: { backgroundSkipReason: 'PROVIDER_ERROR', backgroundSkipDetail: 'rate limited' },
    })
    expect(h.draftUpdates).toHaveLength(1)
    expect(h.draftUpdates[0]).toMatchObject({ backgroundSkipReason: 'PROVIDER_ERROR', backgroundSkipDetail: 'rate limited' })
  })

  it('a produced background ⇒ imageUrl set and the fields cleared', async () => {
    const { commitDraftRevision } = await import('@/lib/drafts/revisions')
    await commitDraftRevision({ ...base, backgroundImageUrl: 'https://x/bg.png', backgroundSkip: BACKGROUND_SKIP_CLEARED })
    expect(h.draftUpdates[0]).toMatchObject({ imageUrl: 'https://x/bg.png', ...BACKGROUND_SKIP_CLEARED })
  })

  it('backgroundSkip omitted (override, inline edit, a refine that did not want one) ⇒ the fields are not touched', async () => {
    const { commitDraftRevision } = await import('@/lib/drafts/revisions')
    await commitDraftRevision(base)
    expect(h.draftUpdates[0]).not.toHaveProperty('backgroundSkipReason')
    expect(h.draftUpdates[0]).not.toHaveProperty('backgroundSkipDetail')
  })
})
