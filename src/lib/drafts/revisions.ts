import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { PROMPT_VERSION } from '@/lib/agent/prompts/shared'
import { INSTRUCTION_CLASS_KEYS } from '@/lib/agent/instructionClasses'
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
// no export key is supplied (the override / inline-edit / verified-refine
// case), then allocates a revision number and writes the DraftRevision +
// updates the draft atomically (P2002 collision retry via
// withNextRevisionNumber). Returns the new revision id and the EXPORTS object
// key (unsigned). Always writes a COMMITTED row (a number, no rejectedAt) — a
// rejected render is never written through here. A commit is a successful
// change to the design, so it also clears any not-applied outcome and stamps
// the rejected render it referenced as discarded (discardNotAppliedRender).
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

    await discardNotAppliedRender(tx, draftId)
    await tx.draft.update({
      where: { id: draftId },
      data: {
        ...NOT_APPLIED_CLEARED,
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

// ── Not-applied outcome + rejected renders (change 004 Phase 2, T17) ─────────
// A refine that fails verification twice (drafts/refineAttempt.ts) commits
// nothing — the pointer does not move and no chain row is appended (FR-12) —
// and is recorded here instead: ONE rejected row (NULL revisionNumber,
// rejectedAt set — the T15 CHECK constraints) carrying the last attempt's
// render and its diagnostics (FR-13), and the draft's not-applied outcome
// (notAppliedReason + notAppliedRevisionId — FR-14; T18 exposes it on the poll).
//
// Lifecycle: at most one rejected row is "live" per draft (the one the draft
// points at). Whenever the outcome is cleared (a commit, or any successful
// draft action — draftActions.completeDraftAction) or REPLACED (a newer
// not-applied refine), the row it referenced is stamped discardedAt, so a late
// "Use anyway" (T19) on it is a 409. An adopted row (adoptedAt set) is never
// re-stamped.

// FR-02 vs FR-13: the instruction's classes are persisted HERE ONLY — on the
// rejected row's rejection JSON, never on a committed row (a CHECK constraint
// forbids it) and never as a column.
const classList = z.array(z.enum(INSTRUCTION_CLASS_KEYS))

export const refineAttemptDiagnosticsSchema = z.object({
  attempt: z.union([z.literal(1), z.literal(2)]),
  // What the reply held: a complete document, one cut off before </html>, or none.
  document: z.enum(['complete', 'truncated', 'none']),
  // As the model returned them (normalised by the envelope parser); [] when
  // there was no document.
  classes: classList,
  classificationDefaulted: z.boolean(),
  // After refineEnvelope.effectiveClasses: what was actually verified.
  effectiveClasses: classList,
  // Classes effectiveClasses downgraded to add. A replace/remove with an empty
  // supersedes counts as a miss (AC-10); a constrain with no target is simply
  // verified as add.
  downgraded: classList,
  supersedes: z.array(z.string()),
  constrains: z.array(z.object({ fragment: z.string(), direction: z.enum(['decrease', 'increase']).optional() })),
  // Inline-asset token reconciliation (T11 + Ruling C). skipped = no complete
  // document to reconcile.
  reconcile: z.object({
    kind: z.enum(['clean', 'intended-removal', 'preservation-miss', 'mismatch', 'skipped']),
    missing: z.array(z.string()),
    reason: z.string().optional(),
  }),
  // The verifier's verdict; skipped = the attempt already missed before
  // verification (no document, truncated, downgraded, token problem), so no
  // verification was spent on it.
  verdict: z.enum(['pass', 'miss', 'unavailable', 'skipped']),
  // Why the attempt was not accepted (empty for a pass).
  reasons: z.array(z.string()),
  // Verifier MODEL calls this attempt spent (0 for structural-only classes).
  verifierCalls: z.number().int().min(0).max(1),
})

export const rejectionDiagnosticsSchema = z.object({
  version: z.literal(1),
  // Hard caps (AC-15): at most 2 refine calls and 2 verifier model calls.
  refineCalls: z.number().int().min(1).max(2),
  verifierCalls: z.number().int().min(0).max(2),
  attempts: z.array(refineAttemptDiagnosticsSchema).min(1).max(2),
  // The final attempt's miss reasons — "the verifier's stated miss" (FR-13).
  reasons: z.array(z.string()),
  // The retained render: stored (exportUrl set), none (no usable document),
  // or render-failed (a usable document whose render/upload threw — logged).
  export: z.enum(['stored', 'none', 'render-failed']),
})

export type RefineAttemptDiagnostics = z.infer<typeof refineAttemptDiagnosticsSchema>
export type RejectionDiagnostics = z.infer<typeof rejectionDiagnosticsSchema>

// notAppliedReason is shown to the user (T18) — capped.
export const MAX_NOT_APPLIED_REASON = 500

// The Draft fields that carry no not-applied outcome.
export const NOT_APPLIED_CLEARED = { notAppliedReason: null, notAppliedRevisionId: null } as const

// Stamps the rejected render the draft's not-applied outcome references as
// discarded — unless it was adopted or already discarded. The caller clears
// (NOT_APPLIED_CLEARED) or replaces the draft's fields in the same
// transaction. Only rejected rows may carry discardedAt (CHECK constraint), and
// the filter says so too.
export async function discardNotAppliedRender(tx: Prisma.TransactionClient, draftId: string): Promise<void> {
  const draft = await tx.draft.findUnique({ where: { id: draftId }, select: { notAppliedRevisionId: true } })
  if (!draft?.notAppliedRevisionId) return
  await tx.draftRevision.updateMany({
    where: { id: draft.notAppliedRevisionId, draftId, rejectedAt: { not: null }, adoptedAt: null, discardedAt: null },
    data: { discardedAt: new Date() },
  })
}

export interface RecordRejectedRenderArgs {
  draftId: string
  instruction: string
  // The last attempt's document with inline assets restored — rendered and
  // uploaded ONCE as the rejected render's export (the preview and "Use
  // anyway" source). null when that attempt left no usable document
  // (none / truncated / token mismatch).
  html: string | null
  // Kept as htmlSnapshot, for diagnosis only, when html is null: the model-
  // facing reply document (tokens intact), if there was one. Never rendered.
  unusableHtml?: string | null
  width: number
  height: number
  // Human-readable; shown to the user by T18 (capped here).
  reason: string
  diagnostics: Omit<RejectionDiagnostics, 'export'>
}

// Writes the not-applied outcome. A render/upload failure must not mask the
// outcome (Ruling D): it is logged and the row is recorded without an export
// (T19 409s an adopt of a row with no export).
export async function recordRejectedRender(
  args: RecordRejectedRenderArgs,
): Promise<{ revisionId: string; exportKey: string | null }> {
  const { draftId, instruction, html, width, height } = args

  let exportKey: string | null = null
  let exported: RejectionDiagnostics['export'] = 'none'
  if (html) {
    try {
      const { renderHtmlToPng } = await import('@/lib/renderer/puppeteer')
      const { uploadObject, exportKey: mintExportKey, BUCKET_EXPORTS } = await import('@/lib/storage/minio')
      const buffer = await renderHtmlToPng(html, width, height)
      const key = mintExportKey('refine', draftId)
      await uploadObject(buffer, BUCKET_EXPORTS, key, 'image/png')
      exportKey = key
      exported = 'stored'
    } catch (err) {
      console.error(`[refine] rejected render for draft ${draftId} could not be rendered/uploaded; recording it without an export:`, err)
      exported = 'render-failed'
    }
  }

  const rejection = rejectionDiagnosticsSchema.parse({ ...args.diagnostics, export: exported })
  const reason =
    args.reason.length > MAX_NOT_APPLIED_REASON ? `${args.reason.slice(0, MAX_NOT_APPLIED_REASON - 1)}…` : args.reason

  const row = await prisma.$transaction(async (tx) => {
    await discardNotAppliedRender(tx, draftId)
    const created = await tx.draftRevision.create({
      data: {
        draftId,
        revisionNumber: null,
        rejectedAt: new Date(),
        instruction,
        htmlSnapshot: html ?? args.unusableHtml ?? '',
        exportUrl: exportKey,
        rejection: rejection as Prisma.InputJsonValue,
      },
      select: { id: true },
    })
    await tx.draft.update({
      where: { id: draftId },
      data: { notAppliedReason: reason, notAppliedRevisionId: created.id },
    })
    return created
  })

  return { revisionId: row.id, exportKey }
}
