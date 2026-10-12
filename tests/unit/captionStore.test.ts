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
  saveCaptionEdit,
  saveGenerationCaptions,
  saveHeadlineEdit,
  settleCaptionAction,
  settlePendingCaptions,
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
    legacyCaptionText: 'INSTAGRAM:\nig text\nLINKEDIN:\nli text',
    updatedAt: T,
    captions: [],
    ...over,
  }
}

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset()
  // Batch form: each op is the value its builder returned.
  h.transaction.mockImplementation(async (ops: unknown) =>
    typeof ops === 'function' ? ops({ draft: { updateMany: h.draftUpdateMany }, draftCaption: { findMany: h.captionFindMany, updateMany: h.captionUpdateMany } }) : Promise.all(ops as unknown[]),
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
      // The outcome this read just recorded, not the stale null it loaded.
      captionMigration: 'SPLIT',
      captions: [row('INSTAGRAM', 'ig text'), row('LINKEDIN', 'li text'), row('WHATSAPP')],
    })
  })

  it('logs the REVIEW line for a fallback it migrated', async () => {
    h.draftFindUnique.mockResolvedValue(legacyDraft({ legacyCaptionText: 'one caption for all' }))
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
    expect(result?.captionMigration).toBeNull()
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
        legacyCaptionText: '',
        captions: [row('LINKEDIN', 'b'), row('INSTAGRAM', 'a'), row('WHATSAPP', 'c')],
      }),
    )
    const result = await loadDraftCaptions('d1')
    expect(h.transaction).not.toHaveBeenCalled()
    expect(h.captionCreateMany).not.toHaveBeenCalled()
    expect(result?.captions.map((c) => c.text)).toEqual(['a', 'b', 'c'])
    expect(result?.captionMigration).toBeNull()
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
  // 008 FR-08: the model that wrote the reply, and the value it substituted.
  const STAMP = { model: 'claude-haiku-4-5', substitutedFrom: 'OPUS' }

  it('writes READY text / FAILED-without-text per channel, guarded on PENDING, and the headline only when valid', async () => {
    await saveGenerationCaptions(
      'd1',
      {
        INSTAGRAM: { ok: true, text: 'ig' },
        LINKEDIN: { ok: false, reason: 'empty' },
        WHATSAPP: { ok: true, text: 'wa' },
        HEADLINE: { ok: false, reason: 'missing' },
      },
      STAMP,
    )

    expect(h.transaction).toHaveBeenCalledTimes(1)
    // AC-07: the stamp lands on the ok rows only; the failed row has no text,
    // so it names no model.
    expect(h.captionUpdateMany.mock.calls.map((c) => c[0])).toEqual([
      {
        where: { draftId: 'd1', channel: 'INSTAGRAM', status: 'PENDING' },
        data: {
          text: 'ig',
          status: 'READY',
          failureReason: null,
          model: 'claude-haiku-4-5',
          modelSubstitutedFrom: 'OPUS',
          needsReview: false,
        },
      },
      {
        where: { draftId: 'd1', channel: 'LINKEDIN', status: 'PENDING' },
        data: {
          text: '',
          status: 'FAILED',
          failureReason: 'empty',
          model: null,
          modelSubstitutedFrom: null,
          needsReview: false,
        },
      },
      {
        where: { draftId: 'd1', channel: 'WHATSAPP', status: 'PENDING' },
        data: {
          text: 'wa',
          status: 'READY',
          failureReason: null,
          model: 'claude-haiku-4-5',
          modelSubstitutedFrom: 'OPUS',
          needsReview: false,
        },
      },
    ])
    // A failed headline writes neither the headline nor its stamp.
    expect(h.draftUpdateMany).not.toHaveBeenCalled()

    h.captionUpdateMany.mockClear()
    await saveGenerationCaptions('d1', { HEADLINE: { ok: true, text: 'Big launch' } }, STAMP)
    expect(h.captionUpdateMany).not.toHaveBeenCalled()
    expect(h.draftUpdateMany).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { headline: 'Big launch', headlineModel: 'claude-haiku-4-5', headlineModelSubstitutedFrom: 'OPUS' },
    })
  })

  it('captionRowsFromFields covers only the channels it was given, stamping the ok ones', () => {
    expect(captionRowsFromFields({ LINKEDIN: { ok: true, text: 'x' } }, STAMP)).toEqual([
      {
        channel: 'LINKEDIN',
        text: 'x',
        status: 'READY',
        failureReason: null,
        model: 'claude-haiku-4-5',
        modelSubstitutedFrom: 'OPUS',
      },
    ])
    expect(captionRowsFromFields({ WHATSAPP: { ok: false, reason: 'missing' } }, STAMP)).toEqual([
      { channel: 'WHATSAPP', text: '', status: 'FAILED', failureReason: 'missing', model: null, modelSubstitutedFrom: null },
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

// T6 review NOTE 3: the claim takes the same db injection as the store's
// other functions.
describe('claimCaptionAction — db injection', () => {
  it('runs on the injected client, not the global one', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 })
    const db = { $transaction: (fn: (tx: unknown) => unknown) => fn({ draft: { updateMany }, draftCaption: { updateMany } }) }
    expect(await claimCaptionAction('d1', ['INSTAGRAM'], db as never)).toBe(true)
    expect(updateMany).toHaveBeenCalledTimes(2)
    expect(h.transaction).not.toHaveBeenCalled()
  })
})

describe('settleCaptionAction (FR-11, design §5)', () => {
  it('settles only the PENDING target rows, each write guarded on PENDING, per settleCaptionRow', async () => {
    h.captionFindMany.mockResolvedValue([
      { channel: 'INSTAGRAM', text: 'old ig' },
      { channel: 'LINKEDIN', text: '' },
      { channel: 'WHATSAPP', text: 'old wa' },
    ])
    await settleCaptionAction('d1', ['INSTAGRAM', 'LINKEDIN', 'WHATSAPP'], {
      INSTAGRAM: { ok: true, text: 'new ig' },
      LINKEDIN: { ok: false, reason: 'missing' },
      WHATSAPP: { ok: false, reason: 'empty' },
    })

    expect(h.captionFindMany).toHaveBeenCalledWith({
      where: { draftId: 'd1', status: 'PENDING', channel: { in: ['INSTAGRAM', 'LINKEDIN', 'WHATSAPP'] } },
      select: { channel: true, text: true },
    })
    expect(h.captionUpdateMany.mock.calls.map(([a]) => a)).toEqual([
      {
        where: { draftId: 'd1', channel: 'INSTAGRAM', status: 'PENDING' },
        data: { status: 'READY', text: 'new ig', failureReason: null, needsReview: false },
      },
      {
        where: { draftId: 'd1', channel: 'LINKEDIN', status: 'PENDING' },
        data: { status: 'FAILED', text: '', failureReason: 'missing' },
      },
      {
        // A7: good text survives a failed regenerate.
        where: { draftId: 'd1', channel: 'WHATSAPP', status: 'PENDING' },
        data: { status: 'READY', text: 'old wa', failureReason: 'Regenerate failed: empty' },
      },
    ])
    // No headline was requested.
    expect(h.draftUpdateMany).not.toHaveBeenCalled()
  })

  it('writes a validated headline, guarded on the caption claim; a failed one changes nothing', async () => {
    h.captionFindMany.mockResolvedValue([])
    await settleCaptionAction('d1', ['HEADLINE'], { HEADLINE: { ok: true, text: 'New line' } })
    expect(h.draftUpdateMany).toHaveBeenCalledWith({
      where: { id: 'd1', pendingAction: 'REGENERATE_COPY' },
      data: { headline: 'New line' },
    })

    h.draftUpdateMany.mockClear()
    await settleCaptionAction('d1', ['HEADLINE'], { HEADLINE: { ok: false, reason: 'empty' } })
    expect(h.draftUpdateMany).not.toHaveBeenCalled()
  })

  it('never writes a headline that was not requested, even if the reply carried one', async () => {
    h.captionFindMany.mockResolvedValue([])
    await settleCaptionAction('d1', ['INSTAGRAM'], { HEADLINE: { ok: true, text: 'Sneaky' } })
    expect(h.draftUpdateMany).not.toHaveBeenCalled()
  })
})

describe('settlePendingCaptions (the stale sweep)', () => {
  it('settles every PENDING row of the draft as failed with the sweep reason, keeping text', async () => {
    h.captionFindMany.mockResolvedValue([
      { channel: 'INSTAGRAM', text: 'kept' },
      { channel: 'LINKEDIN', text: '' },
    ])
    await settlePendingCaptions('d1', 'Generation was interrupted. Please retry.')
    expect(h.captionFindMany).toHaveBeenCalledWith({
      where: { draftId: 'd1', status: 'PENDING' },
      select: { channel: true, text: true },
    })
    expect(h.captionUpdateMany.mock.calls.map(([a]) => a.data)).toEqual([
      { status: 'READY', text: 'kept', failureReason: 'Regenerate failed: Generation was interrupted. Please retry.' },
      { status: 'FAILED', text: '', failureReason: 'Generation was interrupted. Please retry.' },
    ])
  })
})

describe('saveCaptionEdit / saveHeadlineEdit (FR-12)', () => {
  it('stores the text exactly as typed, READY, flags cleared, refused on a PENDING row', async () => {
    expect(await saveCaptionEdit('d1', 'LINKEDIN', '  **as typed**  ')).toBe(true)
    expect(h.captionUpdateMany).toHaveBeenCalledWith({
      where: { draftId: 'd1', channel: 'LINKEDIN', status: { not: 'PENDING' } },
      data: { text: '  **as typed**  ', status: 'READY', failureReason: null, needsReview: false },
    })
    h.captionUpdateMany.mockResolvedValue({ count: 0 })
    expect(await saveCaptionEdit('d1', 'LINKEDIN', 'x')).toBe(false)
  })

  it('saves the headline only while no caption action or generation may be writing it', async () => {
    expect(await saveHeadlineEdit('d1', 'Line')).toBe(true)
    expect(h.draftUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'd1',
        status: { not: 'IN_PROGRESS' },
        OR: [{ pendingAction: null }, { pendingAction: { not: 'REGENERATE_COPY' } }],
      },
      data: { headline: 'Line' },
    })
    h.draftUpdateMany.mockResolvedValue({ count: 0 })
    expect(await saveHeadlineEdit('d1', 'Line')).toBe(false)
  })
})

// ── 008 T7 (FR-08, AC-07): the caption action's stamp writes ─────────────────

describe('008 FR-08: settleCaptionAction stamps validated fields only', () => {
  const STAMP = { model: 'claude-sonnet-5-5', substitutedFrom: 'claude-opus-5-5' }
  const STAMP_FIELDS = ['model', 'modelSubstitutedFrom', 'headlineModel', 'headlineModelSubstitutedFrom']

  it('an ok field gets the new stamp; a failed field writes no stamp field, so the row keeps its own', async () => {
    h.captionFindMany.mockResolvedValue([
      { channel: 'INSTAGRAM', text: 'old ig' },
      { channel: 'LINKEDIN', text: '' },
      { channel: 'WHATSAPP', text: 'old wa' },
    ])
    await settleCaptionAction(
      'd1',
      ['INSTAGRAM', 'LINKEDIN', 'WHATSAPP'],
      {
        INSTAGRAM: { ok: true, text: 'new ig' },
        LINKEDIN: { ok: false, reason: 'missing' },
        WHATSAPP: { ok: false, reason: 'empty' },
      },
      STAMP,
    )
    const data = h.captionUpdateMany.mock.calls.map(([a]) => a.data)
    expect(data[0]).toEqual({
      status: 'READY',
      text: 'new ig',
      failureReason: null,
      needsReview: false,
      model: 'claude-sonnet-5-5',
      modelSubstitutedFrom: 'claude-opus-5-5',
    })
    // The FAILED (no text) and the kept-text rows: no stamp key at all.
    for (const d of data.slice(1)) for (const k of STAMP_FIELDS) expect(d).not.toHaveProperty(k)
    expect(data[2]).toEqual({ status: 'READY', text: 'old wa', failureReason: 'Regenerate failed: empty' })
  })

  it('a validated headline writes headlineModel in the same claim-guarded update; a failed one writes nothing', async () => {
    h.captionFindMany.mockResolvedValue([])
    await settleCaptionAction('d1', ['HEADLINE'], { HEADLINE: { ok: true, text: 'New line' } }, STAMP)
    expect(h.draftUpdateMany).toHaveBeenCalledWith({
      where: { id: 'd1', pendingAction: 'REGENERATE_COPY' },
      data: {
        headline: 'New line',
        headlineModel: 'claude-sonnet-5-5',
        headlineModelSubstitutedFrom: 'claude-opus-5-5',
      },
    })
    h.draftUpdateMany.mockClear()
    await settleCaptionAction('d1', ['HEADLINE'], { HEADLINE: { ok: false, reason: 'empty' } }, STAMP)
    expect(h.draftUpdateMany).not.toHaveBeenCalled()
  })

  it('the failure settles (no stamp: onError, an unstarted run) and the stale sweep never write a stamp field', async () => {
    h.captionFindMany.mockResolvedValue([
      { channel: 'INSTAGRAM', text: 'kept' },
      { channel: 'LINKEDIN', text: '' },
    ])
    await settleCaptionAction('d1', ['INSTAGRAM', 'LINKEDIN'], {
      INSTAGRAM: { ok: false, reason: 'boom' },
      LINKEDIN: { ok: false, reason: 'boom' },
    })
    await settlePendingCaptions('d1', 'Generation was interrupted. Please retry.')
    expect(h.captionUpdateMany).toHaveBeenCalledTimes(4)
    for (const [a] of h.captionUpdateMany.mock.calls) {
      for (const k of STAMP_FIELDS) expect(a.data).not.toHaveProperty(k)
    }
  })

  it('without a stamp, even an ok field writes no stamp field (the pre-008 shape)', async () => {
    h.captionFindMany.mockResolvedValue([{ channel: 'INSTAGRAM', text: 'x' }])
    await settleCaptionAction('d1', ['INSTAGRAM'], { INSTAGRAM: { ok: true, text: 'y' } })
    expect(h.captionUpdateMany.mock.calls[0][0].data).not.toHaveProperty('model')
  })
})

describe('008 A6: a user edit writes no stamp field', () => {
  const STAMP_FIELDS = ['model', 'modelSubstitutedFrom', 'headlineModel', 'headlineModelSubstitutedFrom']

  it('saveCaptionEdit and saveHeadlineEdit leave every stamp column untouched', async () => {
    await saveCaptionEdit('d1', 'LINKEDIN', 'typed')
    await saveHeadlineEdit('d1', 'typed')
    const writes = [...h.captionUpdateMany.mock.calls, ...h.draftUpdateMany.mock.calls].map(([a]) => a.data)
    expect(writes).toHaveLength(2)
    for (const d of writes) for (const k of STAMP_FIELDS) expect(d).not.toHaveProperty(k)
  })
})

describe('008 FR-09: loadDraftCaptions exposes each row stamp', () => {
  it('selects model and modelSubstitutedFrom with the row (the regenerate stamp tier reads them)', async () => {
    h.draftFindUnique.mockResolvedValue({
      status: 'EXPORTED',
      pendingAction: null,
      captionMigration: null,
      legacyCaptionText: null,
      updatedAt: T,
      captions: ['INSTAGRAM', 'LINKEDIN', 'WHATSAPP'].map((c) => ({
        ...row(c, 't'),
        model: c === 'LINKEDIN' ? 'claude-opus-5-5' : null,
        modelSubstitutedFrom: null,
      })),
    })
    const loaded = await loadDraftCaptions('d1')
    const select = h.draftFindUnique.mock.calls[0][0].select.captions.select
    expect(select).toMatchObject({ model: true, modelSubstitutedFrom: true })
    expect(loaded!.captions.map((c) => c.model)).toEqual([null, 'claude-opus-5-5', null])
  })

  it('a deferred legacy draft synthesizes rows with null stamps', async () => {
    h.draftFindUnique.mockResolvedValue(legacyDraft({ status: 'IN_PROGRESS' }))
    const loaded = await loadDraftCaptions('d1')
    expect(loaded!.deferred).toBe(true)
    for (const c of loaded!.captions) expect(c).toMatchObject({ model: null, modelSubstitutedFrom: null })
  })
})
