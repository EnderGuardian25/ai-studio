// 012 T4 — the boot backfill (FR-04, design §8): advisory lock around the
// run, keyset paging, deferral, per-draft isolation, the summary and REVIEW
// lines, and --report. Runs the real store + planner on a fake client.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

const { runCaptionBackfill, backfillSummaryLine } = await import('@/lib/captions/backfill')

interface FakeDraft {
  id: string
  createdAt: Date
  status: string
  pendingAction: string | null
  copyText: string
}

const at = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n))
const draft = (id: string, n: number, copyText: string, over: Partial<FakeDraft> = {}): FakeDraft => ({
  id,
  createdAt: at(n),
  status: 'EXPORTED',
  pendingAction: null,
  copyText,
  ...over,
})

const SPLIT_TEXT = 'INSTAGRAM:\nfor the feed\nLINKEDIN:\nfor the network'

function fakeDb(pages: FakeDraft[][], opts: { failFor?: string[]; reviewDrafts?: unknown[] } = {}) {
  const events: string[] = []
  const pageQueries: unknown[] = []
  const db = {
    $executeRaw: vi.fn(async (sql: { sql: string }) => {
      events.push(sql.sql.includes('pg_advisory_unlock') ? 'unlock' : 'lock')
      return 1
    }),
    draft: {
      findMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
        if (args.where.captionMigration === 'UNSPLIT_FALLBACK') {
          events.push('review')
          return opts.reviewDrafts ?? []
        }
        events.push('page')
        pageQueries.push(args)
        return pages.shift() ?? []
      }),
      updateMany: vi.fn((args: { where: { id: string } }) => ({ op: 'mark', id: args.where.id })),
    },
    draftCaption: {
      createMany: vi.fn((args: { data: Array<{ draftId: string }> }) => ({
        op: 'rows',
        id: args.data[0].draftId,
      })),
    },
    team: { findMany: vi.fn(async () => [{ id: 't1', name: 'Bistec' }]) },
    $transaction: vi.fn(async (ops: Array<{ op: string; id: string }>) => {
      const id = ops[0].id
      if (opts.failFor?.includes(id)) throw new Error(`boom ${id}`)
      events.push(`migrate ${id}`)
      return [{ count: 3 }, { count: 1 }]
    }),
  }
  return { db, events, pageQueries }
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('runCaptionBackfill', () => {
  it('takes the lock before reading, migrates each eligible draft, unlocks, then summarizes', async () => {
    const { db, events } = fakeDb([
      [draft('a', 1, SPLIT_TEXT), draft('b', 2, 'one caption'), draft('c', 3, '  ')],
    ])

    const summary = await runCaptionBackfill({ db: db as never })

    expect(summary).toEqual({ split: 1, unsplitFallback: 1, empty: 1, deferred: 0, errors: 0 })
    expect(events).toEqual(['lock', 'page', 'migrate a', 'migrate b', 'migrate c', 'unlock', 'review'])
    expect(console.log).toHaveBeenCalledWith(
      '[captions] backfill: 3 drafts — split 1, unsplit-fallback 1, empty 1, deferred 0, errors 0',
    )
  })

  it('isolates a failing draft: logged and counted, the run continues and still unlocks', async () => {
    const { db, events } = fakeDb([[draft('a', 1, SPLIT_TEXT), draft('b', 2, SPLIT_TEXT), draft('c', 3, SPLIT_TEXT)]], {
      failFor: ['b'],
    })

    const summary = await runCaptionBackfill({ db: db as never })

    expect(summary).toEqual({ split: 2, unsplitFallback: 0, empty: 0, deferred: 0, errors: 1 })
    expect(events).toEqual(['lock', 'page', 'migrate a', 'migrate c', 'unlock'])
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('draft b failed'), expect.any(Error))
  })

  it('counts deferred drafts without writing them', async () => {
    const { db, events } = fakeDb([
      [
        draft('a', 1, SPLIT_TEXT, { status: 'IN_PROGRESS' }),
        draft('b', 2, SPLIT_TEXT, { pendingAction: 'REGENERATE_COPY' }),
        draft('c', 3, SPLIT_TEXT, { pendingAction: 'REFINE' }),
      ],
    ])

    const summary = await runCaptionBackfill({ db: db as never })

    expect(summary).toMatchObject({ split: 1, deferred: 2 })
    expect(events.filter((e) => e.startsWith('migrate'))).toEqual(['migrate c'])
  })

  it('does not count a draft whose outcome another writer recorded first', async () => {
    const { db } = fakeDb([[draft('a', 1, SPLIT_TEXT)]])
    db.$transaction.mockResolvedValueOnce([{ count: 0 }, { count: 0 }])
    expect(await runCaptionBackfill({ db: db as never })).toMatchObject({ split: 0, errors: 0 })
  })

  it('pages by (createdAt, id) keyset and stops on a short page', async () => {
    const { db, pageQueries } = fakeDb([
      [draft('a', 1, SPLIT_TEXT, { status: 'IN_PROGRESS' }), draft('b', 2, SPLIT_TEXT)],
      [draft('c', 3, SPLIT_TEXT)],
    ])

    const summary = await runCaptionBackfill({ db: db as never, pageSize: 2 })

    expect(summary).toMatchObject({ split: 2, deferred: 1 })
    expect(pageQueries).toHaveLength(2)
    const [first, second] = pageQueries as Array<{ where: Record<string, unknown>; take: number }>
    expect(first.where).toEqual({ captionMigration: null, captions: { none: {} } })
    expect(first.take).toBe(2)
    expect(second.where.OR).toEqual([
      { createdAt: { gt: at(2) } },
      { createdAt: at(2), id: { gt: 'b' } },
    ])
  })

  it('a top-level failure rejects, and the lock is still released', async () => {
    const { db, events } = fakeDb([])
    db.draft.findMany.mockRejectedValueOnce(new Error('db down'))
    await expect(runCaptionBackfill({ db: db as never })).rejects.toThrow('db down')
    expect(events).toEqual(['lock', 'unlock'])
  })

  it('prints a REVIEW line per fallback draft it migrated that has a live post', async () => {
    const { db } = fakeDb([[draft('b', 2, 'one caption'), draft('a', 1, SPLIT_TEXT)]], {
      reviewDrafts: [
        {
          id: 'b',
          teamId: 't1',
          brief: { topic: 'Launch' },
          posts: [
            { channel: 'INSTAGRAM', scheduledAt: new Date('2026-10-12T09:00:00Z') },
            { channel: 'LINKEDIN', scheduledAt: null },
          ],
        },
      ],
    })

    await runCaptionBackfill({ db: db as never })

    const reviewQuery = db.draft.findMany.mock.calls.find(
      (c) => c[0].where.captionMigration === 'UNSPLIT_FALLBACK',
    )![0]
    expect(reviewQuery.where.id).toEqual({ in: ['b'] })
    expect(console.warn).toHaveBeenCalledWith(
      '[captions] REVIEW draft b — team "Bistec", topic "Launch": caption not split (both feeds carry ' +
        'the whole legacy text); live posts: INSTAGRAM at 2026-10-12T09:00:00.000Z, LINKEDIN at unscheduled',
    )
  })

  it('--report prints the REVIEW list without locking or writing', async () => {
    const { db, events } = fakeDb([[draft('a', 1, SPLIT_TEXT)]], {
      reviewDrafts: [{ id: 'x', teamId: 't1', brief: { topic: 'T' }, posts: [] }],
    })

    expect(await runCaptionBackfill({ db: db as never, report: true })).toBeNull()

    expect(events).toEqual(['review'])
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/^\[captions\] REVIEW draft x/))
    expect(console.log).toHaveBeenCalledWith('[captions] report: 1 draft(s) to review')
  })
})

describe('backfillSummaryLine', () => {
  it('matches the FR-04 format', () => {
    expect(backfillSummaryLine({ split: 2, unsplitFallback: 1, empty: 0, deferred: 4, errors: 1 })).toBe(
      '[captions] backfill: 8 drafts — split 2, unsplit-fallback 1, empty 0, deferred 4, errors 1',
    )
  })
})
