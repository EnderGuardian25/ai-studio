import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { PROMPT_VERSION } from '@/lib/agent/prompts/shared'
import { INSTRUCTION_CLASS_KEYS } from '@/lib/agent/instructionClasses'
import { getFontSetId } from '@/lib/renderer/fontSet'
import type { DraftNotApplied } from '@/lib/api-types'

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

// How long an interactive transaction may wait for a pool connection before
// Prisma gives up with P2028 "Unable to start a transaction in the given time".
// Prisma's default is 2000 ms, which is SHORTER than opening one new pool
// connection can take: on the Windows dev/test host a new connection to
// "localhost" costs ~2.1 s (the engine tries ::1 first; Postgres is published
// on 127.0.0.1 only), so a commit issued while a burst of concurrent requests
// grows the pool threw P2028 AFTER the 202 — the TC-REG-H7a "202 winner with
// no revision" (T17 fix round 1; reproduced deterministically outside the app).
// 10 s matches the engine's own pool_timeout for ordinary queries, so a
// transaction is never the first thing to give up under the same load.
export const TX_MAX_WAIT_MS = 10_000
export const TX_OPTIONS = { maxWait: TX_MAX_WAIT_MS } as const

export async function withNextRevisionNumber<T>(
  draftId: string,
  body: (tx: Prisma.TransactionClient, revisionNumber: number) => Promise<T>
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => body(tx, await nextRevisionNumber(tx, draftId)),
        TX_OPTIONS,
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
  // "Use anyway" (T19, FR-14a): the id of the rejected DraftRevision row being
  // adopted. When set, it is stamped adoptedAt + adoptedRevisionNumber
  // atomically INSIDE this same transaction, BEFORE the create/discard below
  // run — the ordering hazard from T17's report (discardNotAppliedRender
  // skips rows with adoptedAt already set, so stamping first is what keeps
  // the just-adopted row from also being marked discardedAt a moment later).
  // The guarded UPDATE (adoptedAt IS NULL AND discardedAt IS NULL) doubles as
  // adopt's single-flight mechanism: a second concurrent adopt of the same
  // row loses the race here and the whole commit aborts with
  // AdoptConflictError. No Draft.pendingAction/DraftAction value describes
  // "adopt a stored render" honestly, so adopt never claims that field —
  // this conditional UPDATE is the guard instead, the same shape as the
  // P2002 retry commitDraftRevision already uses for the revision-number
  // race. A SECOND guarded UPDATE, on the Draft row itself, re-checks
  // pendingAction IS NULL in the same atomic step (fix round 1, Minor 1).
  adoptRejectedRevisionId?: string
  // Compare-and-swap on the revision pointer (change 004 T23 fix round 1,
  // amended Ruling W5-B — element-mode inline edits only). When set, the
  // commit happens only if Draft.currentRevisionNumber is STILL this value
  // inside the same transaction that writes; otherwise nothing is written (no
  // revision row, no htmlContent change) and RevisionConflictError is thrown.
  // null means "the draft has no pointer yet" (a legacy draft). Omitted (the
  // default — whole-document inline edit, refine, override, adopt): no check,
  // behaviour unchanged.
  //
  // Why it is needed: the caller computed `html` from the draft it read
  // BEFORE this function rendered the PNG (1–2 s in real Chromium). Another
  // commit landing in that window would otherwise be silently overwritten —
  // with element mode's many small edits per session, a real lost update.
  expectedRevisionNumber?: number | null
}

// Thrown (and never retried — only P2002 is) when expectedRevisionNumber no
// longer matches the draft's pointer: another commit (or a restore) moved it
// after the caller read the document. The transaction is rolled back before
// anything is written. The element-mode inline-edit route maps it to 409
// element-stale.
export class RevisionConflictError extends Error {
  constructor() {
    super('The draft changed since this edit was prepared')
    this.name = 'RevisionConflictError'
  }
}

// Thrown (and never retried — only P2002 is) when adoptRejectedRevisionId's
// guarded UPDATE touches 0 rows: the row was already adopted/discarded, or
// was never a rejected row of this draft. The caller (the adopt route) maps
// this to a 409.
export class AdoptConflictError extends Error {
  constructor() {
    super('This render is no longer available to adopt')
    this.name = 'AdoptConflictError'
  }
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
): Promise<{ revisionId: string; exportKey: string; revisionNumber: number }> {
  const { draftId, instruction, html, width, height, backgroundImageUrl, adoptRejectedRevisionId } = args
  const casExpected = args.expectedRevisionNumber
  const cas = casExpected !== undefined

  let finalExportKey = args.exportKey
  // Set only when THIS call rendered + uploaded the export — the only object
  // it may remove again (a caller-supplied key belongs to someone else, e.g.
  // the rejected render an adopt reuses).
  let uploadedKey: string | null = null
  if (!finalExportKey) {
    const { renderHtmlToPng } = await import('@/lib/renderer/puppeteer')
    const { uploadObject, exportKey, BUCKET_EXPORTS } = await import('@/lib/storage/minio')
    const buffer = await renderHtmlToPng(html, width, height)
    finalExportKey = exportKey('refine', draftId)
    await uploadObject(buffer, BUCKET_EXPORTS, finalExportKey, 'image/png')
    uploadedKey = finalExportKey
  }
  const committedExportKey: string = finalExportKey

  let revision: { id: string; revisionNumber: number }
  try {
    revision = await withNextRevisionNumber(draftId, (tx, revisionNumber) =>
      writeRevision(tx, revisionNumber),
    )
  } catch (err) {
    // A CAS miss is the one failure after the upload that is KNOWN to have
    // written nothing (the throw rolled the transaction back), so the export
    // it rendered can be removed without risking a committed row that points
    // at it. Every other failure keeps the pre-existing behaviour (the object
    // is left in place): after e.g. a dropped connection the commit may in
    // fact have landed. Best-effort — a failed removal is logged and never
    // masks the conflict.
    if (err instanceof RevisionConflictError && uploadedKey) {
      try {
        const { deleteObject, BUCKET_EXPORTS } = await import('@/lib/storage/minio')
        await deleteObject(BUCKET_EXPORTS, uploadedKey)
      } catch (cleanupErr) {
        console.error(`[revisions] could not remove the unused export ${uploadedKey} after a revision conflict:`, cleanupErr)
      }
    }
    throw err
  }

  return { revisionId: revision.id, exportKey: committedExportKey, revisionNumber: revision.revisionNumber }

  async function writeRevision(tx: Prisma.TransactionClient, revisionNumber: number) {
    if (cas) {
      // The compare-and-swap: a guarded UPDATE on the draft row, not a read
      // followed by a separate write — the same idiom as the adopt guard
      // below. It matches only while the pointer is STILL the caller's base,
      // and it takes the row lock, so a concurrent commit or restore either
      // finished first (0 rows → conflict) or waits for this transaction and
      // then re-evaluates its own write. Runs before anything is written.
      const pointer = await tx.draft.updateMany({
        where: { id: draftId, currentRevisionNumber: casExpected },
        data: { updatedAt: new Date() },
      })
      if (pointer.count !== 1) throw new RevisionConflictError()
    }

    if (adoptRejectedRevisionId) {
      // Fix round 1, Minor 1 (FR-14a: adopt is single-flight "like every
      // other draft action" — a concurrent action 409s). A guarded UPDATE on
      // the DRAFT row itself, not a read followed by a separate write:
      // matches only when pendingAction is STILL null (nothing claimed the
      // draft between the route's own pre-check and here) AND this row is
      // STILL the draft's live not-applied pointer (never trust a value the
      // caller read earlier — same "never trust the FK alone" principle
      // T18's resolveNotAppliedOutcome documents). Both facts are checked and
      // "touched" (a heartbeat-style updatedAt bump, the same idiom
      // touchDraftAction uses) atomically in ONE conditional UPDATE, so
      // nothing can change either fact in the gap between checking and
      // acting — under Postgres, a concurrent claimDraftAction competing for
      // the same row blocks on this transaction's row lock and then
      // re-evaluates its own WHERE against whatever we leave committed.
      // 0 rows touched: a refine/regenerate claimed pendingAction, or a
      // newer not-applied outcome already superseded this row — either way,
      // 409.
      const draftGuard = await tx.draft.updateMany({
        where: { id: draftId, pendingAction: null, notAppliedRevisionId: adoptRejectedRevisionId },
        data: { updatedAt: new Date() },
      })
      if (draftGuard.count !== 1) throw new AdoptConflictError()

      // The guarded UPDATE on the rejected row itself: every remaining
      // precondition (rejected, not yet adopted/discarded, has an export to
      // adopt — Ruling D) checked and stamped atomically. 0 rows touched
      // means a concurrent adopt/discard won the race, or the row never
      // qualified — either way, 409.
      const guard = await tx.draftRevision.updateMany({
        where: {
          id: adoptRejectedRevisionId,
          draftId,
          rejectedAt: { not: null },
          adoptedAt: null,
          discardedAt: null,
          exportUrl: { not: null },
        },
        data: { adoptedAt: new Date(), adoptedRevisionNumber: revisionNumber },
      })
      if (guard.count !== 1) throw new AdoptConflictError()
    }

    const created = await tx.draftRevision.create({
      data: {
        draftId,
        revisionNumber,
        instruction,
        htmlSnapshot: html,
        exportUrl: committedExportKey,
      },
      select: { id: true },
    })

    await discardNotAppliedRender(tx, draftId)
    await tx.draft.update({
      where: { id: draftId },
      data: {
        ...NOT_APPLIED_CLEARED,
        htmlContent: html,
        exportUrl: committedExportKey,
        currentRevisionNumber: revisionNumber,
        pendingConflict: Prisma.JsonNull,
        promptVersion: PROMPT_VERSION,
        fontSet: getFontSetId(),
        ...(backgroundImageUrl ? { imageUrl: backgroundImageUrl } : {}),
      },
    })

    return { id: created.id, revisionNumber }
  }
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
// transaction, AFTER this runs (the filter follows the draft's reference).
// Only rejected rows may carry discardedAt (CHECK constraint), and the filter
// says so too. One statement, no read, so it also fits a batch transaction —
// it runs on every draft-action completion (draftActions.completeDraftAction).
export function discardNotAppliedRender(client: Prisma.TransactionClient, draftId: string) {
  return client.draftRevision.updateMany({
    where: {
      draftId,
      rejectedAt: { not: null },
      adoptedAt: null,
      discardedAt: null,
      notAppliedOn: { some: { id: draftId } },
    },
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
//
// The diagnostics are validated FIRST, before anything is rendered or
// uploaded: diagnostics that break the schema (e.g. more calls than the AC-15
// caps allow) are a bug that must fail loudly, and failing after the upload
// would orphan the export object.
export async function recordRejectedRender(
  args: RecordRejectedRenderArgs,
): Promise<{ revisionId: string; exportKey: string | null }> {
  const { draftId, instruction, html, width, height } = args
  const diagnostics = rejectionDiagnosticsSchema.omit({ export: true }).parse(args.diagnostics)

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

  const rejection: RejectionDiagnostics = { ...diagnostics, export: exported }
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
  }, TX_OPTIONS)

  return { revisionId: row.id, exportKey }
}

// ── The poll's notApplied field (T18, FR-14/AC-18, Ruling E) ────────────────
// Re-derives the outcome from the rejected row on every read instead of
// trusting Draft.notAppliedRevisionId as a bare pointer: the row must still
// match draftId + rejectedAt set + NOT discarded (the carried-in note from the
// task board — "never trust the FK alone"). If it doesn't, the outcome is
// gone as far as the client is concerned, even if the column hasn't been
// nulled out for some reason. Nothing off the row but instruction/export/time
// ever reaches this return value — no htmlSnapshot, no rejection JSON.
export async function resolveNotAppliedOutcome(draft: {
  id: string
  notAppliedReason: string | null
  notAppliedRevisionId: string | null
}): Promise<DraftNotApplied | null> {
  if (!draft.notAppliedReason || !draft.notAppliedRevisionId) return null

  const row = await prisma.draftRevision.findFirst({
    where: {
      id: draft.notAppliedRevisionId,
      draftId: draft.id,
      rejectedAt: { not: null },
      discardedAt: null,
    },
    select: { id: true, instruction: true, exportUrl: true, rejectedAt: true },
  })
  if (!row || !row.rejectedAt) return null

  const { resolveExportUrl } = await import('@/lib/storage/minio')
  return {
    reason: draft.notAppliedReason,
    instruction: row.instruction,
    revisionId: row.id,
    previewUrl: await resolveExportUrl(row.exportUrl),
    rejectedAt: row.rejectedAt.toISOString(),
  }
}
