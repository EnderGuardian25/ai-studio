// The boot backfill (012 FR-04, design §8): migrates every legacy draft — no
// caption rows, a legacy caption, no recorded outcome — through the same
// per-draft step the lazy loader uses (store.ts migrateDraft). The entrypoint
// runs it after `prisma migrate deploy`; `npm run captions:backfill` runs it
// by hand, and `--report` (`npm run captions:report`) only prints the REVIEW
// list.
//
// It is idempotent (a second run writes 0) and per-draft isolated: one bad
// draft is logged and counted, and the lazy loader retries it on read. Only a
// top-level failure (the database unreachable) rejects, which fails the boot.

import { Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { captionReviewLines, materializeStep, migrateDraft } from '@/lib/captions/store'

export interface BackfillSummary {
  split: number
  unsplitFallback: number
  empty: number
  deferred: number
  errors: number
}

export interface BackfillOptions {
  report?: boolean
  /**
   * The client to run on. The CLI passes a single-connection client: an
   * advisory lock belongs to one database session, so with a pool the unlock
   * could run on a different connection than the lock.
   */
  db?: PrismaClient
  pageSize?: number
}

// Session-level, so the app and scheduler containers booting at once
// serialize: the second waits, then finds nothing left to migrate.
const LOCK = Prisma.sql`SELECT pg_advisory_lock(hashtext('012-caption-backfill'))`
const UNLOCK = Prisma.sql`SELECT pg_advisory_unlock(hashtext('012-caption-backfill'))`

interface PageCursor {
  createdAt: Date
  id: string
}

// One page of legacy drafts after the cursor, oldest first. Keyset paging over
// (createdAt, id): migrated drafts leave the result set as the run goes and
// deferred ones stay in it, so an offset would skip or repeat drafts.
function legacyDraftPage(db: PrismaClient, after: PageCursor | null, take: number) {
  return db.draft.findMany({
    where: {
      captionMigration: null,
      legacyCaptionText: { not: null },
      captions: { none: {} },
      ...(after && {
        OR: [
          { createdAt: { gt: after.createdAt } },
          { createdAt: after.createdAt, id: { gt: after.id } },
        ],
      }),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take,
    select: { id: true, createdAt: true, status: true, pendingAction: true, legacyCaptionText: true },
  })
}

export function backfillSummaryLine(s: BackfillSummary): string {
  // N is every legacy draft the run met, so the breakdown adds up to it.
  const total = s.split + s.unsplitFallback + s.empty + s.deferred + s.errors
  return (
    `[captions] backfill: ${total} drafts — split ${s.split}, unsplit-fallback ${s.unsplitFallback}, ` +
    `empty ${s.empty}, deferred ${s.deferred}, errors ${s.errors}`
  )
}

export async function runCaptionBackfill(opts: BackfillOptions = {}): Promise<BackfillSummary | null> {
  const { report = false, db = prisma, pageSize = 100 } = opts

  if (report) {
    const lines = await captionReviewLines({}, db)
    for (const line of lines) console.log(line)
    console.log(`[captions] report: ${lines.length} draft(s) to review`)
    return null
  }

  const summary: BackfillSummary = { split: 0, unsplitFallback: 0, empty: 0, deferred: 0, errors: 0 }
  const fallbackIds: string[] = []

  await db.$executeRaw(LOCK)
  try {
    let after: PageCursor | null = null
    for (;;) {
      const page = await legacyDraftPage(db, after, pageSize)

      for (const d of page) {
        const step = materializeStep({
          rowCount: 0,
          legacyText: d.legacyCaptionText,
          captionMigration: null,
          status: d.status,
          pendingAction: d.pendingAction,
        })
        if (step === 'defer') {
          summary.deferred++
          continue
        }
        try {
          // The page filter guarantees a non-null legacy text.
          const { outcome, written } = await migrateDraft(d.id, d.legacyCaptionText!, db)
          if (!written) continue // the lazy loader got there first
          if (outcome === 'SPLIT') summary.split++
          else if (outcome === 'EMPTY') summary.empty++
          else {
            summary.unsplitFallback++
            fallbackIds.push(d.id)
          }
        } catch (err) {
          summary.errors++
          console.error(`[captions] backfill: draft ${d.id} failed (the loader retries it on read):`, err)
        }
      }

      if (page.length < pageSize) break
      const last = page[page.length - 1]
      after = { createdAt: last.createdAt, id: last.id }
    }
  } finally {
    await db.$executeRaw(UNLOCK)
  }

  console.log(backfillSummaryLine(summary))
  if (fallbackIds.length > 0) {
    for (const line of await captionReviewLines({ id: { in: fallbackIds } }, db)) console.warn(line)
  }
  return summary
}
