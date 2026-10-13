import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { isAllowedAssetUrl } from '@/lib/storage/minio'
import { Prisma, DesignMode, type AspectRatio, type Channel } from '@prisma/client'
import { isPublishableChannel, PUBLISHABLE_CHANNELS } from '@/lib/channels'
import { isAspectRatio } from '@/lib/aspectRatio'
import { isCliMode } from '@/lib/agent/config'
import { resolveBriefCopyKey } from '@/lib/brief/copyProvider'
import { IMAGE_PROVIDERS } from '@/providers/imageCapabilities'
import { resolveModel } from '@/lib/models/policy'
import { captionProviderNotClaudeError, modelError, parseModelField } from '@/lib/models/requests'
import { copyProviderIsClaude } from '@/providers/registry'
import type { ModelKey, UserSurface } from '@/lib/models/catalogue'

// Permissive schema: only guards the JSON parse. The thorough hand-rolled
// validation below (exact error messages + channel normalization) is kept as-is.
const createSchema = z.object({}).passthrough()

export const POST = withTeamAuth(async (req: NextRequest, _ctx, user) => {
  const parsed = await parseBody(req, createSchema)
  if (parsed.response) return parsed.response
  // Untrusted request body — every field is validated at runtime below; the cast
  // just describes the shape those checks assume (no `any`).
  const body = parsed.data as {
    topic?: string
    description?: string
    goal?: string
    tone?: string
    channels?: unknown
    aspectRatio?: AspectRatio
    designMode?: string
    campaignId?: string
    brandKitId?: string
    copyProviderKey?: string
    imageProviderKey?: string
    additionalImageUrl?: string
    briefImages?: unknown
    referenceTemplateId?: string
    captionModel?: unknown
    designModel?: unknown
  }

  const {
    topic,
    description,
    goal,
    tone,
    channels,
    aspectRatio,
    designMode,
    campaignId,
    brandKitId,
    copyProviderKey,
    imageProviderKey,
    additionalImageUrl,
    briefImages,
    referenceTemplateId,
  } = body

  // Validate required fields
  if (!topic?.trim()) {
    return NextResponse.json({ error: 'topic is required' }, { status: 400 })
  }
  if (!goal?.trim()) {
    return NextResponse.json({ error: 'goal is required' }, { status: 400 })
  }
  if (!tone?.trim()) {
    return NextResponse.json({ error: 'tone is required' }, { status: 400 })
  }
  if (!Array.isArray(channels) || channels.length === 0) {
    return NextResponse.json({ error: 'channels must be a non-empty array' }, { status: 400 })
  }
  // Normalize casing (legacy clients sent lowercase) and accept only publishable channels.
  const normalizedChannels: Channel[] = []
  for (const ch of channels) {
    const upper = typeof ch === 'string' ? ch.toUpperCase() : null
    if (!isPublishableChannel(upper)) {
      return NextResponse.json(
        { error: `channels entries must be one of: ${PUBLISHABLE_CHANNELS.join(', ')}` },
        { status: 400 }
      )
    }
    normalizedChannels.push(upper)
  }
  if (!designMode || !['TEMPLATE', 'GENERATE'].includes(designMode)) {
    return NextResponse.json({ error: 'designMode must be TEMPLATE or GENERATE' }, { status: 400 })
  }
  // aspectRatio is optional; defaults to SQUARE for backward compatibility.
  if (aspectRatio != null && !isAspectRatio(aspectRatio)) {
    return NextResponse.json({ error: 'aspectRatio must be SQUARE, PORTRAIT, or STORY' }, { status: 400 })
  }
  // 008 FR-17: the Review step's optional model picks — the initial request
  // (FR-10). The design pick serves the surface of the chosen design path.
  const captionPick = parseModelField(body.captionModel, 'captionModel')
  if (!captionPick.ok) return NextResponse.json(captionPick.body, { status: 400 })
  const designPick = parseModelField(body.designModel, 'designModel')
  if (!designPick.ok) return NextResponse.json(designPick.body, { status: 400 })
  // CLI mode defaults copy to the local Claude CLI (OAuth chain) — no provider
  // key required; an explicit key overrides and is existence-checked below.
  const copyKeyDecision = resolveBriefCopyKey(copyProviderKey, isCliMode())
  if ('error' in copyKeyDecision) {
    return NextResponse.json({ error: copyKeyDecision.error }, { status: 400 })
  }
  const { key: resolvedCopyKey, validateExists: mustValidateCopyKey } = copyKeyDecision

  // SSRF guard: image URLs are embedded into agent-generated HTML and fetched by
  // headless Chromium at render time, so they must point at our own MinIO storage
  // (these values only ever come from /api/briefs/images). Reject off-host or
  // non-http(s) URLs before they are stored.
  if (additionalImageUrl != null && !isAllowedAssetUrl(additionalImageUrl)) {
    return NextResponse.json({ error: 'additionalImageUrl must be an uploaded image URL' }, { status: 400 })
  }
  if (briefImages != null) {
    if (!Array.isArray(briefImages)) {
      return NextResponse.json({ error: 'briefImages must be an array' }, { status: 400 })
    }
    for (const img of briefImages) {
      if (!img || typeof img.url !== 'string' || !isAllowedAssetUrl(img.url)) {
        return NextResponse.json({ error: 'each briefImages entry must have an uploaded image URL' }, { status: 400 })
      }
      if (img.intent !== 'embed' && img.intent !== 'reference') {
        return NextResponse.json({ error: 'each briefImages entry must have intent "embed" or "reference"' }, { status: 400 })
      }
    }
  }

  // Verify referenced records in parallel (independent lookups). Provider
  // lookups are team-scoped (team-tenancy fix — these used to validate
  // against ANY team's provider row, which would let a brief reference, and
  // then at generation time resolve to, a different team's registered
  // provider/API key; see the matching fix in resolveCopyProvider).
  const [copyProvider, imageProvider, campaign, template, brandKit] = await Promise.all([
    mustValidateCopyKey
      ? prisma.availableProvider.findFirst({
          where: { providerKey: resolvedCopyKey, slot: 'COPY', teamId: user.teamId, isEnabled: true },
        })
      : Promise.resolve(null),
    imageProviderKey
      ? prisma.availableProvider.findFirst({
          where: {
            providerKey: imageProviderKey,
            slot: 'IMAGE',
            teamId: user.teamId,
            isEnabled: true,
            // A legacy incompatible row is refused like a missing one.
            providerName: { in: [...IMAGE_PROVIDERS] },
          },
        })
      : Promise.resolve(null),
    campaignId
      ? prisma.campaign.findFirst({ where: { id: campaignId, isDeleted: false } })
      : Promise.resolve(null),
    // I2 (final review): include the template's brand kit so its team can be
    // checked below — an unscoped findUnique let a foreign team's template
    // HTML enter the design prompt as "style inspiration" (see pathB.ts).
    referenceTemplateId
      ? prisma.brandKitTemplate.findUnique({
          where: { id: referenceTemplateId },
          include: { brandKit: { select: { teamId: true } } },
        })
      : Promise.resolve(null),
    brandKitId
      ? prisma.brandKit.findFirst({ where: { id: brandKitId, isDeleted: false } })
      : Promise.resolve(null),
  ])

  if (mustValidateCopyKey && !copyProvider) {
    return NextResponse.json({ error: 'Invalid or disabled copyProviderKey' }, { status: 400 })
  }
  if (imageProviderKey && !imageProvider) {
    return NextResponse.json({ error: 'Invalid or disabled imageProviderKey' }, { status: 400 })
  }
  // M1 (final review): "doesn't exist" and "exists in another team" now share
  // ONE status/message (404, the pre-existing not-found text) for every
  // referenced record. The old 400-vs-404 split let a caller distinguish "bad
  // id" from "id exists in some other tenant" — a cross-tenant existence
  // oracle — by watching the status code alone.
  if (campaignId && (!campaign || campaign.teamId !== user.teamId)) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }
  if (referenceTemplateId && (!template || template.brandKit.teamId !== user.teamId)) {
    return NextResponse.json({ error: 'Reference template not found' }, { status: 404 })
  }
  if (brandKitId && (!brandKit || brandKit.teamId !== user.teamId)) {
    return NextResponse.json({ error: 'Brand kit not found' }, { status: 404 })
  }

  // Each pick is checked against the caller's effective set for its surface
  // now (tier 1: a refusal is FR-17's 400), so only an allowed model is
  // stored. Once stored it is history: a later policy change makes the
  // generation substitute it, never fail (FR-10).
  const designSurface: UserSurface = designMode === 'TEMPLATE' ? 'DESIGN_TEMPLATE' : 'DESIGN_FREEFORM'
  const picks: [UserSurface, ModelKey | undefined][] = [
    ['CAPTION', captionPick.value],
    [designSurface, designPick.value],
  ]
  // Spec open question 1: a caption pick needs a Claude caption provider — the
  // one this brief's generation will use (its key, else the team default).
  if (captionPick.value && !(await copyProviderIsClaude(user.teamId, resolvedCopyKey))) {
    return NextResponse.json(captionProviderNotClaudeError(), { status: 400 })
  }
  for (const [surface, requested] of picks) {
    if (!requested) continue
    const resolved = await resolveModel(surface, { requested, userId: user.userId, teamId: user.teamId })
    if (!resolved.ok) return NextResponse.json(modelError(resolved), { status: 400 })
  }

  const brief = await prisma.brief.create({
    data: {
      teamId: user.teamId,
      userId: user.userId,
      topic: topic.trim(),
      description: description?.trim() ?? null,
      goal: goal.trim(),
      tone: tone.trim(),
      channels: normalizedChannels,
      aspectRatio: aspectRatio ?? 'SQUARE',
      designMode: designMode as DesignMode,
      campaignId: campaignId ?? null,
      brandKitId: brandKitId ?? null,
      copyProviderKey: resolvedCopyKey,
      imageProviderKey: imageProviderKey?.trim() ?? null,
      additionalImageUrl: additionalImageUrl ?? null,
      // Nullable Json column: use the Prisma sentinel rather than a bare null
      // (validated to a {url,intent}[] above when present).
      briefImages: briefImages == null ? Prisma.JsonNull : (briefImages as Prisma.InputJsonValue),
      referenceTemplateId: referenceTemplateId ?? null,
      captionModel: captionPick.value ?? null,
      designModel: designPick.value ?? null,
    },
  })

  return NextResponse.json(brief, { status: 201 })
})
