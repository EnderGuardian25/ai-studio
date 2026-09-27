import { describe, it, expect } from 'vitest'
import {
  INSTRUCTION_CLASSES,
  INSTRUCTION_CLASS_KEYS,
  renderClassSemantics,
  type DomElementFact,
  type DomFacts,
  type InstructionClass,
  type PostConditionInput,
} from '@/lib/agent/instructionClasses'

// ── Hand-built facts ──────────────────────────────────────────────────────────

function el(partial: Partial<DomElementFact> & { tag: string }): DomElementFact {
  return {
    id: null,
    classes: [],
    text: '',
    imageSources: [],
    fontSizePx: null,
    box: null,
    ...partial,
  }
}

// Builds DomFacts from an element list the way T14's extractor will: document
// text + image sources aggregated from the elements, elementCount given
// separately (it counts every rendered element, not only the listed ones).
function facts(elements: DomElementFact[], opts: { text?: string; elementCount?: number } = {}): DomFacts {
  return {
    text: opts.text ?? elements.map((e) => e.text).filter(Boolean).join(' '),
    imageSources: elements.flatMap((e) => e.imageSources),
    elementCount: opts.elementCount ?? elements.length,
    elements,
  }
}

const OLD_BG = 'http://minio.local/images/generated/old-bg.png'
const UPLOAD = 'http://minio.local/images/briefs/u1/upload.jpg'
const LOGO = 'http://minio.local/brand-kits/k1/logo.png'
const LONG_BODY =
  'Join us for an unforgettable evening of ideas, networking and hands-on workshops led by industry experts from across the region.'
const SHORT_BODY = 'Join us for an evening of ideas and workshops.'

const headline = (fontSizePx = 96, text = 'INDUSTRY READINESS PROGRAMME') =>
  el({ tag: 'h1', id: 'headline', classes: ['title'], text, fontSizePx, box: { width: 900, height: 200 } })
const body = (text = LONG_BODY) => el({ tag: 'p', classes: ['body-copy'], text, fontSizePx: 32, box: { width: 900, height: 160 } })
const logo = () => el({ tag: 'img', classes: ['logo'], imageSources: [LOGO], box: { width: 200, height: 80 } })
const bgLayer = (src = OLD_BG) => el({ tag: 'div', classes: ['bg'], imageSources: [src], box: { width: 1080, height: 1080 } })

const BEFORE = facts([bgLayer(), headline(), body(), logo()])

function check(cls: InstructionClass, input: Partial<PostConditionInput> & { after: DomFacts }) {
  const pc = INSTRUCTION_CLASSES[cls].postCondition
  if (!pc) throw new Error(`${cls} has no post-condition`)
  return pc({ before: BEFORE, supersedes: [], classes: [cls], ...input })
}

// ── The table ─────────────────────────────────────────────────────────────────

describe('INSTRUCTION_CLASSES — the single per-class table', () => {
  it('is keyed by exactly the four classes', () => {
    expect(Object.keys(INSTRUCTION_CLASSES).sort()).toEqual(['add', 'constrain', 'remove', 'replace'])
    expect([...INSTRUCTION_CLASS_KEYS].sort()).toEqual(['add', 'constrain', 'remove', 'replace'])
  })

  it('gives add no deterministic post-condition (the model verifier owns it) and the rest a function', () => {
    expect(INSTRUCTION_CLASSES.add.postCondition).toBeNull()
    expect(typeof INSTRUCTION_CLASSES.replace.postCondition).toBe('function')
    expect(typeof INSTRUCTION_CLASSES.remove.postCondition).toBe('function')
    expect(typeof INSTRUCTION_CLASSES.constrain.postCondition).toBe('function')
  })

  it('marks exactly replace and remove as destructive', () => {
    const destructive = INSTRUCTION_CLASS_KEYS.filter((k) => INSTRUCTION_CLASSES[k].destructive)
    expect(destructive.sort()).toEqual(['remove', 'replace'])
  })

  it('carries non-empty semantics prose for every class', () => {
    for (const k of INSTRUCTION_CLASS_KEYS) {
      expect(INSTRUCTION_CLASSES[k].semantics.trim().length).toBeGreaterThan(40)
    }
  })

  it('tells the model, with an example, that supersedes entries are verbatim fragments of the current document', () => {
    for (const k of ['replace', 'remove'] as const) {
      const s = INSTRUCTION_CLASSES[k].semantics
      expect(s).toMatch(/supersedes/)
      expect(s).toMatch(/Example/i)
    }
    const block = renderClassSemantics()
    expect(block).toMatch(/verbatim/i)
    expect(block).toMatch(/url\(/)
    expect(block).toMatch(/#id/)
  })

  it('includes the worked constrain example (party-ba)', () => {
    expect(INSTRUCTION_CLASSES.constrain.semantics).toMatch(/make the headline smaller/i)
  })
})

describe('renderClassSemantics — the prompt consumer', () => {
  it('renders every class key and its semantics verbatim', () => {
    const block = renderClassSemantics()
    for (const k of INSTRUCTION_CLASS_KEYS) {
      expect(block).toContain(`${k}:`)
      expect(block).toContain(INSTRUCTION_CLASSES[k].semantics)
    }
  })

  // AC-19: the prompt text derives from the table, so editing the table edits
  // the prompt — there is no second copy to fall out of sync.
  it('changes when the table changes', () => {
    const edited = {
      ...INSTRUCTION_CLASSES,
      remove: { ...INSTRUCTION_CLASSES.remove, semantics: 'EDITED REMOVE SEMANTICS' },
    }
    const block = renderClassSemantics(edited)
    expect(block).toContain('EDITED REMOVE SEMANTICS')
    expect(block).not.toContain(INSTRUCTION_CLASSES.remove.semantics)
  })

  it('names the preserving default for an instruction that cannot be cleanly classified (FR-05)', () => {
    expect(renderClassSemantics()).toMatch(/cannot cleanly classify[\s\S]*\badd\b/i)
  })
})

// ── replace ───────────────────────────────────────────────────────────────────

describe('replace — every superseded fragment present before, absent after', () => {
  it('passes when the old background is gone and the upload took its place', () => {
    const after = facts([bgLayer(UPLOAD), headline(), body(), logo()])
    expect(check('replace', { after, supersedes: [OLD_BG] })).toEqual({ ok: true })
  })

  // AC-09: the reported failure — the upload is added but the old background is
  // kept underneath. It must fail.
  it('fails the duplicate-image regression (old background kept alongside the upload)', () => {
    const after = facts([bgLayer(), bgLayer(UPLOAD), headline(), body(), logo()])
    const r = check('replace', { after, supersedes: [OLD_BG] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain(OLD_BG)
  })

  it('fails when a fragment was never in the original (the model named something that is not there)', () => {
    const after = facts([bgLayer(UPLOAD), headline(), body(), logo()])
    const r = check('replace', { after, supersedes: [OLD_BG, 'http://minio.local/images/nope.png'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('nope.png')
  })

  it('fails closed on empty supersedes', () => {
    expect(check('replace', { after: BEFORE, supersedes: [] }).ok).toBe(false)
    expect(check('replace', { after: BEFORE, supersedes: ['   '] }).ok).toBe(false)
  })

  it('accepts an image fragment written as a CSS url(...) with quotes', () => {
    const after = facts([bgLayer(UPLOAD), headline(), body(), logo()])
    expect(check('replace', { after, supersedes: [`url('${OLD_BG}')`] })).toEqual({ ok: true })
  })

  it('accepts a relative/filename image fragment that is contained in the resolved source', () => {
    const after = facts([bgLayer(UPLOAD), headline(), body(), logo()])
    expect(check('replace', { after, supersedes: ['old-bg.png'] })).toEqual({ ok: true })
  })

  it('matches visible text case- and whitespace-insensitively (text-transform: uppercase renders differently)', () => {
    const after = facts([bgLayer(), headline(96, 'APPLY NOW'), body(), logo()])
    expect(check('replace', { after, supersedes: ['Industry   Readiness Programme'] })).toEqual({ ok: true })
    const unchanged = check('replace', { after: BEFORE, supersedes: ['industry readiness programme'] })
    expect(unchanged.ok).toBe(false)
  })

  it('matches #id and .class tokens', () => {
    const noLogo = facts([bgLayer(), headline(), body(), el({ tag: 'img', classes: ['badge'], imageSources: [UPLOAD] })])
    expect(check('replace', { after: noLogo, supersedes: ['.logo'] })).toEqual({ ok: true })
    expect(check('replace', { after: BEFORE, supersedes: ['.logo'] }).ok).toBe(false)
    const noHeadlineId = facts([bgLayer(), el({ tag: 'h1', text: 'NEW' }), body(), logo()])
    expect(check('replace', { after: noHeadlineId, supersedes: ['#headline'] })).toEqual({ ok: true })
  })

  it('does not match a .class token against image URLs, but does match a hashtag against visible text', () => {
    const dotted = 'http://minio.local/images/brand.logo.svg'
    const before = facts([el({ tag: 'img', classes: ['logo'], imageSources: [dotted] }), el({ tag: 'p', text: 'Apply now #IRP' })])
    // The .logo element is gone; an image whose URL happens to contain ".logo" stays.
    const after = facts([el({ tag: 'img', classes: ['mark'], imageSources: [dotted] }), el({ tag: 'p', text: 'Apply now' })])
    expect(check('replace', { before, after, supersedes: ['.logo'] })).toEqual({ ok: true })
    expect(check('replace', { before, after, supersedes: ['#IRP'] })).toEqual({ ok: true })
  })

  it('with remove co-present, a shortened (not deleted) text fragment satisfies replace too', () => {
    // "use the upload as the background and shorten the paragraph" — one flat
    // supersedes list serves both classes.
    const after = facts([bgLayer(UPLOAD), headline(), body(SHORT_BODY), logo()])
    const input = { after, supersedes: [OLD_BG, 'Join us for'], classes: ['replace', 'remove'] as InstructionClass[] }
    expect(check('replace', input)).toEqual({ ok: true })
    // …but an image fragment still has to be gone.
    const kept = facts([bgLayer(), bgLayer(UPLOAD), headline(), body(SHORT_BODY), logo()])
    expect(check('replace', { ...input, after: kept }).ok).toBe(false)
  })
})

// ── remove ────────────────────────────────────────────────────────────────────

describe('remove — named content reduced, and the document measurably smaller', () => {
  // AC-08: "reduce the text".
  it('passes when the named passage is shortened', () => {
    const after = facts([bgLayer(), headline(), body(SHORT_BODY), logo()])
    expect(check('remove', { after, supersedes: ['Join us for'] })).toEqual({ ok: true })
  })

  it('passes when the named passage is deleted outright', () => {
    const after = facts([bgLayer(), headline(), logo()])
    expect(check('remove', { after, supersedes: ['hands-on workshops'] })).toEqual({ ok: true })
  })

  it('fails when the named passage is unchanged', () => {
    const after = facts([bgLayer(), headline(96, 'IRP'), body(), logo()])
    const r = check('remove', { after, supersedes: ['Join us for'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('Join us for')
  })

  it('fails when the passage shrank but the text was compensated elsewhere (nothing smaller overall)', () => {
    const after = facts([
      bgLayer(),
      headline(),
      body(SHORT_BODY),
      el({ tag: 'p', text: 'Plus unforgettable workshops led by industry experts from across the whole region, hands on, all evening, every evening, all week long.' }),
      logo(),
    ])
    expect(check('remove', { after, supersedes: ['Join us for'] }).ok).toBe(false)
  })

  it('accepts an image removal ("remove the logo") — shrinking is not only about text', () => {
    const after = facts([bgLayer(), headline(), body()])
    expect(check('remove', { after, supersedes: [LOGO] })).toEqual({ ok: true })
  })

  it('fails when an image fragment is still present', () => {
    expect(check('remove', { after: BEFORE, supersedes: [LOGO] }).ok).toBe(false)
  })

  it('fails when a fragment was never in the original', () => {
    const after = facts([bgLayer(), headline(), body(SHORT_BODY), logo()])
    expect(check('remove', { after, supersedes: ['this phrase never existed'] }).ok).toBe(false)
  })

  it('fails closed on empty supersedes', () => {
    expect(check('remove', { after: facts([bgLayer(), headline()]), supersedes: [] }).ok).toBe(false)
  })

  it('skips the whole-document shrink when add is co-present (the add clause legitimately grows it)', () => {
    // "shorten the paragraph and add a human character"
    const after = facts([
      bgLayer(),
      headline(),
      body(SHORT_BODY),
      el({ tag: 'img', classes: ['person'], imageSources: [UPLOAD] }),
      el({ tag: 'p', text: 'A new caption line that is much longer than the text that was removed from the body.' }),
      logo(),
    ])
    const input = { after, supersedes: ['Join us for'], classes: ['remove', 'add'] as InstructionClass[] }
    expect(check('remove', input)).toEqual({ ok: true })
    // The named passage still has to be reduced.
    expect(check('remove', { ...input, after: facts([...BEFORE.elements, el({ tag: 'p', text: 'extra' })]) }).ok).toBe(false)
  })
})

// ── constrain ─────────────────────────────────────────────────────────────────

describe('constrain — bound an attribute, add nothing, change something', () => {
  // The worked example: "make the headline smaller".
  it('passes when the headline font-size drops and nothing is added', () => {
    const after = facts([bgLayer(), headline(72), body(), logo()])
    expect(check('constrain', { after })).toEqual({ ok: true })
  })

  it('fails when the model shrinks the headline but adds a badge (an element and text were added)', () => {
    const after = facts([bgLayer(), headline(72), el({ tag: 'span', text: 'NEW' }), body(), logo()])
    const r = check('constrain', { after })
    expect(r.ok).toBe(false)
  })

  it('fails when a new image source appears', () => {
    const after = facts([bgLayer(UPLOAD), headline(72), body(), logo()])
    const r = check('constrain', { after })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain(UPLOAD)
  })

  it('fails when the visible text grows', () => {
    const after = facts([bgLayer(), headline(72, 'INDUSTRY READINESS PROGRAMME 2026'), body(), logo()])
    expect(check('constrain', { after }).ok).toBe(false)
  })

  it('fails when the element count grows even with no new text', () => {
    const after = facts([bgLayer(), headline(72), body(), logo()], { elementCount: BEFORE.elementCount + 1 })
    expect(check('constrain', { after }).ok).toBe(false)
  })

  it('fails a no-op — leaving the design untouched does not satisfy a constrain', () => {
    const r = check('constrain', { after: facts([bgLayer(), headline(), body(), logo()]) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/unchanged|no measurable change/i)
  })

  it('passes a text-length bound ("keep the body under 12 words") that cuts copy without adding', () => {
    const after = facts([bgLayer(), headline(), body(SHORT_BODY), logo()])
    expect(check('constrain', { after })).toEqual({ ok: true })
  })

  it('counts a box-size change as a change ("make the logo smaller")', () => {
    const smallLogo = el({ tag: 'img', classes: ['logo'], imageSources: [LOGO], box: { width: 120, height: 48 } })
    expect(check('constrain', { after: facts([bgLayer(), headline(), body(), smallLogo]) })).toEqual({ ok: true })
  })

  it('skips the nothing-added checks when an additive class is co-present, but still rejects a no-op', () => {
    const classes = ['constrain', 'replace'] as InstructionClass[]
    const after = facts([bgLayer(UPLOAD), headline(72), body(), logo()])
    expect(check('constrain', { after, classes })).toEqual({ ok: true })
    expect(check('constrain', { after: facts([bgLayer(), headline(), body(), logo()]), classes }).ok).toBe(false)
  })
})
