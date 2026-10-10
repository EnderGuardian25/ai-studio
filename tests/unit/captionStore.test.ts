// 012 T4 — the caption store (design §6): migrateDraft's transaction shape,
// the materializer's conditions and deferral, the generation write and the
// draft-level claim. Prisma is mocked; the planner is real.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  draftFindUnique: vi.fn(),
  draftFindMany: vi.fn(),
  draftUpdateMany: vi.fn(),
  captionFindMany: vi.fn(),
  captionCreateMany: vi.fn(),
  captionUpdateMany: vi.fn(),
  teamFindMany: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    draft: { findUnique: h.draftFindUnique, findMany: h.draftFindMany, updateMany: h.draftUpdateMany },
    draftCaption: {
      findMany: h.captionFindMany,
      createMany: h.captionCreateMany,
      updateMany: h.captionUpdateMany,
    },
    team: { findMany: h.teamFindMany },
    $transaction: h.transaction,
  },
}))

const {
  captionRowsFromFields,
  claimCaptionAction,
  loadDraftCaptions,
  materializeStep,
  migrateDraft,
  saveGenerationCaptions,
} = await import('@/lib/captions/store')

const T = new Date('2026-10-11T00:00:00Z')
const row = (channel: string, text = '', status = 'READY') => ({
  channel,
  text,
  status,
  failureReason: null,
  needsReview: false,
  updatedAt: T,
})

function legacyDraft(over: Record<string, unknown> = {}) {
  return {
    status: 'EXPORTED',
    pendingAction: null,
    captionMigration: null,
    copyText: 'INSTAGRAM:\nig text\nLINKEDIN:\nli text',
    updatedAt: T,
    captions: [],
    ...over,
  }
}

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset()
  // Batch form: each op is the value its builder returned.
  h.transaction.mockImplementation(async (ops: unknown) =>
    typeof ops === 'function' ? ops({ draft: { updateMany: h.draftUpdateMany }, draftCaption: { updateMany: h.captionUpdateMany } }) : Promise.all(ops as unknown[]),
  )
  h.captionCreateMany.mockResolvedValue({ count: 3 })
  h.draftUpdateMany.mockResolvedValue({ count: 1 })
  h.captionUpdateMany.mockResolvedValue({ count: 1 })
  h.draftFindMany.mockResolvedValue([])
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('migrateDraft — transaction shape', () => {
  it('issues createMany(skipDuplicates) then the update guarded on captionMigration null, in ONE batch', async () => {
    const createOp = Promise.resolve({ count: 3 })
    const updateOp = Promise.resolve({ count: 1 })
    h.captionCreateMany.mockReturnValue(createOp)
    h.draftUpdateMany.mockReturnValue(updateOp)

    const result = await migrateDraft('d1', 'INSTAGRAM:\nig text\nLINKEDIN:\nli text')

    expect(h.transaction).toHaveBeenCalledTimes(1)
    const ops = h.transaction.mock.calls[0][0]
    expect(ops).toEqual([createOp, updateOp])
    expect(ops[0]).toBe(createOp)
    expect(ops[1]).toBe(updateOp)

    expect(h.captionCreateMany).toHaveBeenCalledWith({
      data: [
        { draftId: 'd1', channel: 'INSTAGRAM', text: 'ig text', status: 'READY', needsReview: false },
        { draftId: 'd1', channel: 'LINKEDIN', text: 'li text', status: 'READY', needsReview: false },
        { draftId: 'd1', channel: 'WHATSAPP', text: '', status: 'READY', needsReview: false },
      ],
      skipDuplicates: true,
    })
    expect(h.draftUpdateMany).toHaveBeenCalledWith({
      where: { id: 'd1', captionMigration: null },
      data: { captionMigration: 'SPLIT' },
    })
    expect(result).toEqual({ outcome: 'SPLIT', written: true })
  })

  it('reports written=false when another writer already recorded the outcome', async () => {
    h.draftUpdateMany.mockResolvedValue({ count: 0 })
    expect(await migrateDraft('d1', 'just one caption')).toEqual({
      outcome: 'UNSPLIT_FALLBACK',
      written: false,
    })
  })

  it('runs on the client it is given', async () => {
    const db = {
      draftCaption: { createMany: vi.fn().mockResolvedValue({ count: 3 }) },
      draft: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
    }
    await migrateDraft('d1', '', db as never)
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(h.transaction).not.toHaveBeenCalled()
  })
})

describe('materializeStep', () => {
  const base = {
    rowCount: 0,
    legacyText: 'text',
    captionMigration: null,
    status: 'EXPORTED',
    pendingAction: null,
  } as const

  it('migrates only with no rows, a legacy text and no recorded outcome', () => {
    expect(materializeStep(base)).toBe('migrate')
    expect(materializeStep({ ...base, legacyText: '' })).toBe('migrate')
    expect(materializeStep({ ...base, rowCount: 1 })).toBeNull()
    expect(materializeStep({ ...base, legacyText: null })).toBeNull()
    expect(materializeStep({ ...base, captionMigration: 'SPLIT' })).toBeNull()
  })

  it('defers while generating or while a caption regenerate is in flight', () => {
    expect(materializeStep({ ...base, status: 'IN_PROGRESS' })).toBe('defer')
    expect(materializeStep({ ...base, pendingAction: 'REGENERATE_COPY' })).toBe('defer')
    expect(materializeStep({ ...base, pendingAction: 'REGENERATE_DESIGN' })).toBe('migrate')
    expect(materializeStep({ ...base, pendingAction: 'REFINE' })).toBe('migrate')
    expect(materializeStep({ ...base, status: 'FAILED' })).toBe('migrate')
  })
})

describe('loadDraftCaptions — the materializer', () => {
  it('returns null for an unknown draft', async () => {
    h.draftFindUnique.mockResolvedValue(null)
    expect(await loadDraftCaptions('nope')).toBeNull()
  })

  it('migrates a legacy draft, then returns the stored rows in registry order', async () => {
    h.draftFindUnique.mockResolvedValue(legacyDraft())
    h.captionFindMany.mockResolvedValue([
      row('WHATSAPP'),
      row('LINKEDIN', 'li text'),
      row('INSTAGRAM', 'ig text'),
    ])

    const result = await loadDraftCaptions('d1')

    expect(h.transaction).toHaveBeenCalledTimes(1)
    expect(h.captionCreateMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }))
    expect(result).toEqual({
      deferred: false,
      captions: [row('INSTAGRAM', 'ig text'), row('LINKEDIN', 'li text'), row('WHATSAPP')],
    })
  })

  it('logs the REVIEW line for a fallback it migrated', async () => {
    h.draftFindUnique.mockResolvedValue(legacyDraft({ copyText: 'one caption for all' }))
    h.captionFindMany.mockResolvedValue([row('INSTAGRAM'), row('LINKEDIN'), row('WHATSAPP')])
    h.draftFindMany.mockResolvedValue([
      {
        id: 'd1',
        teamId: 't1',
        brief: { topic: 'Launch' },
        posts: [{ channel: 'INSTAGRAM', scheduledAt: new Date('2026-10-12T09:00:00Z') }],
      },
    ])
    h.teamFindMany.mockResolvedValue([{ id: 't1', name: 'Bistec' }])

    await loadDraftCaptions('d1')

    expect(h.draftFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'd1', captionMigration: 'UNSPLIT_FALLBACK' }),
      }),
    )
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/^\[captions\] REVIEW draft d1 — team "Bistec", topic "Launch".*INSTAGRAM at 2026-10-12T09:00:00\.000Z/),
    )
  })

  it.each([
    ['IN_PROGRESS', null],
    ['EXPORTED', 'REGENERATE_COPY'],
  ])('defers (status %s, pendingAction %s): three synthesized PENDING rows, nothing written', async (status, pendingAction) => {
    h.draftFindUnique.mockResolvedValue(legacyDraft({ status, pendingAction }))

    const result = await loadDraftCaptions('d1')

    expect(result?.deferred).toBe(true)
    expect(result?.captions.map((c) => [c.channel, c.status, c.text])).toEqual([
      ['INSTAGRAM', 'PENDING', ''],
      ['LINKEDIN', 'PENDING', ''],
      ['WHATSAPP', 'PENDING', ''],
    ])
    expect(h.transaction).not.toHaveBeenCalled()
    expect(h.captionCreateMany).not.toHaveBeenCalled()
    expect(h.draftUpdateMany).not.toHaveBeenCalled()
  })

  it('never migrates a draft that already has rows', async () => {
    h.draftFindUnique.mockResolvedValue(
      legacyDraft({
        copyText: '',
        captions: [row('LINKEDIN', 'b'), row('INSTAGRAM', 'a'), row('WHATSAPP', 'c')],
      }),
    )
    const result = await loadDraftCaptions('d1')
    expect(h.transaction).not.toHaveBeenCalled()
    expect(h.captionCreateMany).not.toHaveBeenCalled()
    expect(result?.captions.map((c) => c.text)).toEqual(['a', 'b', 'c'])
  })

  it('never re-migrates a draft with a recorded outcome; a missing channel gets an empty READY row', async () => {
    h.draftFindUnique.mockResolvedValue(
      legacyDraft({ captionMigration: 'SPLIT', captions: [row('INSTAGRAM', 'a'), row('LINKEDIN', 'b')] }),
    )
    h.captionFindMany.mockResolvedValue([row('INSTAGRAM', 'a'), row('LINKEDIN', 'b'), row('WHATSAPP')])

    const result = await loadDraftCaptions('d1')

    expect(h.transaction).not.toHaveBeenCalled()
    expect(h.draftUpdateMany).not.toHaveBeenCalled()
    expect(h.captionCreateMany).toHaveBeenCalledWith({
      data: [{ draftId: 'd1', channel: 'WHATSAPP', text: '', status: 'READY' }],
      skipDuplicates: true,
    })
    expect(result?.captions).toHaveLength(3)
  })
})

describe('saveGenerationCaptions', () => {
  it('writes READY text / FAILED-without-text per channel, guarded on PENDING, and the headline only when valid', async () => {
    await saveGenerationCaptions('d1', {
      INSTAGRAM: { ok: true, text: 'ig' },
      LINKEDIN: { ok: false, reason: 'empty' },
      WHATSAPP: { ok: true, text: 'wa' },
      HEADLINE: { ok: false, reason: 'missing' },
    })

    expect(h.transaction).toHaveBeenCalledTimes(1)
    expect(h.captionUpdateMany.mock.calls.map((c) => c[0])).toEqual([
      {
        where: { draftId: 'd1', channel: 'INSTAGRAM', status: 'PENDING' },
        data: { text: 'ig', status: 'READY', failureReason: null, needsReview: false },
      },
      {
        where: { draftId: 'd1', channel: 'LINKEDIN', status: 'PENDING' },
        data: { text: '', status: 'FAILED', failureReason: 'empty', needsReview: false },
      },
      {
        where: { draftId: 'd1', channel: 'WHATSAPP', status: 'PENDING' },
        data: { text: 'wa', status: 'READY', failureReason: null, needsReview: false },
      },
    ])
    expect(h.draftUpdateMany).not.toHaveBeenCalled()

    h.captionUpdateMany.mockClear()
    await saveGenerationCaptions('d1', { HEADLINE: { ok: true, text: 'Big launch' } })
    expect(h.captionUpdateMany).not.toHaveBeenCalled()
    expect(h.draftUpdateMany).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { headline: 'Big launch' } })
  })

  it('captionRowsFromFields covers only the channels it was given', () => {
    expect(captionRowsFromFields({ LINKEDIN: { ok: true, text: 'x' } })).toEqual([
      { channel: 'LINKEDIN', text: 'x', status: 'READY', failureReason: null },
    ])
  })
})

describe('claimCaptionAction', () => {
  it('claims REGENERATE_COPY guarded on null and marks only the target channels PENDING', async () => {
    expect(await claimCaptionAction('d1', ['WHATSAPP', 'HEADLINE'])).toBe(true)
    expect(h.draftUpdateMany).toHaveBeenCalledWith({
      where: { id: 'd1', pendingAction: null },
      data: { pendingAction: 'REGENERATE_COPY' },
    })
    expect(h.captionUpdateMany).toHaveBeenCalledWith({
      where: { draftId: 'd1', channel: { in: ['WHATSAPP'] } },
      data: { status: 'PENDING' },
    })
  })

  it('touches no row when another action holds the draft', async () => {
    h.draftUpdateMany.mockResolvedValue({ count: 0 })
    expect(await claimCaptionAction('d1', ['INSTAGRAM'])).toBe(false)
    expect(h.captionUpdateMany).not.toHaveBeenCalled()
  })

  it('a headline-only claim marks no row', async () => {
    expect(await claimCaptionAction('d1', ['HEADLINE'])).toBe(true)
    expect(h.captionUpdateMany).not.toHaveBeenCalled()
  })
})
