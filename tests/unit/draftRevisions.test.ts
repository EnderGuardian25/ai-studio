import { describe, it, expect, vi, beforeEach } from 'vitest'

// T16 (change 004 Phase 2) — the revision-chain query helpers in
// src/lib/drafts/revisions.ts are the single filter that keeps rejected refine
// renders (revisionNumber NULL + rejectedAt set, FR-13) out of every consumer:
// the version-switch list, restore/Undo, and next-number allocation.
//
// The fake prisma below evaluates `where` for real and sorts with POSTGRES
// semantics — NULLs FIRST under ORDER BY … DESC — because that is exactly the
// hazard: an unfiltered "latest revision" query returns the rejected row. It
// throws on any where-key it doesn't understand so a helper can't silently
// drift into an unsupported (and so untested) filter.

interface Row {
  id: string
  draftId: string
  revisionNumber: number | null
  rejectedAt: Date | null
  instruction: string
  htmlSnapshot: string
  exportUrl: string | null
  createdAt: Date
  rejection?: unknown
  adoptedAt?: Date | null
  discardedAt?: Date | null
}

const fake = vi.hoisted(() => {
  const db = {
    rows: [] as Row[],
    draftUpdates: [] as Array<{ where: unknown; data: Record<string, unknown> }>,
    // The draft's current not-applied pointer (draft.findUnique).
    notAppliedRevisionId: null as string | null,
    render: { calls: 0, fail: false },
    uploads: [] as string[],
  }

  function matches(row: Row, where: Record<string, unknown>): boolean {
    for (const [key, cond] of Object.entries(where)) {
      const value = (row as unknown as Record<string, unknown>)[key]
      if (key === 'draftId' || key === 'id') {
        if (value !== cond) return false
      } else if (key === 'adoptedAt' || key === 'discardedAt') {
        if (cond !== null) throw new Error(`fake prisma: unsupported condition on ${key}`)
        if (value != null) return false
      } else if (key === 'rejectedAt' || key === 'revisionNumber') {
        if (cond === null) {
          if (value !== null) return false
        } else if (typeof cond === 'number') {
          if (value !== cond) return false
        } else if (
          typeof cond === 'object' &&
          cond &&
          'not' in cond &&
          (cond as { not: unknown }).not === null
        ) {
          if (value === null) return false
        } else {
          throw new Error(`fake prisma: unsupported condition on ${key}: ${JSON.stringify(cond)}`)
        }
      } else {
        throw new Error(`fake prisma: unsupported where key ${key}`)
      }
    }
    return true
  }

  // Postgres default ordering: ASC → NULLS LAST, DESC → NULLS FIRST.
  function sorted(rows: Row[], orderBy?: { revisionNumber: 'asc' | 'desc' }): Row[] {
    if (!orderBy) return rows
    const dir = orderBy.revisionNumber
    return [...rows].sort((a, b) => {
      const x = a.revisionNumber
      const y = b.revisionNumber
      if (x === null && y === null) return 0
      if (x === null) return dir === 'desc' ? -1 : 1
      if (y === null) return dir === 'desc' ? 1 : -1
      return dir === 'desc' ? y - x : x - y
    })
  }

  function project(row: Row | undefined, select?: Record<string, boolean>) {
    if (!row) return null
    if (!select) return { ...row }
    return Object.fromEntries(
      Object.keys(select).map((k) => [k, (row as unknown as Record<string, unknown>)[k]]),
    )
  }

  type Args = {
    where?: Record<string, unknown>
    orderBy?: { revisionNumber: 'asc' | 'desc' }
    select?: Record<string, boolean>
  }

  const draftRevision = {
    findFirst: async (args: Args) =>
      project(
        sorted(
          db.rows.filter((r) => matches(r, args.where ?? {})),
          args.orderBy,
        )[0],
        args.select,
      ),
    findMany: async (args: Args) =>
      sorted(
        db.rows.filter((r) => matches(r, args.where ?? {})),
        args.orderBy,
      ).map((r) => project(r, args.select)),
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
      const hit = db.rows.filter((r) => matches(r, where))
      for (const r of hit) Object.assign(r, data)
      return { count: hit.length }
    },
    create: async ({
      data,
    }: {
      data: Partial<Row> & { draftId: string; revisionNumber: number | null }
    }) => {
      const clash =
        data.revisionNumber !== null &&
        db.rows.some((r) => r.draftId === data.draftId && r.revisionNumber === data.revisionNumber)
      if (clash) throw new Error('unexpected unique violation in fake')
      const row: Row = {
        id: `rev-${db.rows.length + 1}`,
        rejectedAt: null,
        exportUrl: null,
        createdAt: new Date(),
        instruction: '',
        htmlSnapshot: '',
        ...data,
      }
      db.rows.push(row)
      return { id: row.id }
    },
  }

  const client = {
    draftRevision,
    draft: {
      findUnique: async () => ({ notAppliedRevisionId: db.notAppliedRevisionId }),
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        db.draftUpdates.push(args)
        if ('notAppliedRevisionId' in args.data) db.notAppliedRevisionId = args.data.notAppliedRevisionId as string | null
        return {}
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(client),
  }
  return { db, client }
})
const db = fake.db
vi.mock('@/lib/prisma', () => ({ prisma: fake.client }))
vi.mock('@/lib/renderer/fontSet', () => ({ getFontSetId: () => 'fonts-test' }))
vi.mock('@/lib/renderer/puppeteer', () => ({
  renderHtmlToPng: async () => {
    fake.db.render.calls++
    if (fake.db.render.fail) throw new Error('Chromium crashed')
    return Buffer.from('png')
  },
}))
vi.mock('@/lib/storage/minio', () => ({
  BUCKET_EXPORTS: 'exports',
  exportKey: (kind: string, id: string) => `exports/${kind}-${id}-test.png`,
  uploadObject: async (_b: Buffer, _bucket: string, key: string) => {
    fake.db.uploads.push(key)
  },
}))

import { prisma } from '@/lib/prisma'
import {
  COMMITTED_REVISION,
  committedRevisionWhere,
  listCommittedRevisions,
  findCommittedRevision,
  nextRevisionNumber,
  withNextRevisionNumber,
  commitDraftRevision,
  recordRejectedRender,
  rejectionDiagnosticsSchema,
  MAX_NOT_APPLIED_REASON,
  type RejectionDiagnostics,
} from '@/lib/drafts/revisions'

let seq = 0
function committed(
  draftId: string,
  revisionNumber: number,
  instruction = `v${revisionNumber}`,
): Row {
  return {
    id: `c-${++seq}`,
    draftId,
    revisionNumber,
    rejectedAt: null,
    instruction,
    htmlSnapshot: `<html>${instruction}</html>`,
    exportUrl: `exports/${draftId}-${revisionNumber}.png`,
    createdAt: new Date(2026, 8, 1, 0, seq),
  }
}
function rejected(draftId: string, instruction = 'make the logo bigger'): Row {
  return {
    id: `x-${++seq}`,
    draftId,
    revisionNumber: null,
    rejectedAt: new Date(),
    instruction,
    htmlSnapshot: '<html>REJECTED RENDER</html>',
    exportUrl: `exports/${draftId}-rejected.png`,
    createdAt: new Date(2026, 8, 2, 0, seq),
  }
}

beforeEach(() => {
  db.rows = []
  db.draftUpdates = []
  db.notAppliedRevisionId = null
  db.render = { calls: 0, fail: false }
  db.uploads = []
})

describe('COMMITTED_REVISION / committedRevisionWhere', () => {
  it('states both halves of the chain invariant', () => {
    expect(COMMITTED_REVISION).toEqual({ rejectedAt: null, revisionNumber: { not: null } })
  })

  it('scopes to the draft and carries the committed filter', () => {
    expect(committedRevisionWhere('d1')).toEqual({
      draftId: 'd1',
      rejectedAt: null,
      revisionNumber: { not: null },
    })
  })
})

describe('the hazard the filter exists for', () => {
  it('an UNFILTERED newest-first query returns the rejected row under Postgres ordering', async () => {
    db.rows = [committed('d1', 1), committed('d1', 2), rejected('d1')]
    const latest = await prisma.draftRevision.findFirst({
      where: { draftId: 'd1' },
      orderBy: { revisionNumber: 'desc' },
    })
    // Without the helper, "latest" is the rejected render and next = null+1.
    expect(latest?.revisionNumber).toBeNull()
  })
})

describe('nextRevisionNumber', () => {
  it('counts committed rows only — a rejected row consumes no number', async () => {
    db.rows = [committed('d1', 1), committed('d1', 2), rejected('d1'), rejected('d1')]
    expect(await nextRevisionNumber(prisma, 'd1')).toBe(3)
  })

  it('is 1 for a draft whose only rows are rejected', async () => {
    db.rows = [rejected('d1')]
    expect(await nextRevisionNumber(prisma, 'd1')).toBe(1)
  })

  it('ignores other drafts', async () => {
    db.rows = [committed('d1', 1), committed('d2', 7)]
    expect(await nextRevisionNumber(prisma, 'd1')).toBe(2)
  })

  it('excludes a row carrying rejectedAt even if it somehow has a number', async () => {
    // Impossible under the CHECK constraint; the filter still holds on its own.
    db.rows = [committed('d1', 1), { ...rejected('d1'), revisionNumber: 9 }]
    expect(await nextRevisionNumber(prisma, 'd1')).toBe(2)
  })
})

describe('withNextRevisionNumber', () => {
  it('hands the body the next COMMITTED number (contiguous chain)', async () => {
    db.rows = [committed('d1', 1), rejected('d1'), committed('d1', 2), rejected('d1')]
    const got = await withNextRevisionNumber('d1', async (_tx, n) => n)
    expect(got).toBe(3)
  })
})

describe('listCommittedRevisions (version-switch list)', () => {
  it('lists committed rows newest first and never the rejected render', async () => {
    const r = rejected('d1')
    db.rows = [committed('d1', 1), r, committed('d1', 2), committed('d2', 1)]
    const list = await listCommittedRevisions('d1')
    expect(list.map((x) => x.revisionNumber)).toEqual([2, 1])
    expect(list.some((x) => x.id === r.id)).toBe(false)
    expect(list.every((x) => typeof x.revisionNumber === 'number')).toBe(true)
  })

  it('selects only the listing fields (no htmlSnapshot)', async () => {
    db.rows = [committed('d1', 1)]
    const [row] = await listCommittedRevisions('d1')
    expect(Object.keys(row).sort()).toEqual([
      'createdAt',
      'exportUrl',
      'id',
      'instruction',
      'revisionNumber',
    ])
  })
})

describe('findCommittedRevision (restore / Undo target)', () => {
  it('returns the committed row with that number', async () => {
    db.rows = [committed('d1', 1), committed('d1', 2)]
    const row = await findCommittedRevision('d1', 2)
    expect(row?.instruction).toBe('v2')
  })

  it('never resolves to a rejected render — not at the would-be next number, not ever', async () => {
    db.rows = [committed('d1', 1), rejected('d1')]
    expect(await findCommittedRevision('d1', 2)).toBeNull()
    const corrupt = { ...rejected('d1'), revisionNumber: 5 }
    db.rows.push(corrupt)
    expect(await findCommittedRevision('d1', 5)).toBeNull()
  })

  it('does not cross drafts', async () => {
    db.rows = [committed('d2', 1)]
    expect(await findCommittedRevision('d1', 1)).toBeNull()
  })
})

describe('commitDraftRevision (refine + inline-edit writer)', () => {
  it('writes a committed row at the next committed number and points the draft at it', async () => {
    db.rows = [committed('d1', 1), rejected('d1')]
    const { exportKey } = await commitDraftRevision({
      draftId: 'd1',
      instruction: 'darker background',
      html: '<html>new</html>',
      width: 1080,
      height: 1080,
      exportKey: 'exports/new.png',
    })
    expect(exportKey).toBe('exports/new.png')
    const written = db.rows.find((r) => r.instruction === 'darker background')
    expect(written).toMatchObject({ revisionNumber: 2, rejectedAt: null })
    expect(db.draftUpdates).toHaveLength(1)
    expect(db.draftUpdates[0].data.currentRevisionNumber).toBe(2)
    expect(db.draftUpdates[0].data.htmlContent).toBe('<html>new</html>')
  })
})

// ── T17: the not-applied outcome and its rejected render ─────────────────────

function diagnostics(over: Partial<Omit<RejectionDiagnostics, 'export'>> = {}): Omit<RejectionDiagnostics, 'export'> {
  const attempt = (n: 1 | 2) => ({
    attempt: n,
    document: 'complete' as const,
    classes: ['remove' as const],
    classificationDefaulted: false,
    effectiveClasses: ['remove' as const],
    downgraded: [],
    supersedes: ['Join us for'],
    constrains: [],
    reconcile: { kind: 'clean' as const, missing: [] },
    verdict: 'miss' as const,
    reasons: ['remove: "Join us for" was neither removed nor shortened'],
    verifierCalls: 0,
  })
  return {
    version: 1,
    refineCalls: 2,
    verifierCalls: 0,
    attempts: [attempt(1), attempt(2)],
    reasons: ['remove: "Join us for" was neither removed nor shortened'],
    ...over,
  }
}

const rejectArgs = (over: Partial<Parameters<typeof recordRejectedRender>[0]> = {}) => ({
  draftId: 'd1',
  instruction: 'reduce the text',
  html: '<!DOCTYPE html><html><body>still long</body></html>',
  width: 1080,
  height: 1350,
  reason: 'The edit could not be applied: remove missed.',
  diagnostics: diagnostics(),
  ...over,
})

describe('recordRejectedRender (FR-12/13, Ruling D/E)', () => {
  it('writes ONE unnumbered rejected row with the render, diagnostics and export; the chain and pointer are untouched', async () => {
    db.rows = [committed('d1', 1), committed('d1', 2)]
    const { revisionId, exportKey } = await recordRejectedRender(rejectArgs())
    const row = db.rows.find((r) => r.id === revisionId)!
    expect(row).toMatchObject({
      revisionNumber: null,
      instruction: 'reduce the text',
      htmlSnapshot: '<!DOCTYPE html><html><body>still long</body></html>',
      exportUrl: exportKey,
    })
    expect(row.rejectedAt).toBeInstanceOf(Date)
    expect(exportKey).toBe('exports/refine-d1-test.png')
    expect(db.uploads).toEqual([exportKey])
    // Retrievable with its instruction, classes and the verifier's miss (AC-17).
    const rejection = rejectionDiagnosticsSchema.parse(row.rejection)
    expect(rejection.attempts[1].classes).toEqual(['remove'])
    expect(rejection.reasons[0]).toMatch(/neither removed nor shortened/)
    expect(rejection.export).toBe('stored')
    // The draft carries the outcome; nothing about the chain moved (AC-16).
    expect(db.draftUpdates).toHaveLength(1)
    expect(db.draftUpdates[0].data).toEqual({ notAppliedReason: 'The edit could not be applied: remove missed.', notAppliedRevisionId: revisionId })
    expect(db.rows.filter((r) => r.revisionNumber !== null)).toHaveLength(2)
    expect(await nextRevisionNumber(prisma, 'd1')).toBe(3)
  })

  it('with no usable document: records the row for diagnosis, no render, no export', async () => {
    const { revisionId, exportKey } = await recordRejectedRender(
      rejectArgs({ html: null, unusableHtml: '<!DOCTYPE html><html><body>cut off' }),
    )
    expect(exportKey).toBeNull()
    expect(db.render.calls).toBe(0)
    const row = db.rows.find((r) => r.id === revisionId)!
    expect(row.exportUrl).toBeNull()
    expect(row.htmlSnapshot).toBe('<!DOCTYPE html><html><body>cut off')
    expect(rejectionDiagnosticsSchema.parse(row.rejection).export).toBe('none')
  })

  it('a render failure does not mask the outcome: the row is recorded without an export', async () => {
    db.render.fail = true
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { revisionId, exportKey } = await recordRejectedRender(rejectArgs())
    expect(exportKey).toBeNull()
    expect(errors).toHaveBeenCalled()
    errors.mockRestore()
    const row = db.rows.find((r) => r.id === revisionId)!
    expect(rejectionDiagnosticsSchema.parse(row.rejection).export).toBe('render-failed')
    expect(db.notAppliedRevisionId).toBe(revisionId)
  })

  it('REPLACING an outcome stamps the previous rejected row discarded', async () => {
    const first = await recordRejectedRender(rejectArgs())
    const second = await recordRejectedRender(rejectArgs({ instruction: 'reduce it again' }))
    expect(db.rows.find((r) => r.id === first.revisionId)!.discardedAt).toBeInstanceOf(Date)
    expect(db.rows.find((r) => r.id === second.revisionId)!.discardedAt ?? null).toBeNull()
    expect(db.notAppliedRevisionId).toBe(second.revisionId)
  })

  it('caps the human-readable reason', async () => {
    await recordRejectedRender(rejectArgs({ reason: 'x'.repeat(5000) }))
    expect((db.draftUpdates[0].data.notAppliedReason as string).length).toBe(MAX_NOT_APPLIED_REASON)
  })

  it('refuses diagnostics beyond the hard caps (AC-15 is part of the schema)', async () => {
    await expect(recordRejectedRender(rejectArgs({ diagnostics: diagnostics({ refineCalls: 3 }) }))).rejects.toThrow()
    await expect(recordRejectedRender(rejectArgs({ diagnostics: diagnostics({ verifierCalls: 3 }) }))).rejects.toThrow()
  })
})

describe('commitDraftRevision clears the not-applied outcome', () => {
  it('nulls notApplied* and stamps the referenced rejected row discarded', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId: rejectedId } = await recordRejectedRender(rejectArgs())
    db.draftUpdates = []
    await commitDraftRevision({ draftId: 'd1', instruction: 'x', html: '<html/>', width: 1080, height: 1080, exportKey: 'k' })
    expect(db.draftUpdates[0].data).toMatchObject({ notAppliedReason: null, notAppliedRevisionId: null, currentRevisionNumber: 2 })
    expect(db.rows.find((r) => r.id === rejectedId)!.discardedAt).toBeInstanceOf(Date)
  })

  it('never stamps an adopted rejected row', async () => {
    const { revisionId: rejectedId } = await recordRejectedRender(rejectArgs())
    const row = db.rows.find((r) => r.id === rejectedId)!
    row.adoptedAt = new Date()
    await commitDraftRevision({ draftId: 'd1', instruction: 'x', html: '<html/>', width: 1080, height: 1080, exportKey: 'k' })
    expect(row.discardedAt ?? null).toBeNull()
  })
})
