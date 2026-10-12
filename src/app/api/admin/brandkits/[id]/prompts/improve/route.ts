import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin } from '@/lib/api/handler'
import { draftBrandVoice } from '@/lib/brandkit/voiceDraft'
import { withClaudeAuth } from '@/lib/agent/userToken'
import { AssistantModelError } from '@/lib/campaign/briefingAssistant'

type Params = { id: string }

export const POST = withTeamAdmin<Params>(async (_req, { params }, user) => {
  const kit = await prisma.brandKit.findUnique({
    where: { id: params.id },
    include: { prompts: { where: { isActive: true }, take: 1 } },
  })
  if (!kit || kit.isDeleted || kit.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const currentPrompt = kit.prompts[0]?.content
  if (!currentPrompt) {
    return NextResponse.json({ error: 'No active prompt to improve — use /generate first' }, { status: 400 })
  }

  // Drafts via the shared helper: MOCK_AI test seam, model resolution and the
  // mode-agnostic call live inside it (see src/lib/brandkit/voiceDraft.ts).
  // CLI mode bills the acting user's personal Claude token when connected
  // (the team token otherwise) — see src/lib/agent/userToken.ts.
  const promptText = `You are a brand strategist. Improve the following brand voice prompt for an AI design agent.

Current prompt:
${currentPrompt}

Make it more specific, actionable, and comprehensive. Add concrete guidance on visual composition, spacing, hierarchy, and specific do/don't rules. Keep the same second-person tone. Return only the improved prompt text, no preamble.`
  const mockDraft = `${currentPrompt} [MOCK improved brand voice prompt for E2E tests — deterministic.]`

  let draft: string
  try {
    draft = await withClaudeAuth(user.userId, user.teamId, () =>
      draftBrandVoice(user.teamId, user.userId, promptText, { mockDraft })
    )
  } catch (err) {
    // 008: no model the team can run — nothing ran; say why.
    if (err instanceof AssistantModelError) {
      return NextResponse.json({ code: err.code, message: err.message }, { status: 422 })
    }
    throw err
  }

  // Return the draft — admin must explicitly save it as a new version
  return NextResponse.json({ draft })
})
