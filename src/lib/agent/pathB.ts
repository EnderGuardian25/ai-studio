import { prisma } from '@/lib/prisma'
import type { Brief } from '@prisma/client'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import type { DesignAgentResult, GenerationActor } from '@/lib/agent/types'
import { runDesignAgent } from '@/lib/agent/designAgent'
import { runDesignAgentCli } from '@/lib/agent/designAgentCli'
import { extractInlineAssets } from '@/lib/agent/inlineAssets'
import { dimensionsFor } from '@/lib/aspectRatio'
import { isCliMode, pipelineMode } from '@/lib/agent/config'
import type { ResolvedModel } from '@/lib/models/resolve'
import { buildPathBSystemPrompt, buildPathBUserMessage } from '@/lib/agent/prompts/pathB'
import { imageRulesFor, parseBriefImages } from '@/lib/agent/briefInput'
import { generateBackgroundForBrief, type BackgroundResult } from '@/lib/agent/background'
import {
  compositionStampSchema,
  evaluateLayout,
  planComposition,
  settleComposition,
  type CompositionStamp,
  type HeroPlan,
  type Region,
} from '@/lib/designData'
import { observeLayout, type LayoutObservation } from '@/lib/renderer/layoutFacts'
import { MOCK_PUPPETEER, mockLayoutBoxes } from '@/lib/testHooks'

// Re-export for existing importers; canonical home is agent/briefInput.ts.
export { buildBriefInput } from '@/lib/agent/briefInput'

export type PathBDesignResult = DesignAgentResult & {
  // Public URL of the AI-generated background used in this design (stored on
  // Draft.imageUrl by the callers), or null when the pre-step skipped.
  backgroundImageUrl: string | null
  // The background step's full outcome, including why it skipped (005
  // FR-06) — the callers store an unintended skip on the draft (FR-07).
  background: BackgroundResult
  // The composition stamp of this run (009 FR-12): the image style asked for,
  // the one applied, why not, and the layout observation. The callers write it
  // with the design (finalizeDraftV1, regenerate-design).
  composition: CompositionStamp
}

// The layout observation of a KEPT hero archetype (009 FR-11): one more page
// load of the final HTML, which only records. Under MOCK_PUPPETEER nothing is
// measured; the seam supplies boxes and the REAL evaluateLayout compares them.
// An error records nothing (observeLayout never throws).
//
// Bound: observeLayout races the measurement against LAYOUT_OBSERVE_TIMEOUT_MS
// (15 s); on expiry it records nothing. budget.ts sizes layoutMeasureMs to that
// bound, so the segment budget holds. An abandoned page still holds its
// renderer slot until setContent's own 60 s cap.
async function observeKeptLayout(
  html: string,
  plan: HeroPlan,
  kit: ResolvedBrandKit,
  backgroundImageUrl: string | null,
  canvas: { width: number; height: number },
  seamText: string,
): Promise<LayoutObservation | null> {
  const textRegions: Region[] = plan.sizeContract.regions.filter((r) => r.purpose === 'text')
  if (MOCK_PUPPETEER) {
    const boxes = mockLayoutBoxes(seamText, textRegions)
    return boxes ? evaluateLayout(boxes, textRegions) : null
  }
  const logoUrls = Array.from(
    new Set([kit.logoUrl, ...kit.logos.map((l) => l.url)].filter((u): u is string => !!u))
  )
  return observeLayout(html, textRegions, {
    ...canvas,
    logoUrls,
    excludeUrls: backgroundImageUrl ? [backgroundImageUrl] : [],
  })
}

// Runs the Path B (freeform) design pipeline for a given brief + its on-image
// headline (012 FR-09: the design never reads a caption), dispatching CLI vs
// API. Single source of truth for initial generation (assemble-b),
// regeneration (regenerate-design), and the ACP surface, so the entry points
// never drift.
export async function runPathBDesign(
  brief: Brief,
  kit: ResolvedBrandKit,
  headline: string,
  campaignBriefing: string | null | undefined,
  actor: GenerationActor,
  // 008 FR-07: the DESIGN_FREEFORM model, resolved by the caller (the
  // generation at its start; regenerate-design before its claim).
  model: ResolvedModel,
  // 008 FR-12: a liveness write (a draft heartbeat or the scheduler's lease
  // renewal), run after the background step and immediately before the
  // design-agent call, so each stays within its own budget segment (budget.ts).
  opts?: { onBeforeDesign?: () => Promise<void> },
): Promise<PathBDesignResult> {
  // Feed-to-AI artifact URLs (brand reference imagery).
  const artifacts = await prisma.brandKitArtifact.findMany({
    where: { brandKitId: kit.id, feedToAI: true },
    select: { url: true },
  })
  const artifactUrls = artifacts.map((a) => a.url)

  // Output canvas for this brief (1080×1080 square or 1080×1350 portrait).
  const { width, height } = dimensionsFor(brief.aspectRatio)

  // Optional reference template for style inspiration. Scoped to the brief's
  // own team via its parent brand kit (I2, final review — defense-in-depth;
  // briefs/route.ts already rejects a foreign referenceTemplateId at create
  // time, but a pre-fix row or a direct DB write must not leak another team's
  // template HTML into the design prompt as "style inspiration").
  let referenceTemplate: { htmlTemplate: string } | null = null
  if (brief.referenceTemplateId) {
    referenceTemplate = await prisma.brandKitTemplate.findFirst({
      where: { id: brief.referenceTemplateId, brandKit: { teamId: brief.teamId } },
      select: { htmlTemplate: true },
    })
  }

  // The reference template is style inspiration only — never filled, never
  // rendered. Strip its inline `data:` assets (the same externalization Path A
  // uses) before it enters the prompt: a heavy template (e.g. "Hearts Talk",
  // 1.89 MB) would otherwise blow the CLI 600k guard / API ~200k context. Unlike
  // Path A there is no restore step — the model only needs the structural
  // HTML/CSS to grasp the visual style, not the base64 payloads it can't read.
  const referenceTemplateHtml = referenceTemplate
    ? extractInlineAssets(referenceTemplate.htmlTemplate).html
    : null

  const mode = pipelineMode()
  const briefImages = parseBriefImages(brief.briefImages)

  // Background pre-step: Claude (INTERNAL_BACKGROUND, Haiku) decides + gpt-image generates a
  // full-bleed background before the design call. A skip (with its reason)
  // on no provider/failure — the design proceeds with CSS/SVG visuals as
  // before. See agent/background.ts.
  //
  // 009: the brief's image style plans the composition first. A hero plan
  // writes the image prompt from the archetype's contract and gets its pixels
  // checked; every exit that is not an explicit pass settles to classic over the
  // same image (settleComposition), so there is never a second image call.
  const plan = planComposition({ imageStyle: brief.imageStyle, aspectRatio: brief.aspectRatio })
  const heroPlan = plan.kind === 'hero' ? plan : undefined
  const background = await generateBackgroundForBrief(brief, kit, headline, campaignBriefing, actor, heroPlan)
  const backgroundImageUrl = background.url
  const settled = settleComposition(plan, background)
  // The contract reaches the design prompt only when the archetype was KEPT.
  const kept = heroPlan && settled.appliedArchetype !== 'classic' ? heroPlan : undefined

  const systemPrompt = buildPathBSystemPrompt({
    kit,
    mode,
    width,
    height,
    artifactUrls,
    referenceTemplateHtml,
    backgroundImageUrl,
    ...(kept ? { composition: { label: kept.label, contract: kept.contract, size: kept.sizeContract } } : {}),
  })
  const userMessage = buildPathBUserMessage({
    campaignBriefing,
    topic: brief.topic,
    description: brief.description,
    goal: brief.goal,
    tone: brief.tone,
    channels: brief.channels,
    headline,
    mode,
    width,
    height,
    briefImages,
    heroPrecedence: !!kept,
    imageRules: imageRulesFor(brief),
  })

  await opts?.onBeforeDesign?.()

  const result = isCliMode()
    ? await runDesignAgentCli({ systemPrompt, userMessage, briefId: brief.id, width, height, model })
    : await runDesignAgent({
        systemPrompt,
        userMessage,
        briefId: brief.id,
        model,
        maxToolCalls: 15,
        width,
        height,
        actor,
      })

  // The layout observation, only for an applied non-classic archetype. A
  // violation is recorded and shown, never a fallback (no second design call).
  let composition = settled
  if (kept) {
    const observation = await observeKeptLayout(result.htmlContent, kept, kit, backgroundImageUrl, { width, height }, brief.topic)
    if (observation && !observation.ok) {
      composition = compositionStampSchema.parse({ ...settled, observations: ['layout-violation'] })
    }
  }

  return { ...result, backgroundImageUrl, background, composition }
}
