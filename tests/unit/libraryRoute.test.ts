// 037 FR-06, D10: GET /api/library lists EXPORTED drafts only, takes no status
// param, and filters by brandKitId and postStyle. An unknown postStyle is 400.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn() }))

vi.mock('@/lib/prisma', () => ({ prisma: { draft: { findMany: h.findMany, count: h.count } } }))
vi.mock('@/lib/api/handler', () => ({
  withTeamAuth:
    (handler: (req: unknown, ctx: unknown, user: unknown) => unknown) =>
    (req: unknown) =>
      handler(req, {}, { userId: 'u1', teamId: 'team1', teamRole: 'ADMIN', isSuperAdmin: false }),
}))
vi.mock('@/lib/authz/visibility', () => ({ draftVisibilityWhere: () => ({ VISIBILITY: true }) }))
vi.mock('@/lib/storage/minio', () => ({ resolveExportUrl: async (k: string | null) => k }))

const { GET } = await import('@/app/api/library/route')
const { activeStyles } = await import('@/lib/postStyles')

async function call(query = '') {
  return (await GET(new Request(`http://test/api/library${query}`) as never, {} as never)) as Response
}

beforeEach(() => {
  h.findMany.mockReset().mockResolvedValue([])
  h.count.mockReset().mockResolvedValue(0)
})

describe('GET /api/library (037)', () => {
  it('always lists EXPORTED drafts and ignores a status param', async () => {
    const res = await call('?status=PUBLISHED')
    expect(res.status).toBe(200)
    const where = h.findMany.mock.calls[0][0].where
    expect(where.status).toBe('EXPORTED')
    expect(where.OR).toBeUndefined()
    expect(where.posts).toBeUndefined()
    expect(JSON.stringify(where)).not.toContain('PUBLISHED')
  })

  it('answers 400 for an unknown postStyle and queries nothing', async () => {
    const res = await call('?postStyle=not-a-style')
    expect(res.status).toBe(400)
    expect(h.findMany).not.toHaveBeenCalled()
  })

  it('filters by a known postStyle', async () => {
    const key = activeStyles()[0].key
    expect((await call(`?postStyle=${key}`)).status).toBe(200)
    expect(h.findMany.mock.calls[0][0].where.AND).toContainEqual({ brief: { postStyle: key } })
  })

  it('filters by kit: the brief kit, else the campaign kit when the brief has none', async () => {
    await call('?brandKitId=kit1')
    expect(h.findMany.mock.calls[0][0].where.AND).toContainEqual({
      OR: [{ brief: { brandKitId: 'kit1' } }, { brief: { brandKitId: null, campaign: { brandKitId: 'kit1' } } }],
    })
  })

  it('keeps the D6 visibility clause ANDed with the filters', async () => {
    await call(`?brandKitId=kit1&postStyle=${activeStyles()[0].key}&search=x`)
    const and = h.findMany.mock.calls[0][0].where.AND
    expect(and).toContainEqual({ VISIBILITY: true })
    expect(and).toHaveLength(4)
    expect(h.count.mock.calls[0][0].where.AND).toEqual(and)
  })

  it('adds no kit or style clause without the params', async () => {
    await call()
    expect(h.findMany.mock.calls[0][0].where.AND).toEqual([{ VISIBILITY: true }])
  })

  it('returns kit name (explicit kit first, then campaign kit) and the post style', async () => {
    const base = { id: 'd', status: 'EXPORTED', exportUrl: 'k', createdAt: new Date(), headline: null, renderedText: null }
    h.findMany.mockResolvedValue([
      { ...base, id: 'a', brief: { topic: 'T', aspectRatio: 'SQUARE', postStyle: 'launch', brandKit: { name: 'Own' }, campaign: { brandKit: { name: 'Camp' } } } },
      { ...base, id: 'b', brief: { topic: 'T', aspectRatio: 'SQUARE', postStyle: null, brandKit: null, campaign: { brandKit: { name: 'Camp' } } } },
    ])
    const body = (await (await call()).json()) as { drafts: Array<{ brief: Record<string, unknown> }> }
    expect(body.drafts[0].brief).toMatchObject({ brandKitName: 'Own', postStyle: 'launch' })
    expect(body.drafts[1].brief).toMatchObject({ brandKitName: 'Camp', postStyle: null })
  })
})
