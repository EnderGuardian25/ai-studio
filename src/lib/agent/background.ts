// Background-image pre-step for Path B generation and AGUI refine.
//
// Flow: Claude (Haiku — modelForBackground) answers a small strict-JSON question
// ("should this post get an AI-generated background, and with what prompt?"),
// then the server calls the resolved IMAGE provider (gpt-image-2 by default) and
// persists the result to the public IMAGES bucket. The returned URL is injected
// into the design/refine prompts as the background layer and stored on
// Draft.imageUrl.
//
// Failure policy: this step NEVER fails the pipeline. No image provider, a
// declined decision, a provider error, or malformed JSON all resolve to a skip
// with its reason (BackgroundResult, 005 FR-06), and the design proceeds without
// a generated background (CSS/SVG as before). The callers store an unintended
// skip on the draft so the draft page can say why (FR-07, drafts/backgroundNotice.ts).
// MOCK_AI skips the step entirely so the E2E suite stays deterministic — unless
// the brief topic carries a __MOCK_BG__ sentinel (the NFR-06 seam, testHooks.ts).

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { Brief } from '@prisma/client'
import { env } from '@/lib/env'
import { MOCK_AI, mockBackgroundDecision, mockImageProvider, shouldMockBackground } from '@/lib/testHooks'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { resolveImageProvider } from '@/providers/registry'
import type { ImageProvider } from '@/providers/interfaces/ImageProvider'
import { persistDataUrlImage } from '@/lib/storage/minio'
import { runClaudeCli, stripCodeFences } from '@/lib/agent/claudeCli'
import { isCliMode, modelForBackground } from '@/lib/agent/config'
import type { GenerationActor } from '@/lib/agent/types'
import {
  buildBackgroundDecisionPrompt,
  buildRefineBackgroundDecisionPrompt,
  type BackgroundDecisionPrompt,
} from '@/lib/agent/prompts/background'
import {
  clipSkipDetail,
  type BackgroundResult,
  type BackgroundSkipReason,
} from '@/lib/drafts/backgroundNotice'

export type { BackgroundResult, BackgroundSkipReason } from '@/lib/drafts/backgroundNotice'

const decisionSchema = z.object({
  needed: z.boolean(),
  prompt: z.string().optional().default(''),
})
export type BackgroundDecision = z.infer<typeof decisionSchema>

function log(msg: string) {
  console.log(`[background] ${msg}`)
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// One skip, logged once. detail is clipped to SKIP_DETAIL_MAX here, at the
// source, so no caller can store or show more.
function skip(reason: BackgroundSkipReason, detail?: string): BackgroundResult {
  log(`skipped (${reason})${detail ? ` — ${detail}` : ''}`)
  return detail ? { url: null, skip: reason, detail: clipSkipDetail(detail) } : { url: null, skip: reason }
}

// Provider-native image size for the post's aspect ratio. gpt-image supports
// 1024x1024 / 1536x1024 / 1024x1536; the design layer cover-crops to the exact
// 1080×1080 / 1080×1350 / 1080×1920 canvas, so nearest-orientation is enough.
// Both PORTRAIT (4:5) and STORY (9:16) are taller-than-wide → portrait source.
export function imageSizeFor(aspectRatio: string): string {
  return aspectRatio === 'PORTRAIT' || aspectRatio === 'STORY' ? '1024x1536' : '1024x1024'
}

// Tolerant strict-JSON extraction, mirroring the refine route's parseConflict:
// strip a wrapping fence, isolate the outermost {...}, JSON.parse, zod-validate.
export function parseBackgroundDecision(raw: string): BackgroundDecision | null {
  const unfenced = stripCodeFences(raw)
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return decisionSchema.parse(JSON.parse(unfenced.slice(start, end + 1)))
  } catch {
    return null
  }
}

// One decision call, CLI vs API. Small constrained task → Haiku both ways.
async function runDecision(prompt: BackgroundDecisionPrompt): Promise<BackgroundDecision | null> {
  if (isCliMode()) {
    const raw = await runClaudeCli(`${prompt.system}\n\n${prompt.user}`, {
      label: 'background',
      model: modelForBackground('cli'),
      timeoutMs: 90_000,
    })
    return parseBackgroundDecision(raw)
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const message = await client.messages.create({
    model: modelForBackground('api'),
    max_tokens: 1024,
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
  })
  const text = message.content.find((b) => b.type === 'text')
  return text && text.type === 'text' ? parseBackgroundDecision(text.text) : null
}

// Shared tail: run the decision, then (when needed) generate + persist the image.
// imageProviderKey is the brief's optional per-brief override. actor is WHO is
// running this call (see GenerationActor) — deliberately NOT derived from the
// brief, since the acting teammate and the brief's owner are often different
// people on a shared team brief.
//
// Every ending is a BackgroundResult (FR-06); nothing here throws. The reason
// for an unexpected throw comes from `stage`, advanced as the step runs — never
// from the error's wording: before the decision has parsed it is a
// DECISION_ERROR, after it a PROVIDER_ERROR (generation or persisting).
//
// Order: generation resolves the provider FIRST — with none configured there
// is no point spending a Claude call on the decision, and NO_PROVIDER is the
// answer whatever the model would say. Refine decides FIRST: its decision is
// instruction-gated, and its writer only records a skip when the instruction
// asked for a background (refineSkipFields), so "no provider" has to be told
// apart from "didn't want one". That costs refine one Haiku call on a team
// with no provider; with a provider the calls are the same as before.
async function runBackgroundStep(
  buildPrompt: () => BackgroundDecisionPrompt,
  opts: {
    actor: GenerationActor
    brandKitId: string
    aspectRatio: string
    imageProviderKey?: string | null
    topic: string
    resolveFirst: boolean
  },
): Promise<BackgroundResult> {
  // NFR-06 seam: without a __MOCK_BG__ sentinel, MOCK_AI skips the step (no
  // background, nothing recorded) exactly as it always has.
  const mockSeam = shouldMockBackground(opts.topic)
  if (MOCK_AI && !mockSeam) return { url: null, skip: 'NOT_NEEDED' }

  let stage: 'decision' | 'provider' = 'decision'
  try {
    let provider: ImageProvider | null = null
    if (opts.resolveFirst) {
      const resolved = await resolveProvider(opts)
      if (!resolved.provider) return resolved.skip
      provider = resolved.provider
    }

    // The seam replaces only the Haiku decision here; resolution below is real.
    const decision = mockSeam ? mockBackgroundDecision(opts.topic) : await runDecision(buildPrompt())
    if (!decision) return skip('DECISION_ERROR', 'decision response was not valid JSON')
    stage = 'provider'
    if (!decision.needed || !decision.prompt.trim()) return skip('NOT_NEEDED')

    if (!provider) {
      const resolved = await resolveProvider(opts)
      if (!resolved.provider) return resolved.skip
      provider = resolved.provider
    }
    // The fixture swap happens AFTER the real resolver chose the provider.
    if (mockSeam) provider = mockImageProvider(provider, opts.topic)

    log(`generating background · size=${imageSizeFor(opts.aspectRatio)} · prompt="${decision.prompt.slice(0, 120)}..."`)
    const startedAt = Date.now()
    // TODO(team-tenancy): if a personal UserOpenAiKey was resolved above and this
    // call fails with an auth error, flip it INVALID here (markUserOpenAiKeyInvalid,
    // src/lib/agent/openAiKey.ts) — mirroring markUserTokenInvalid for Claude. Not
    // wired yet: there is no existing OpenAI-error auth-classification helper to
    // hang this off (unlike isClaudeAuthFailure for the CLI), and inventing one is
    // out of scope here.
    const result = await provider.generateImage(decision.prompt, opts.brandKitId, imageSizeFor(opts.aspectRatio))
    // persistDataUrlImage enforces the raster allow-list and returns a stable
    // public URL; a provider that already returns an http(s) URL passes through.
    const url = result.url.startsWith('data:')
      ? await persistDataUrlImage(result.url, 'background')
      : result.url
    log(`background ready in ${((Date.now() - startedAt) / 1000).toFixed(1)}s · ${url}`)
    return { url }
  } catch (err) {
    return skip(stage === 'decision' ? 'DECISION_ERROR' : 'PROVIDER_ERROR', errorText(err))
  }
}

// resolveImageProvider never throws (returns null), but keep the guard: a DB
// hiccup here must still degrade gracefully, not fail the whole generation.
async function resolveProvider(opts: {
  actor: GenerationActor
  imageProviderKey?: string | null
}): Promise<{ provider: ImageProvider; skip?: never } | { provider: null; skip: BackgroundResult }> {
  try {
    const provider = await resolveImageProvider(
      { teamId: opts.actor.teamId, userId: opts.actor.userId },
      opts.imageProviderKey ?? undefined
    )
    return provider ? { provider } : { provider: null, skip: skip('NO_PROVIDER') }
  } catch (err) {
    return { provider: null, skip: skip('PROVIDER_ERROR', errorText(err)) }
  }
}

/**
 * Path B initial generation / regeneration: decide (biased toward yes) and
 * generate a background for the brief. Returns the public image URL, or the
 * reason there is none. Never throws.
 */
export async function generateBackgroundForBrief(
  brief: Brief,
  kit: ResolvedBrandKit,
  copyText: string,
  campaignBriefing: string | null | undefined,
  actor: GenerationActor,
): Promise<BackgroundResult> {
  return runBackgroundStep(
    () =>
      buildBackgroundDecisionPrompt({
        kit,
        topic: brief.topic,
        description: brief.description,
        goal: brief.goal,
        tone: brief.tone,
        copyText,
        campaignBriefing,
      }),
    {
      actor,
      brandKitId: kit.id,
      aspectRatio: brief.aspectRatio,
      imageProviderKey: brief.imageProviderKey,
      topic: brief.topic,
      resolveFirst: true,
    },
  )
}

/**
 * AGUI refine: generate a new background ONLY when the instruction asks for one
 * (neutral bias — see the refine decision prompt). Returns the URL, or the
 * reason there is none: NOT_NEEDED means the instruction didn't ask. Never
 * throws. The mock seam's sentinel is read from the draft's brief topic.
 */
export async function generateBackgroundForRefine(
  brief: Brief,
  kit: ResolvedBrandKit,
  instruction: string,
  actor: GenerationActor,
): Promise<BackgroundResult> {
  return runBackgroundStep(
    () => buildRefineBackgroundDecisionPrompt({ kit, topic: brief.topic, instruction }),
    {
      actor,
      brandKitId: kit.id,
      aspectRatio: brief.aspectRatio,
      imageProviderKey: brief.imageProviderKey,
      topic: brief.topic,
      resolveFirst: false,
    },
  )
}
