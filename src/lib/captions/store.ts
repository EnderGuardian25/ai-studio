// The caption store (012 FR-02/FR-04/FR-10, design §6): the only module that
// reads or writes DraftCaption rows. Every reader gets captions through
// loadDraftCaptions, which materializes a legacy draft (the pre-012 single
// caption, no rows yet) BEFORE returning, so no reader ever has a "rows, or
// else the legacy column" branch.
//
// Until T9 the legacy column is still the Prisma field `copyText` (NOT NULL);
// T9 renames it to `legacyCaptionText @map("copyText")` and makes it nullable.
// The materializer reads it under its current name.
//
// What to write is decided by pure modules (migrationPlan.ts here; T6 adds the
// settle rules in actionTargets.ts). This file only issues the queries.

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

export interface CaptionRow {
  channel: Channel
  text: string
  status: CaptionStatus
  failureReason: string | null
  needsReview: boolean
  updatedAt: Date
}

export interface DraftCaptions {
  /** One per registry channel, in registry order. */
  captions: CaptionRow[]
  /** True while a legacy draft waits to be migrated; its captions are synthesized. */
  deferred: boolean
}

const ROW_SELECT = {
  channel: true,
  text: true,
  status: true,
  failureReason: true,
  needsReview: true,
  updatedAt: true,
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
// created after 012 always has rows, so the `copyText: ''` placeholder new
// drafts write until T9 never looks legacy. A draft still being generated, or
// with a caption regenerate in flight (possibly an old container's, which
// writes the legacy column), is deferred: migrating it now would freeze a text
// that is about to change.
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
      copyText: true,
      updatedAt: true,
      captions: { select: ROW_SELECT },
    },
  })
  if (!draft) return null

  const step = materializeStep({
    rowCount: draft.captions.length,
    legacyText: draft.copyText,
    captionMigration: draft.captionMigration,
    status: draft.status,
    pendingAction: draft.pendingAction,
  })
  if (step === 'defer') return { captions: synthesizePending(draft.updatedAt), deferred: true }

  let rows = draft.captions
  if (step === 'migrate') {
    const { outcome, written } = await migrateDraft(draftId, draft.copyText, db)
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
  return { captions: orderByRegistry(rows), deferred: false }
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

export interface GenerationCaptionData {
  channel: Channel
  text: string
  status: 'READY' | 'FAILED'
  failureReason: string | null
}

// The row values a generation's caption result gives each registry channel it
// covers: validated text → READY; a failed field → FAILED with no text (failed
// model output is never stored). T6 moves regenerate settling onto the pure
// settleCaptionRow, which also keeps good text on a failed regenerate (A7).
export function captionRowsFromFields(
  fields: Partial<Record<CaptionTarget, FieldResult>>,
): GenerationCaptionData[] {
  return CAPTION_CHANNELS.flatMap<GenerationCaptionData>(({ channel }) => {
    const field = fields[channel]
    if (!field) return []
    return field.ok
      ? [{ channel, text: field.text, status: 'READY', failureReason: null }]
      : [{ channel, text: '', status: 'FAILED', failureReason: field.reason }]
  })
}

// The async generation's write (design §4): every channel's row and the
// headline (when it validated) in one transaction. Row writes are guarded on
// PENDING, the state createPendingDraft and retry leave them in.
export async function saveGenerationCaptions(
  draftId: string,
  fields: Partial<Record<CaptionTarget, FieldResult>>,
): Promise<void> {
  const headline = fields.HEADLINE
  await prisma.$transaction([
    ...captionRowsFromFields(fields).map(({ channel, ...data }) =>
      prisma.draftCaption.updateMany({
        where: { draftId, channel, status: 'PENDING' },
        data: { ...data, needsReview: false },
      }),
    ),
    ...(headline?.ok
      ? [prisma.draft.updateMany({ where: { id: draftId }, data: { headline: headline.text } })]
      : []),
  ])
}

// Claim the draft-level caption action (A2, design §5): REGENERATE_COPY,
// guarded on no action in flight, and the target rows marked PENDING in the
// same transaction. False when another action holds the draft (the caller
// answers 409). Released by startDraftAction as today; the per-row settle
// (settleCaptionAction) and the stale sweep's settlePendingCaptions land in T6.
export async function claimCaptionAction(
  draftId: string,
  targets: readonly CaptionTarget[],
): Promise<boolean> {
  const channels = targets.filter((t): t is Channel => t !== 'HEADLINE')
  return prisma.$transaction(async (tx) => {
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
