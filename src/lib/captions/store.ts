// The caption store (012 FR-02/FR-04/FR-10, design §6): the only module that
// reads or writes DraftCaption rows. Every reader gets captions through
// loadDraftCaptions, which materializes a legacy draft (the pre-012 single
// caption, no rows yet) BEFORE returning, so no reader ever has a "rows, or
// else the legacy column" branch.
//
// The legacy column is the read-only, nullable Prisma field `legacyCaptionText`
// (`@map("copyText")`, FR-03). The materializer is its only runtime reader.
//
// What to write is decided by pure modules (migrationPlan.ts for a legacy
// draft, actionTargets.ts for a caption write's settle). This file only issues
// the queries.

import type {
  CaptionMigration,
  CaptionStatus,
  Channel,
  DraftAction,
  DraftStatus,
  PostStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { CAPTION_CHANNELS, type CaptionTarget } from '@/lib/channels'
import { planCaptionMigration, type CaptionMigrationOutcome } from '@/lib/captions/migrationPlan'
import type { FieldResult } from '@/lib/captions/extract'
import { settleCaptionRow, type CaptionStamp } from '@/lib/captions/actionTargets'
import { resolveCaptionForPublish, type CaptionResolution } from '@/lib/captions/resolve'

export interface CaptionRow {
  channel: Channel
  text: string
  status: CaptionStatus
  failureReason: string | null
  needsReview: boolean
  updatedAt: Date
  /** 008 FR-08: the model whose output this row's text is (null = unknown / none). */
  model: string | null
  modelSubstitutedFrom: string | null
}

export interface DraftCaptions {
  /** One per registry channel, in registry order. */
  captions: CaptionRow[]
  /** True while a legacy draft waits to be migrated; its captions are synthesized. */
  deferred: boolean
  /** The legacy migration outcome, including one this read just recorded. */
  captionMigration: CaptionMigration | null
}

const ROW_SELECT = {
  channel: true,
  text: true,
  status: true,
  failureReason: true,
  needsReview: true,
  updatedAt: true,
  model: true,
  modelSubstitutedFrom: true,
} satisfies Prisma.DraftCaptionSelect

// ── Materialization (FR-04) ─────────────────────────────────────────────────

export interface MaterializeInput {
  rowCount: number
  legacyText: string | null
  captionMigration: CaptionMigration | null
  status: DraftStatus
  pendingAction: DraftAction | null
}

// The one rule for "is this a legacy draft, and may it be migrated now?",
// shared by the loader and the boot backfill. A legacy draft has no caption
// rows, a legacy text and no recorded outcome. "No rows" is the key: a draft
// created after 012 always has rows and a null legacy text. A draft still
// being generated, or with a caption regenerate in flight (possibly an old
// container's, which writes the legacy column), is deferred: migrating it now
// would freeze a text that is about to change.
export function materializeStep(d: MaterializeInput): 'migrate' | 'defer' | null {
  if (d.rowCount > 0 || d.legacyText == null || d.captionMigration != null) return null
  if (d.status === 'IN_PROGRESS' || d.pendingAction === 'REGENERATE_COPY') return 'defer'
  return 'migrate'
}

// Migrate one legacy draft: the planned rows and the outcome in one
// transaction. Idempotent and race-safe — skipDuplicates absorbs rows another
// writer already inserted, and the outcome is set only while still null.
// `written` is true only for the call that recorded the outcome, so a race
// counts and logs each draft once.
export async function migrateDraft(
  draftId: string,
  legacyText: string,
  db: PrismaClient = prisma,
): Promise<{ outcome: CaptionMigrationOutcome; written: boolean }> {
  const plan = planCaptionMigration(legacyText)
  const [, marked] = await db.$transaction([
    db.draftCaption.createMany({
      data: plan.rows.map((r) => ({ draftId, ...r })),
      skipDuplicates: true,
    }),
    db.draft.updateMany({
      where: { id: draftId, captionMigration: null },
      data: { captionMigration: plan.outcome },
    }),
  ])
  return { outcome: plan.outcome, written: marked.count === 1 }
}

function orderByRegistry(rows: CaptionRow[]): CaptionRow[] {
  return CAPTION_CHANNELS.flatMap(({ channel }) => rows.filter((r) => r.channel === channel))
}

// Shown while a legacy draft is deferred. Never stored.
function synthesizePending(updatedAt: Date): CaptionRow[] {
  return CAPTION_CHANNELS.map(({ channel }) => ({
    channel,
    text: '',
    status: 'PENDING' as const,
    failureReason: null,
    needsReview: false,
    updatedAt,
    model: null,
    modelSubstitutedFrom: null,
  }))
}

function findRows(draftId: string, db: PrismaClient): Promise<CaptionRow[]> {
  return db.draftCaption.findMany({ where: { draftId }, select: ROW_SELECT })
}

// The only way to read a draft's captions. Returns null when the draft does
// not exist; callers have already checked access to it.
export async function loadDraftCaptions(
  draftId: string,
  db: PrismaClient = prisma,
): Promise<DraftCaptions | null> {
  const draft = await db.draft.findUnique({
    where: { id: draftId },
    select: {
      status: true,
      pendingAction: true,
      captionMigration: true,
      legacyCaptionText: true,
      updatedAt: true,
      captions: { select: ROW_SELECT },
    },
  })
  if (!draft) return null

  const step = materializeStep({
    rowCount: draft.captions.length,
    legacyText: draft.legacyCaptionText,
    captionMigration: draft.captionMigration,
    status: draft.status,
    pendingAction: draft.pendingAction,
  })
  if (step === 'defer') {
    return { captions: synthesizePending(draft.updatedAt), deferred: true, captionMigration: null }
  }

  let rows = draft.captions
  let captionMigration = draft.captionMigration
  if (step === 'migrate') {
    // 'migrate' implies a non-null legacy text (materializeStep).
    const { outcome, written } = await migrateDraft(draftId, draft.legacyCaptionText!, db)
    // A racing reader that recorded it first planned the same text, so the
    // outcome is the same either way.
    captionMigration = outcome
    if (written) {
      console.info(`[captions] draft ${draftId} migrated on read: ${outcome}`)
      if (outcome === 'UNSPLIT_FALLBACK') await logCaptionReview({ id: draftId }, db)
    }
    rows = await findRows(draftId, db)
  }

  // A registry channel the draft lacks (a channel added after the draft was
  // created) gets an empty READY row, so every reader sees one per channel.
  const missing = CAPTION_CHANNELS.filter((s) => !rows.some((r) => r.channel === s.channel))
  if (missing.length > 0) {
    await db.draftCaption.createMany({
      data: missing.map((s) => ({ draftId, channel: s.channel, text: '', status: 'READY' as const })),
      skipDuplicates: true,
    })
    rows = await findRows(draftId, db)
  }
  return { captions: orderByRegistry(rows), deferred: false, captionMigration }
}

// ── Publishing (FR-14) ──────────────────────────────────────────────────────

// The publish-time decision for one channel: the draft's row for it, through
// the loader (so a legacy draft materializes first), run through the pure
// resolver. A missing draft has no row, so it is refused like one.
export async function loadCaptionForPublish(
  draftId: string,
  channel: Channel,
  db: PrismaClient = prisma,
): Promise<CaptionResolution> {
  const loaded = await loadDraftCaptions(draftId, db)
  return resolveCaptionForPublish(channel, loaded?.captions.find((r) => r.channel === channel))
}

// The text the posts routes show for a post's channel, or '' (FR-13).
export async function loadCaptionText(
  draftId: string,
  channel: Channel,
  db: PrismaClient = prisma,
): Promise<string> {
  const loaded = await loadDraftCaptions(draftId, db)
  return loaded?.captions.find((r) => r.channel === channel)?.text ?? ''
}

// ── REVIEW lines (FR-04) ────────────────────────────────────────────────────

// A post that may still go out with whatever caption the draft has now.
const LIVE_POST_STATUSES: PostStatus[] = ['SCHEDULED', 'PENDING', 'PUBLISHING']

// One line per fallback-migrated draft (its caption was not split, so both
// feeds carry the whole legacy text) that still has a live post. Matches the
// drafts in `where` that are UNSPLIT_FALLBACK.
export async function captionReviewLines(
  where: Prisma.DraftWhereInput,
  db: PrismaClient = prisma,
): Promise<string[]> {
  const drafts = await db.draft.findMany({
    where: {
      ...where,
      captionMigration: 'UNSPLIT_FALLBACK',
      posts: { some: { status: { in: LIVE_POST_STATUSES } } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      teamId: true,
      brief: { select: { topic: true } },
      posts: {
        where: { status: { in: LIVE_POST_STATUSES } },
        orderBy: { scheduledAt: 'asc' },
        select: { channel: true, scheduledAt: true },
      },
    },
  })
  if (drafts.length === 0) return []

  const teams = await db.team.findMany({
    where: { id: { in: [...new Set(drafts.map((d) => d.teamId))] } },
    select: { id: true, name: true },
  })
  const teamName = new Map(teams.map((t) => [t.id, t.name]))
  return drafts.map((d) => {
    const posts = d.posts
      .map((p) => `${p.channel} at ${p.scheduledAt ? p.scheduledAt.toISOString() : 'unscheduled'}`)
      .join(', ')
    // Collapse control characters so a topic or team name can't forge a log line.
    const oneLine = (s: string) => s.replace(/[\r\n\t\u0000-\u001f]+/g, ' ')
    return (
      `[captions] REVIEW draft ${d.id} — team "${oneLine(teamName.get(d.teamId) ?? d.teamId)}", ` +
      `topic "${oneLine(d.brief.topic)}": caption not split (both feeds carry the whole legacy text); ` +
      `live posts: ${posts}`
    )
  })
}

async function logCaptionReview(
  where: Prisma.DraftWhereInput,
  db: PrismaClient = prisma,
): Promise<void> {
  for (const line of await captionReviewLines(where, db)) console.warn(line)
}

// ── Writers ─────────────────────────────────────────────────────────────────

// The caption stamp (008 FR-08) is defined beside the pure settle rule.
export type { CaptionStamp }

export interface GenerationCaptionData {
  channel: Channel
  text: string
  status: 'READY' | 'FAILED'
  failureReason: string | null
  model: string | null
  modelSubstitutedFrom: string | null
}

// The row values a generation's caption result gives each registry channel it
// covers: validated text → READY, stamped with the model that wrote it; a
// failed field → FAILED with no text (failed model output is never stored) and
// no stamp — a stamp names the model whose output is the row's text, and a
// text-less row has none (008 FR-08). Regenerate settling is settleCaptionRow,
// which keeps good text, and its stamp, on a failed regenerate (A7).
export function captionRowsFromFields(
  fields: Partial<Record<CaptionTarget, FieldResult>>,
  stamp: CaptionStamp,
): GenerationCaptionData[] {
  return CAPTION_CHANNELS.flatMap<GenerationCaptionData>(({ channel }) => {
    const field = fields[channel]
    if (!field) return []
    return field.ok
      ? [
          {
            channel,
            text: field.text,
            status: 'READY',
            failureReason: null,
            model: stamp.model,
            modelSubstitutedFrom: stamp.substitutedFrom,
          },
        ]
      : [
          {
            channel,
            text: '',
            status: 'FAILED',
            failureReason: field.reason,
            model: null,
            modelSubstitutedFrom: null,
          },
        ]
  })
}

// The headline's stamp fields (008 FR-08), written with a validated headline only.
export function headlineStampFields(stamp: CaptionStamp): {
  headlineModel: string
  headlineModelSubstitutedFrom: string | null
} {
  return { headlineModel: stamp.model, headlineModelSubstitutedFrom: stamp.substitutedFrom }
}

// The async generation's write (design §4): every channel's row and the
// headline (when it validated) in one transaction, each with its 008 stamp.
// Row writes are guarded on PENDING, the state createPendingDraft and retry
// leave them in.
export async function saveGenerationCaptions(
  draftId: string,
  fields: Partial<Record<CaptionTarget, FieldResult>>,
  stamp: CaptionStamp,
): Promise<void> {
  const headline = fields.HEADLINE
  await prisma.$transaction([
    ...captionRowsFromFields(fields, stamp).map(({ channel, ...data }) =>
      prisma.draftCaption.updateMany({
        where: { draftId, channel, status: 'PENDING' },
        data: { ...data, needsReview: false },
      }),
    ),
    ...(headline?.ok
      ? [
          prisma.draft.updateMany({
            where: { id: draftId },
            data: { headline: headline.text, ...headlineStampFields(stamp) },
          }),
        ]
      : []),
  ])
}

// Claim the draft-level caption action (A2, design §5): REGENERATE_COPY,
// guarded on no action in flight, and the target rows marked PENDING in the
// same transaction. False when another action holds the draft (the caller
// answers 409). Released by startDraftAction as today.
//
// The rows must exist: call loadDraftCaptions first, so a legacy draft is
// materialized before its rows are claimed. Otherwise the PENDING update finds
// nothing and the settle has no row to write.
export async function claimCaptionAction(
  draftId: string,
  targets: readonly CaptionTarget[],
  db: PrismaClient = prisma,
): Promise<boolean> {
  const channels = targetChannels(targets)
  return db.$transaction(async (tx) => {
    const { count } = await tx.draft.updateMany({
      where: { id: draftId, pendingAction: null },
      data: { pendingAction: 'REGENERATE_COPY' },
    })
    if (count !== 1) return false
    if (channels.length > 0) {
      await tx.draftCaption.updateMany({
        where: { draftId, channel: { in: channels } },
        data: { status: 'PENDING' },
      })
    }
    return true
  })
}

function targetChannels(targets: readonly CaptionTarget[]): Channel[] {
  return targets.filter((t): t is Channel => t !== 'HEADLINE')
}

// Settle the PENDING rows (all of the draft's, or only `channels`) per
// settleCaptionRow. Each write is guarded on PENDING, so a row an edit or a
// newer write already settled is left alone, and a deleted draft is a no-op.
// A caption action's reply stamp is written on the rows whose field validated
// only; with none (the stale sweep, a failed run) no stamp field is written,
// so a row keeps the stamp of the text it keeps (008 FR-08).
async function settlePendingRows(
  tx: Prisma.TransactionClient,
  draftId: string,
  channels: Channel[] | null,
  fieldFor: (channel: Channel) => FieldResult,
  stamp: CaptionStamp | null = null,
): Promise<void> {
  const rows = await tx.draftCaption.findMany({
    where: { draftId, status: 'PENDING', ...(channels ? { channel: { in: channels } } : {}) },
    select: { channel: true, text: true },
  })
  for (const row of rows) {
    await tx.draftCaption.updateMany({
      where: { draftId, channel: row.channel, status: 'PENDING' },
      data: settleCaptionRow(row, fieldFor(row.channel), stamp),
    })
  }
}

// A caption action's write (FR-11, design §5): each target row per its field
// result, and the headline when it was requested and validated, in one
// transaction. The headline write is guarded on the caption claim, so a run the
// stale sweep already cleared cannot overwrite it late. A failed headline
// leaves the column unchanged; the caller reports it.
//
// 008 FR-08: `stamp` is the reply's model (writeCaptions). It goes on each
// target whose field validated — the row's model, or headlineModel in the
// headline's guarded write — and never on a failed one, which keeps its stamp
// with its text (A7). The failure settles (onError, an unstarted run) pass none.
export async function settleCaptionAction(
  draftId: string,
  targets: readonly CaptionTarget[],
  fields: Partial<Record<CaptionTarget, FieldResult>>,
  stamp: CaptionStamp | null = null,
  db: PrismaClient = prisma,
): Promise<void> {
  const headline = targets.includes('HEADLINE') ? fields.HEADLINE : undefined
  await db.$transaction(async (tx) => {
    await settlePendingRows(
      tx,
      draftId,
      targetChannels(targets),
      (channel) => fields[channel] ?? { ok: false, reason: 'missing' },
      stamp,
    )
    if (headline?.ok) {
      await tx.draft.updateMany({
        where: { id: draftId, pendingAction: 'REGENERATE_COPY' },
        data: { headline: headline.text, ...(stamp ? headlineStampFields(stamp) : {}) },
      })
    }
  })
}

// The stale sweep's caption half (FR-11): an interrupted generation or caption
// action leaves rows PENDING with nothing writing them. They settle as a failed
// write with the sweep's reason, keeping any text they had (A7).
export async function settlePendingCaptions(
  draftId: string,
  reason: string,
  db: PrismaClient = prisma,
): Promise<void> {
  await db.$transaction((tx) => settlePendingRows(tx, draftId, null, () => ({ ok: false, reason })))
}

// A user's edit to one caption (FR-12): stored exactly as typed, READY, the
// failure and review flags cleared. Refused (false) while the row is PENDING,
// so an edit never races the write that claimed it.
export async function saveCaptionEdit(
  draftId: string,
  channel: Channel,
  text: string,
  db: PrismaClient = prisma,
): Promise<boolean> {
  const { count } = await db.draftCaption.updateMany({
    where: { draftId, channel, status: { not: 'PENDING' } },
    data: { text, status: 'READY', failureReason: null, needsReview: false },
  })
  return count === 1
}

// A user's edit to the headline (FR-12). Refused (false) while a caption
// action holds the draft or a generation is running, since either may be
// writing the headline.
export async function saveHeadlineEdit(
  draftId: string,
  headline: string,
  db: PrismaClient = prisma,
): Promise<boolean> {
  const { count } = await db.draft.updateMany({
    where: {
      id: draftId,
      status: { not: 'IN_PROGRESS' },
      OR: [{ pendingAction: null }, { pendingAction: { not: 'REGENERATE_COPY' } }],
    },
    data: { headline },
  })
  return count === 1
}
