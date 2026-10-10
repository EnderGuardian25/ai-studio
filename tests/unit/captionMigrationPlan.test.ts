import { describe, it, expect } from 'vitest'
import { planCaptionMigration, type CaptionMigrationPlan } from '@/lib/captions/migrationPlan'
import { CAPTION_CHANNELS } from '@/lib/channels'

// 012 FR-05 / AC-02.

const texts = (plan: CaptionMigrationPlan) =>
  Object.fromEntries(plan.rows.map((r) => [r.channel, r.text]))
const review = (plan: CaptionMigrationPlan) =>
  Object.fromEntries(plan.rows.map((r) => [r.channel, r.needsReview]))

function expectFallback(legacy: string) {
  const plan = planCaptionMigration(legacy)
  expect(plan.outcome).toBe('UNSPLIT_FALLBACK')
  expect(texts(plan)).toEqual({ INSTAGRAM: legacy.trim(), LINKEDIN: legacy.trim(), WHATSAPP: '' })
  expect(review(plan)).toEqual({ INSTAGRAM: true, LINKEDIN: true, WHATSAPP: false })
}

describe('planCaptionMigration — shape', () => {
  it('returns one READY row per registry channel, in registry order, for every outcome', () => {
    for (const legacy of ['', 'just text', 'INSTAGRAM:\na\nLINKEDIN:\nb']) {
      const plan = planCaptionMigration(legacy)
      expect(plan.rows.map((r) => r.channel)).toEqual(CAPTION_CHANNELS.map((s) => s.channel))
      expect(plan.rows.every((r) => r.status === 'READY')).toBe(true)
    }
  })
})

describe('planCaptionMigration — EMPTY (AC-02 e)', () => {
  it.each(['', '  \n ', '\t\r\n'])('%j → EMPTY with three empty rows and no review', (legacy) => {
    const plan = planCaptionMigration(legacy)
    expect(plan.outcome).toBe('EMPTY')
    expect(texts(plan)).toEqual({ INSTAGRAM: '', LINKEDIN: '', WHATSAPP: '' })
    expect(review(plan)).toEqual({ INSTAGRAM: false, LINKEDIN: false, WHATSAPP: false })
  })
})

describe('planCaptionMigration — SPLIT', () => {
  it('(a) splits bold-colon headers', () => {
    const plan = planCaptionMigration('**INSTAGRAM:** a\n\n**LINKEDIN:** b')
    expect(plan.outcome).toBe('SPLIT')
    expect(texts(plan)).toEqual({ INSTAGRAM: 'a', LINKEDIN: 'b', WHATSAPP: '' })
    expect(review(plan)).toEqual({ INSTAGRAM: false, LINKEDIN: false, WHATSAPP: false })
  })

  it.each([
    ['Instagram caption:', 'LinkedIn caption:'],
    ['### Instagram', '### LinkedIn'],
    ['INSTAGRAM POST:', 'LINKEDIN POST:'],
    ['ig:', 'linkedin:'],
    ['IG', 'Linked In'],
    ['**Instagram**:', '__LinkedIn__'],
    ['# **Instagram copy**', '###### __LINKED IN COPY:__'],
    ['  Instagram  ', '\tLinkedIn:\t'],
  ])('(b) %j / %j split', (ig, li) => {
    const plan = planCaptionMigration(`${ig}\nfirst line\nsecond line\n\n${li}\nother text`)
    expect(plan.outcome).toBe('SPLIT')
    expect(texts(plan)).toEqual({
      INSTAGRAM: 'first line\nsecond line',
      LINKEDIN: 'other text',
      WHATSAPP: '',
    })
  })

  it('(b) a body on the header line belongs to that section', () => {
    const plan = planCaptionMigration('ig: Hook line\nmore\nLinkedIn post: Excited to share')
    expect(plan.outcome).toBe('SPLIT')
    expect(texts(plan)).toEqual({
      INSTAGRAM: 'Hook line\nmore',
      LINKEDIN: 'Excited to share',
      WHATSAPP: '',
    })
  })

  it('splits a WhatsApp section in any order, and trims every section', () => {
    const plan = planCaptionMigration(
      '\n\n  \nLINKEDIN:\n\n  li text  \n\nWHATSAPP caption:\n wa text \nINSTAGRAM:\nig text\n\n',
    )
    expect(plan.outcome).toBe('SPLIT')
    expect(texts(plan)).toEqual({ INSTAGRAM: 'ig text', LINKEDIN: 'li text', WHATSAPP: 'wa text' })
    expect(plan.rows.every((r) => !r.needsReview)).toBe(true)
  })

  it('handles CRLF line endings', () => {
    const plan = planCaptionMigration('INSTAGRAM:\r\na\r\nb\r\nLINKEDIN:\r\nc')
    expect(plan.outcome).toBe('SPLIT')
    expect(texts(plan)).toMatchObject({ INSTAGRAM: 'a\nb', LINKEDIN: 'c' })
  })

  it('(d) split sections lose `**`; a WhatsApp section turns `**x**` into `*x*`', () => {
    const plan = planCaptionMigration(
      'INSTAGRAM:\n**Big** news\nLINKEDIN:\nWe are **hiring**\nWHATSAPP:\n**Apply** now',
    )
    expect(plan.outcome).toBe('SPLIT')
    expect(texts(plan)).toEqual({
      INSTAGRAM: 'Big news',
      LINKEDIN: 'We are hiring',
      WHATSAPP: '*Apply* now',
    })
  })

  it('stores an over-limit section as it is (the resolver refuses it later)', () => {
    const long = 'x'.repeat(2500)
    const plan = planCaptionMigration(`INSTAGRAM:\n${long}\nLINKEDIN:\nb`)
    expect(plan.outcome).toBe('SPLIT')
    expect(texts(plan).INSTAGRAM).toBe(long)
  })
})

describe('planCaptionMigration — lines that are NOT headers', () => {
  it.each([
    [
      'a sentence that starts with a channel name',
      'Instagram is where we start.\nLinkedIn is next.',
    ],
    ['a hashtag line (no space after #)', '#instagram\nhello\n#linkedin\nworld'],
    ['a word that begins with a channel name', 'IGNORE: this\nIGLOO\nLINKEDINFLUENCER:\nx'],
    ['an unclosed wrapper', '**INSTAGRAM:\na\n**LINKEDIN:\nb'],
    ['mismatched wrappers', '**INSTAGRAM__\na\n__LINKEDIN**\nb'],
    ['an unknown suffix', 'INSTAGRAM STORY:\na\nLINKEDIN ARTICLE:\nb'],
    ['a header that is not at the start of its line', 'For INSTAGRAM:\na\nFor LINKEDIN:\nb'],
    ['a channel the grammar does not name', 'FACEBOOK:\na\nTWITTER:\nb'],
    ['seven #s', '####### INSTAGRAM\na\n####### LINKEDIN\nb'],
  ])('%s → fallback, verbatim', (_label, legacy) => {
    expectFallback(legacy)
  })
})

describe('planCaptionMigration — UNSPLIT_FALLBACK', () => {
  it('(c) no headers → IG = LI = the text, both flagged for review, WA empty', () => {
    expectFallback('Applications are open! Join the Industry Readiness Programme. #IRP')
  })

  it('(c) trims only the ends, keeping inner whitespace', () => {
    const plan = planCaptionMigration('\n\n  line one\n\n   line two  \n')
    expect(texts(plan).INSTAGRAM).toBe('line one\n\n   line two')
  })

  it('(d) the fallback keeps `**` verbatim', () => {
    expectFallback('We are **hiring** — apply **today**')
    expect(texts(planCaptionMigration('**bold**')).LINKEDIN).toBe('**bold**')
  })

  it('(f) text before the first header → fallback', () => {
    expectFallback('Here are your captions:\nINSTAGRAM:\na\nLINKEDIN:\nb')
  })

  it('(g) a duplicated header → fallback', () => {
    expectFallback('INSTAGRAM:\na\nLINKEDIN:\nb\nINSTAGRAM:\nc')
    expectFallback('INSTAGRAM:\na\nLINKEDIN:\nb\nWHATSAPP:\nc\nWhatsApp:\nd')
  })

  it('(h) a header with an empty section → fallback', () => {
    expectFallback('INSTAGRAM:\n\nLINKEDIN:\nb')
    expectFallback('INSTAGRAM:\na\nLINKEDIN:\nb\nWHATSAPP:\n   ')
  })

  it('a section that is only `**` counts as empty → fallback', () => {
    expectFallback('INSTAGRAM:\n**\nLINKEDIN:\nb')
  })

  it('a missing Instagram or LinkedIn header → fallback', () => {
    expectFallback('INSTAGRAM:\na')
    expectFallback('LINKEDIN:\na\nWHATSAPP:\nb')
  })
})

// AC-02 (i). A seeded generator, so the case is deterministic: the same 300
// inputs every run, built to sit near the grammar's edges (headers, wrappers,
// `**`, blank lines, preambles).
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TOKENS = [
  'INSTAGRAM:',
  'LinkedIn',
  'ig:',
  'WHATSAPP caption:',
  '### Instagram',
  '**LINKEDIN:**',
  '__WhatsApp__',
  '**',
  '*',
  '__',
  '#',
  ':',
  ' ',
  '  ',
  '\t',
  '\n',
  '\n\n',
  '\r\n',
  'hello',
  'Apply now',
  '#IRP',
  'post',
  'caption',
  'x',
]

function generate(rand: () => number): string {
  const n = 1 + Math.floor(rand() * 12)
  let s = ''
  for (let i = 0; i < n; i++) s += TOKENS[Math.floor(rand() * TOKENS.length)]
  return s
}

describe('planCaptionMigration — never empty over real text (AC-02 i)', () => {
  it('over 300 seeded non-blank inputs, Instagram and LinkedIn are never blank', () => {
    const rand = mulberry32(0x012c)
    const seen = new Set<string>()
    let checked = 0
    while (checked < 300) {
      const legacy = generate(rand)
      if (!legacy.trim()) continue
      checked++
      const plan = planCaptionMigration(legacy)
      seen.add(plan.outcome)
      expect(plan.outcome, legacy).not.toBe('EMPTY')
      expect(texts(plan).INSTAGRAM.trim(), legacy).not.toBe('')
      expect(texts(plan).LINKEDIN.trim(), legacy).not.toBe('')
      expect(plan.rows).toHaveLength(CAPTION_CHANNELS.length)
    }
    // The generator reaches both non-empty outcomes, so the property is not
    // passing on fallbacks alone.
    expect(seen).toEqual(new Set(['SPLIT', 'UNSPLIT_FALLBACK']))
  })

  it('is deterministic for a fixed seed', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    for (let i = 0; i < 20; i++) expect(generate(a)).toBe(generate(b))
  })
})
