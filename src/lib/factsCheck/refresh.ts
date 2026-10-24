// Refreshes a draft's stored facts check (027 FR-11, design section 6). The
// interactive caption writers call it after their write; it is best-effort and
// never throws, so the caller's own result is unchanged. The write points are
// wired in T4.
import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { loadDraftCaptions } from '@/lib/captions/store'
import { redactText } from '@/lib/text/redact'
import { checkFacts, factsCheckError } from './compare'
import { loadFactsSources, type FactsBrief } from './sources'
import { MAX_REASON_CHARS, type CheckText, type FactWhere } from './types'

export interface RefreshDeps {
  db: PrismaClient
  loadSources: (brief: FactsBrief) => Promise<string[]>
  loadCaptions: typeof loadDraftCaptions
}

const defaultDeps = (): RefreshDeps => ({
  db: prisma,
  loadSources: (brief) => loadFactsSources(brief),
  loadCaptions: loadDraftCaptions,
})

function describe(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return redactText(message).slice(0, MAX_REASON_CHARS)
}

/**
 * Recomputes `Draft.factsCheck` from the draft's headline and READY captions.
 * A PENDING or FAILED caption row is skipped. On any failure it logs
 * `[facts-check] draft <id>: <message>` and tries once to store `status:
 * 'error'`. Never throws.
 */
export async function refreshFactsCheck(
  draftId: string,
  deps: RefreshDeps = defaultDeps(),
): Promise<void> {
  try {
    const draft = await deps.db.draft.findUnique({
      where: { id: draftId },
      select: {
        headline: true,
        brief: {
          select: {
            teamId: true,
            topic: true,
            description: true,
            campaignId: true,
            brandKitId: true,
          },
        },
      },
    })
    if (!draft) return
    const loaded = await deps.loadCaptions(draftId, deps.db)
    const texts: CheckText[] = []
    if (draft.headline) texts.push({ where: 'headline', text: draft.headline })
    for (const row of loaded?.captions ?? [])
      if (row.status === 'READY' && row.text)
        texts.push({ where: row.channel as FactWhere, text: row.text })
    const sources = await deps.loadSources(draft.brief)
    const check = checkFacts({ texts, sources })
    await deps.db.draft.updateMany({
      where: { id: draftId },
      data: { factsCheck: check as unknown as Prisma.InputJsonValue },
    })
  } catch (err) {
    const message = describe(err)
    console.error(`[facts-check] draft ${draftId}: ${message}`)
    try {
      await deps.db.draft.updateMany({
        where: { id: draftId },
        data: {
          factsCheck: factsCheckError(message) as unknown as Prisma.InputJsonValue,
        },
      })
    } catch {
      // The error record is best-effort as well.
    }
  }
}
