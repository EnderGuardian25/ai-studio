import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { resolveCopyProvider } from '@/providers/registry'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { getActiveCampaignBriefing } from '@/lib/campaign/briefing'
import { buildBriefInput } from '@/lib/agent/briefInput'
import { writeCaptions } from '@/lib/captions/generate'

const bodySchema = z.object({ briefId: z.string() })

export const POST = withTeamAuth(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, bodySchema)
  if (body.response) return body.response
  const { briefId } = body.data

  const brief = await prisma.brief.findUnique({ where: { id: briefId } })
  if (
    !brief ||
    !canAccessContent(user, { teamId: brief.teamId, ownerId: brief.userId, campaignId: brief.campaignId })
  ) {
    return NextResponse.json({ error: 'Brief not found' }, { status: 404 })
  }

  try {
    const provider = await resolveCopyProvider(brief.teamId, brief.copyProviderKey ?? undefined)

    // Brand voice for copy comes from the same kit precedence as design:
    // explicit brief kit → campaign → project → system default.
    const kit = await resolveBrandKit(brief.teamId, brief.campaignId ?? undefined, brief.brandKitId ?? undefined)
    const campaignBriefing = await getActiveCampaignBriefing(brief.campaignId)

    // Interim (012 T5 → T8): the Instagram caption as `copyText`; T8 adds
    // `headline` and `captions`.
    const fields = await writeCaptions(provider, buildBriefInput(brief, kit, campaignBriefing), ['INSTAGRAM'])
    const instagram = fields.INSTAGRAM
    if (!instagram?.ok) throw new Error(`The caption reply was unusable (${instagram?.reason ?? 'missing'})`)
    return NextResponse.json({ copyText: instagram.text })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ code: 'COPY_ERROR', message }, { status: 422 })
  }
})
