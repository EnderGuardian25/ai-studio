import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { PROMPT_VERSION } from '@/lib/agent/prompts/shared'
import { getFontSetId } from '@/lib/renderer/fontSet'

// ── The revision chain vs. rejected renders (change 004 Phase 2, T15/T16) ────
// DraftRevision holds two kinds of row. COMMITTED rows are the chain: numbered
// 1..N (contiguous per draft), the only rows Draft.currentRevisionNumber can
// point at. REJECTED rows are refine renders that failed verification twice —
// retained for diagnosis and "Use anyway" (FR-13/14a) but NOT part of the chain.
// A rejected row has a NULL revisionNumber and a non-null rejectedAt, and a DB
// CHECK constraint makes those the same statement.
//
// That representation makes most leaks structurally impossible (the pointer and
// restore's [rev] are integers, so they can never match a NULL number), but one
// is not: Postgres sorts NULLs FIRST under ORDER BY … DESC, so an unfiltered
// "latest revision" query returns the rejected row. Hence the rule: every read
// of the chain goes through the helpers below, which apply COMMITTED_REVISION.
// Never query prisma.draftRevision for chain rows directly. The only reads that
// legitimately see rejected rows are ones that target them explicitly (T19's
// adopt, by row id) and the draft hard-delete, which must remove every row.

// The one definition of "a row of the revision chain". Both conditions are
// stated even though the CHECK constraint makes them equivalent, so the filter
// holds on its own terms and a row that somehow had one without the other is
// still excluded.
export const COMMITTED_REVISION = {
  rejectedAt: null,
  revisionNumber: { not: null },
} satisfies Prisma.DraftRevisionWhereInput

export function committedRevisionWhere(draftId: string): Prisma.DraftRevisionWhereInput {
  return { draftId, ...COMMITTED_REVISION }
}

// A committed revision's number is never null; the type says so after the filter.
function numbered<R extends { revisionNumber: number | null }>(
  rows: R[],
): Array<R & { revisionNumber: number }> {
  return rows.filter((r): r is R & { revisionNumber: number } => r.revisionNumber !== null)
}

// The version-switch list (newest first). Rows are re-checked after the query
// as belt-and-braces: a null number can never reach the client.
export async function listCommittedRevisions(draftId: string) {
  const rows = await prisma.draftRevision.findMany({
    where: committedRevisionWhere(draftId),
    orderBy: { revisionNumber: 'desc' },
    select: {
      id: true,
      revisionNumber: true,
      instruction: true,
      exportUrl: true,
      createdAt: true,
    },
  })
  return numbered(rows)
}

// Restore / Undo target lookup: only a committed row with exactly this number.
export async function findCommittedRevision(draftId: string, revisionNumber: number) {
  return prisma.draftRevision.findFirst({
    where: { ...committedRevisionWhere(draftId), revisionNumber },
  })
}

// The next chain number, computed from committed rows only — a rejected row
// never consumes a number, so the chain stays contiguous (TC-REG-H7a).
export async function nextRevisionNumber(
  tx: Prisma.TransactionClient,
  draftId: string,
): Promise<number> {
  const last = await tx.draftRevision.findFirst({
    where: committedRevisionWhere(draftId),
    orderBy: { revisionNumber: 'desc' },
    select: { revisionNumber: true },
  })
  return (last?.revisionNumber ?? 0) + 1
}

// Allocates the next revisionNumber for a draft and runs `body` inside a
// transaction with it. The @@unique([draftId, revisionNumber]) constraint
// serializes concurrent refines; each loser recomputes and retries on P2002.
// The budget must cover the worst case (every other in-flight refine commits
// first), so it is sized generously — a small budget (e.g. 4) 500s under
// ~10-way concurrency (see TC-REG-H7a). One implementation for refine and
// regenerate-design so their retry budgets can never drift again.
const MAX_ATTEMPTS = 12

export async function withNextRevisionNumber<T>(
  draftId: string,
  body: (tx: Prisma.TransactionClient, revisionNumber: number) => Promise<T>
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) =>
        body(tx, await nextRevisionNumber(tx, draftId))
      )
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        attempt < MAX_ATTEMPTS
      ) {
        continue // revision number collided — recompute and retry
      }
      throw err
    }
  }
}

export interface CommitRevisionArgs {
  draftId: string
  instruction: string
  html: string
  width: number
  height: number
  exportKey?: string
  backgroundImageUrl?: string | null
}

// Shared commit path for refine + inline-edit. Renders the HTML to a PNG when
// no export key is supplied (the override / inline-edit case), then allocates a
// revision number and writes the DraftRevision + updates the draft atomically
// (P2002 collision retry via withNextRevisionNumber). Returns the new revision
// id and the EXPORTS object key (unsigned). Always writes a COMMITTED row (a
// number, no rejectedAt) — a rejected render is never written through here.
export async function commitDraftRevision(
  args: CommitRevisionArgs,
): Promise<{ revisionId: string; exportKey: string }> {
  const { draftId, instruction, html, width, height, backgroundImageUrl } = args

  let finalExportKey = args.exportKey
  if (!finalExportKey) {
    const { renderHtmlToPng } = await import('@/lib/renderer/puppeteer')
    const { uploadObject, exportKey, BUCKET_EXPORTS } = await import('@/lib/storage/minio')
    const buffer = await renderHtmlToPng(html, width, height)
    finalExportKey = exportKey('refine', draftId)
    await uploadObject(buffer, BUCKET_EXPORTS, finalExportKey, 'image/png')
  }

  const revision = await withNextRevisionNumber(draftId, async (tx, revisionNumber) => {
    const created = await tx.draftRevision.create({
      data: {
        draftId,
        revisionNumber,
        instruction,
        htmlSnapshot: html,
        exportUrl: finalExportKey,
      },
      select: { id: true },
    })

    await tx.draft.update({
      where: { id: draftId },
      data: {
        htmlContent: html,
        exportUrl: finalExportKey,
        currentRevisionNumber: revisionNumber,
        pendingConflict: Prisma.JsonNull,
        promptVersion: PROMPT_VERSION,
        fontSet: getFontSetId(),
        ...(backgroundImageUrl ? { imageUrl: backgroundImageUrl } : {}),
      },
    })

    return created
  })

  return { revisionId: revision.id, exportKey: finalExportKey }
}
