import { describe, it, expect } from 'vitest'
import {
  INSTRUCTION_CLASSES,
  INSTRUCTION_CLASS_KEYS,
  SUPERSEDES_RULE,
  CONSTRAINS_RULE,
  checkPostConditions,
  decodeHtmlEntities,
  renderClassSemantics,
  type DomElementFact,
  type DomFacts,
  type InstructionClass,
  type InstructionClassTable,
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

// Flat facts: every listed element is a sibling, so document text is the join
// of their texts. elementCount defaults to the list length.
function facts(elements: DomElementFact[], opts: { text?: string; elementCount?: number } = {}): DomFacts {
  return {
    text: opts.text ?? elements.map((e) => e.text).filter(Boolean).join(' '),
    imageSources: elements.flatMap((e) => e.imageSources),
    elementCount: opts.elementCount ?? elements.length,
    elements,
  }
}

// Nested facts, as T14's extractor produces them: an ancestor's text contains
// its descendants' text, so document text must be given explicitly (it is the
// body innerText, not a join of every element).
function nested(text: string, elements: DomElementFact[], elementCount = elements.length): DomFacts {
  return { text, imageSources: elements.flatMap((e) => e.imageSources), elementCount, elements }
}

const OLD_BG = 'http://minio.local/images/generated/old-bg.png'
const UPLOAD = 'http://minio.local/images/briefs/u1/upload.jpg'
const LOGO = 'http://minio.local/brand-kits/k1/logo.png'
const LONG_BODY =
  'Join us for an unforgettable evening of ideas, networking and hands-on workshops led by industry experts from across the region.'
const SHORT_BODY = 'Join us for an evening of ideas and workshops.'

const headline = (fontSizePx = 96, text = 'INDUSTRY READINESS PROGRAMME', box = { width: 900, height: 200 }) =>
  el({ tag: 'h1', id: 'headline', classes: ['title'], text, fontSizePx, box })
const body = (text = LONG_BODY) => el({ tag: 'p', classes: ['body-copy'], text, fontSizePx: 32, box: { width: 900, height: 160 } })
const logo = (box = { width: 200, height: 80 }) => el({ tag: 'img', classes: ['logo'], imageSources: [LOGO], box })
const bgLayer = (src = OLD_BG, cls = 'bg') => el({ tag: 'div', classes: [cls], imageSources: [src], box: { width: 1080, height: 1080 } })

const BEFORE = facts([bgLayer(), headline(), body(), logo()])

function check(
  cls: InstructionClass,
  input: Partial<PostConditionInput> & { after: DomFacts },
  table: InstructionClassTable = INSTRUCTION_CLASSES,
) {
  const pc = table[cls].postCondition
  if (!pc) throw new Error(`${cls} has no post-condition`)
  return pc({ before: BEFORE, supersedes: [], constrains: [], classes: [cls], ...input }, table)
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

  it('marks replace/remove destructive and add/replace additive', () => {
    expect(INSTRUCTION_CLASS_KEYS.filter((k) => INSTRUCTION_CLASSES[k].destructive).sort()).toEqual(['remove', 'replace'])
    expect(INSTRUCTION_CLASS_KEYS.filter((k) => INSTRUCTION_CLASSES[k].additive).sort()).toEqual(['add', 'replace'])
  })

  it('carries non-empty semantics prose for every class', () => {
    for (const k of INSTRUCTION_CLASS_KEYS) {
      expect(INSTRUCTION_CLASSES[k].semantics.trim().length).toBeGreaterThan(40)
    }
  })

  it('tells the model, with examples, how to write fragments', () => {
    for (const k of ['replace', 'remove'] as const) {
      expect(INSTRUCTION_CLASSES[k].semantics).toMatch(/supersedes/)
      expect(INSTRUCTION_CLASSES[k].semantics).toMatch(/Example/i)
    }
    const block = renderClassSemantics()
    expect(block).toMatch(/verbatim/i)
    expect(block).toMatch(/url\(/)
    expect(block).toMatch(/#id/)
    expect(block).toMatch(/unique/i) // minor #7
  })

  it('says a replace may reuse the element but the superseded content must go (ruling 3)', () => {
    expect(INSTRUCTION_CLASSES.replace.semantics).toMatch(/must be GONE/)
    expect(INSTRUCTION_CLASSES.replace.semantics).toMatch(/reuse the same element/i)
  })

  it('tells the model a text reduction needs a text phrase (AC-08 relies on it)', () => {
    expect(INSTRUCTION_CLASSES.remove.semantics).toMatch(/TEXT phrase/)
    expect(INSTRUCTION_CLASSES.remove.semantics).toMatch(/word count/i)
  })

  it('includes the worked constrain example with a named target and direction (party-ba)', () => {
    expect(INSTRUCTION_CLASSES.constrain.semantics).toMatch(/make the headline smaller/i)
    expect(INSTRUCTION_CLASSES.constrain.semantics).toMatch(/constrains/)
    expect(INSTRUCTION_CLASSES.constrain.semantics).toMatch(/"direction": "decrease"/)
    expect(INSTRUCTION_CLASSES.constrain.semantics).toMatch(/still be present after/i) // fix round 3
  })
})

describe('renderClassSemantics — the prompt consumer', () => {
  it('renders every class key, its semantics verbatim, and each fragment rule once', () => {
    const block = renderClassSemantics()
    for (const k of INSTRUCTION_CLASS_KEYS) {
      expect(block).toContain(`${k}:`)
      expect(block).toContain(INSTRUCTION_CLASSES[k].semantics)
    }
    expect(block.split(SUPERSEDES_RULE).length).toBe(2)
    expect(block.split(CONSTRAINS_RULE).length).toBe(2)
  })

  it('names the preserving default for an instruction that cannot be cleanly classified (FR-05)', () => {
    expect(renderClassSemantics()).toMatch(/cannot cleanly classify[\s\S]*\badd\b/i)
  })
})

// AC-19: one table, two consumers — an edit reaches both.
describe('AC-19 — editing the table changes the prompt AND the verifier criteria', () => {
  it('changes the prompt text', () => {
    const edited = { ...INSTRUCTION_CLASSES, remove: { ...INSTRUCTION_CLASSES.remove, semantics: 'EDITED REMOVE SEMANTICS' } }
    const block = renderClassSemantics(edited)
    expect(block).toContain('EDITED REMOVE SEMANTICS')
    expect(block).not.toContain(INSTRUCTION_CLASSES.remove.semantics)
  })

  it('changes the verifier: swapping a post-condition changes checkPostConditions', () => {
    const after = facts([bgLayer(), headline(), body(), logo()]) // untouched
    const input: PostConditionInput = {
      before: BEFORE,
      after,
      supersedes: [],
      constrains: [{ fragment: '#headline', direction: 'decrease' }],
      classes: ['constrain', 'add'],
    }
    const [real] = checkPostConditions(input)
    expect(real).toMatchObject({ class: 'constrain', result: { ok: false } })
    const edited = { ...INSTRUCTION_CLASSES, constrain: { ...INSTRUCTION_CLASSES.constrain, postCondition: () => ({ ok: true as const }) } }
    expect(checkPostConditions(input, edited)).toEqual([{ class: 'constrain', result: { ok: true } }])
  })

  it('changes the verifier: the additive flag is read from the table', () => {
    // remove + add, where the add clause grew the word count.
    const after = facts([bgLayer(), headline(), body(SHORT_BODY), el({ tag: 'p', text: 'A brand new caption that adds many more words than were ever removed from the body copy above it.' }), logo()])
    const input = { after, supersedes: ['Join us for an unforgettable'], classes: ['remove', 'add'] as InstructionClass[] }
    expect(check('remove', input)).toEqual({ ok: true })
    const notAdditive = { ...INSTRUCTION_CLASSES, add: { ...INSTRUCTION_CLASSES.add, additive: false } }
    expect(check('remove', input, notAdditive).ok).toBe(false)
  })

  it('skips add (no deterministic post-condition) in checkPostConditions', () => {
    const input: PostConditionInput = { before: BEFORE, after: BEFORE, supersedes: [], constrains: [], classes: ['add'] }
    expect(checkPostConditions(input)).toEqual([])
  })
})

describe('decodeHtmlEntities', () => {
  it('decodes named and numeric entities and leaves unknown ones', () => {
    expect(decodeHtmlEntities('a&amp;b &quot;q&quot; &#39;s&#x27; &nbsp;&lt;&gt; &bogus;')).toBe(`a&b "q" 's'  <> &bogus;`)
  })
})

// ── replace ───────────────────────────────────────────────────────────────────

describe('replace — the superseded content is present before and gone after', () => {
  it('passes when the old background is gone and the upload took its place', () => {
    const after = facts([bgLayer(UPLOAD), headline(), body(), logo()])
    expect(check('replace', { after, supersedes: [OLD_BG] })).toEqual({ ok: true })
  })

  // AC-09: the reported failure — upload added, old background kept underneath.
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

  it('accepts an image fragment written as a CSS url(...) with quotes, or as a filename', () => {
    const after = facts([bgLayer(UPLOAD), headline(), body(), logo()])
    expect(check('replace', { after, supersedes: [`url('${OLD_BG}')`] })).toEqual({ ok: true })
    expect(check('replace', { after, supersedes: ['old-bg.png'] })).toEqual({ ok: true })
  })

  // Minor #6: a URL copied out of an attribute keeps its &amp;.
  it('decodes HTML entities in a fragment before matching', () => {
    const src = 'http://minio.local/images/bg.png?w=1080&h=1080'
    const before = facts([bgLayer(src), headline()])
    const after = facts([bgLayer(UPLOAD), headline()])
    expect(check('replace', { before, after, supersedes: ['http://minio.local/images/bg.png?w=1080&amp;h=1080'] })).toEqual({
      ok: true,
    })
    const textBefore = facts([el({ tag: 'p', text: 'Tom & Jerry' }), headline()])
    const textAfter = facts([el({ tag: 'p', text: 'Road Runner' }), headline()])
    expect(check('replace', { before: textBefore, after: textAfter, supersedes: ['Tom &amp; Jerry'] })).toEqual({ ok: true })
  })

  it('matches visible text case- and whitespace-insensitively (text-transform: uppercase renders differently)', () => {
    const after = facts([bgLayer(), headline(96, 'APPLY NOW'), body(), logo()])
    expect(check('replace', { after, supersedes: ['Industry   Readiness Programme'] })).toEqual({ ok: true })
    expect(check('replace', { after: BEFORE, supersedes: ['industry readiness programme'] }).ok).toBe(false)
  })

  it('matches #id and .class tokens by the content they identify', () => {
    const noLogo = facts([bgLayer(), headline(), body(), el({ tag: 'img', classes: ['badge'], imageSources: [UPLOAD] })])
    expect(check('replace', { after: noLogo, supersedes: ['.logo'] })).toEqual({ ok: true })
    expect(check('replace', { after: BEFORE, supersedes: ['.logo'] }).ok).toBe(false)
    const noHeadlineId = facts([bgLayer(), el({ tag: 'h1', text: 'NEW' }), body(), logo()])
    expect(check('replace', { after: noHeadlineId, supersedes: ['#headline'] })).toEqual({ ok: true })
  })

  // Ruling 3, probe D (false miss): swapping the image on the same .bg element
  // is the natural correct edit.
  it('passes when the image is swapped on the same .bg element (the element survives)', () => {
    const after = facts([bgLayer(UPLOAD), headline(), body(), logo()])
    expect(check('replace', { after, supersedes: ['.bg'] })).toEqual({ ok: true })
  })

  // Ruling 3, probe C (false pass): the old URL moved to another element and the
  // new image added alongside it.
  it('fails when the old image moves to another element and the new one is added alongside', () => {
    const after = facts([bgLayer(UPLOAD), bgLayer(OLD_BG, 'underlay'), headline(), body(), logo()])
    const r = check('replace', { after, supersedes: ['.bg'] })
    expect(r.ok).toBe(false)
  })

  it('a .class token does not substring-match image URLs; a hashtag matches visible text', () => {
    const dotted = 'http://minio.local/images/brand.logo.svg'
    const before = facts([logo(), el({ tag: 'img', classes: ['mark'], imageSources: [dotted] }), el({ tag: 'p', text: 'Apply now #IRP' })])
    // The .logo element and its image are gone; an unrelated image whose URL contains ".logo" stays.
    const after = facts([el({ tag: 'img', classes: ['mark'], imageSources: [dotted] }), el({ tag: 'p', text: 'Apply now' })])
    expect(check('replace', { before, after, supersedes: ['.logo'] })).toEqual({ ok: true })
    expect(check('replace', { before, after, supersedes: ['#IRP'] })).toEqual({ ok: true })
  })

  it('with remove co-present, a shortened (not deleted) text fragment satisfies replace too', () => {
    const after = facts([bgLayer(UPLOAD), headline(), body(SHORT_BODY), logo()])
    const input = { after, supersedes: [OLD_BG, 'Join us for'], classes: ['replace', 'remove'] as InstructionClass[] }
    expect(check('replace', input)).toEqual({ ok: true })
    const kept = facts([bgLayer(), bgLayer(UPLOAD), headline(), body(SHORT_BODY), logo()])
    expect(check('replace', { ...input, after: kept }).ok).toBe(false)
  })

  // Finding #1 via the replace-with-remove path.
  it('with remove co-present, a phrase merely re-wrapped in <strong> does not satisfy replace', () => {
    const passage = 'Join us for an evening of ideas'
    const before = nested(passage, [el({ tag: 'p', text: passage })])
    const after = nested(passage, [el({ tag: 'p', text: passage }), el({ tag: 'strong', text: 'Join us for' })], 2)
    const r = check('replace', { before, after, supersedes: ['Join us for'], classes: ['replace', 'remove'] })
    expect(r.ok).toBe(false)
  })
})

// ── remove ────────────────────────────────────────────────────────────────────

describe('remove — named content reduced, and the document measurably smaller', () => {
  // AC-08: "reduce the text".
  it('passes when the named passage loses words', () => {
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

  it('fails when the passage shrank but the text was compensated elsewhere', () => {
    const after = facts([
      bgLayer(),
      headline(),
      body(SHORT_BODY),
      el({ tag: 'p', text: 'Plus unforgettable workshops led by industry experts from across the whole region, hands on, all evening, every evening, all week long.' }),
      logo(),
    ])
    expect(check('remove', { after, supersedes: ['Join us for'] }).ok).toBe(false)
  })

  // Finding #1, re-wrap probe: the innermost container shrinks, no character is removed.
  it('fails when the phrase is only re-wrapped in <strong> (nested facts, add co-present)', () => {
    const passage = 'Join us for an evening of ideas'
    const before = nested(`${passage} APPLY`, [el({ tag: 'p', text: passage }), el({ tag: 'span', text: 'APPLY' })])
    const after = nested(`${passage} APPLY and a new caption`, [
      el({ tag: 'p', text: passage }),
      el({ tag: 'strong', text: 'Join us for' }),
      el({ tag: 'span', text: 'APPLY' }),
      el({ tag: 'span', text: 'and a new caption' }),
    ])
    const r = check('remove', { before, after, supersedes: ['Join us for'], classes: ['remove', 'add'] })
    expect(r.ok).toBe(false)
  })

  // Finding #1, split probe: one paragraph becomes two with identical text.
  it('fails when a paragraph is only split into several elements', () => {
    const passage = 'Doors open at six. Talks start at seven.'
    const before = nested(passage, [el({ tag: 'div', text: passage }), el({ tag: 'p', text: passage })])
    const after = nested(passage, [
      el({ tag: 'div', text: passage }),
      el({ tag: 'p', text: 'Doors open at six.' }),
      el({ tag: 'p', text: 'Talks start at seven.' }),
    ])
    const r = check('remove', { before, after, supersedes: ['Doors open at six'], classes: ['remove', 'add'] })
    expect(r.ok).toBe(false)
  })

  it('passes a nested passage that genuinely lost words', () => {
    const passage = 'Doors open at six. Talks start at seven.'
    const before = nested(passage, [el({ tag: 'div', text: passage }), el({ tag: 'p', text: passage })])
    const after = nested('Doors open at six.', [el({ tag: 'div', text: 'Doors open at six.' }), el({ tag: 'p', text: 'Doors open at six.' })])
    expect(check('remove', { before, after, supersedes: ['Doors open at six'] })).toEqual({ ok: true })
  })

  // Finding #2: a 1-character trim is not "measurably shorter".
  it('fails a trim that removes characters but no words', () => {
    const after = facts([bgLayer(), headline(), body(LONG_BODY.replace('workshops', 'workshop')), logo()])
    const r = check('remove', { after, supersedes: ['hands-on workshops'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/word count|whole words/)
  })

  it('accepts an image removal ("remove the logo") when every fragment is an image', () => {
    const after = facts([bgLayer(), headline(), body()])
    expect(check('remove', { after, supersedes: [LOGO] })).toEqual({ ok: true })
    expect(check('remove', { after, supersedes: ['.logo'] })).toEqual({ ok: true })
  })

  // Finding #2: image shrinkage does not stand in for a text fragment.
  it('does not let an image removal satisfy a text fragment whose passage lost no words', () => {
    const after = facts([bgLayer(), headline(), body(LONG_BODY.replace('region.', 'region'))])
    const r = check('remove', { after, supersedes: ['hands-on workshops led', LOGO] })
    expect(r.ok).toBe(false)
  })

  it('fails when an image fragment is still present', () => {
    expect(check('remove', { after: BEFORE, supersedes: [LOGO] }).ok).toBe(false)
  })

  it('reduces a text-only .class token: shorter text on the surviving element passes, unchanged fails', () => {
    const badge = (text: string) => el({ tag: 'span', classes: ['promo-badge'], text })
    const before = facts([headline(), badge('Limited seats available now')])
    expect(check('remove', { before, after: facts([headline(), badge('Limited seats')]), supersedes: ['.promo-badge'] })).toEqual({ ok: true })
    expect(check('remove', { before, after: before, supersedes: ['.promo-badge'] }).ok).toBe(false)
  })

  it('fails when a fragment was never in the original', () => {
    const after = facts([bgLayer(), headline(), body(SHORT_BODY), logo()])
    expect(check('remove', { after, supersedes: ['this phrase never existed'] }).ok).toBe(false)
  })

  it('fails closed on empty supersedes', () => {
    expect(check('remove', { after: facts([bgLayer(), headline()]), supersedes: [] }).ok).toBe(false)
  })

  it('stands the word-count check down when add is co-present, but still requires the passage reduced', () => {
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
    expect(check('remove', { ...input, after: facts([...BEFORE.elements, el({ tag: 'p', text: 'extra' })]) }).ok).toBe(false)
  })
})

// ── constrain ─────────────────────────────────────────────────────────────────

describe('constrain — the named target changes in the stated direction, nothing added', () => {
  const smaller = [{ fragment: '#headline', direction: 'decrease' as const }]

  // The worked example: "make the headline smaller".
  it('passes when the headline font-size drops and nothing is added', () => {
    const after = facts([bgLayer(), headline(72, undefined, { width: 900, height: 150 }), body(), logo()])
    expect(check('constrain', { after, constrains: smaller })).toEqual({ ok: true })
  })

  // Probe E: "smaller" but 96px → 140px.
  it('fails when the target moves in the wrong direction', () => {
    const after = facts([bgLayer(), headline(140, undefined, { width: 900, height: 290 }), body(), logo()])
    const r = check('constrain', { after, constrains: smaller })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/did not decrease/)
  })

  // Probe F: constrain + add, the add clause applied, the headline untouched.
  it('fails constrain+add when the headline is untouched', () => {
    const after = facts([bgLayer(), headline(), body(), logo(), el({ tag: 'img', classes: ['person'], imageSources: [UPLOAD] })])
    const r = check('constrain', { after, constrains: smaller, classes: ['constrain', 'add'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/unchanged/)
  })

  it('passes constrain+add when the target shrank, even though the add clause added content', () => {
    const after = facts([bgLayer(), headline(72), body(), logo(), el({ tag: 'img', classes: ['person'], imageSources: [UPLOAD] })])
    expect(check('constrain', { after, constrains: smaller, classes: ['constrain', 'add'] })).toEqual({ ok: true })
  })

  it('fails when constrain is the only class and a badge is added', () => {
    const after = facts([bgLayer(), headline(72), el({ tag: 'span', text: 'NEW' }), body(), logo()])
    expect(check('constrain', { after, constrains: smaller }).ok).toBe(false)
  })

  it('fails when constrain is the only class and a new image source appears', () => {
    const after = facts([bgLayer(UPLOAD), headline(72), body(), logo()])
    const r = check('constrain', { after, constrains: smaller })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain(UPLOAD)
  })

  it('passes an increase ("make the logo bigger") and fails it when the logo shrinks', () => {
    const bigger = [{ fragment: '.logo', direction: 'increase' as const }]
    expect(check('constrain', { after: facts([bgLayer(), headline(), body(), logo({ width: 300, height: 120 })]), constrains: bigger })).toEqual({ ok: true })
    expect(check('constrain', { after: facts([bgLayer(), headline(), body(), logo({ width: 100, height: 40 })]), constrains: bigger }).ok).toBe(false)
  })

  it('with no direction, any measurable change passes', () => {
    const after = facts([bgLayer(), headline(), body(), logo({ width: 120, height: 48 })])
    expect(check('constrain', { after, constrains: [{ fragment: '.logo' }] })).toEqual({ ok: true })
  })

  it('passes a text-length bound ("keep the body under 12 words") targeted by a phrase', () => {
    const after = facts([bgLayer(), headline(), body(SHORT_BODY), logo()])
    expect(check('constrain', { after, constrains: [{ fragment: 'Join us for', direction: 'decrease' }] })).toEqual({ ok: true })
  })

  it('fails when the target no longer exists', () => {
    const after = facts([bgLayer(), body(), logo()])
    const r = check('constrain', { after, constrains: smaller })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/gone/)
  })

  it('fails when the target does not identify anything in the original', () => {
    const after = facts([bgLayer(), headline(72), body(), logo()])
    expect(check('constrain', { after, constrains: [{ fragment: '#subtitle', direction: 'decrease' }] }).ok).toBe(false)
  })

  it('fails closed with no target named', () => {
    const after = facts([bgLayer(), headline(72), body(), logo()])
    expect(check('constrain', { after, constrains: [] }).ok).toBe(false)
    expect(check('constrain', { after, constrains: [{ fragment: '  ' }] }).ok).toBe(false)
  })
})

// ── Fix round 2 probes ────────────────────────────────────────────────────────

describe('fix round 2 — a named text passage must lose words (finding 1)', () => {
  const reworded = LONG_BODY.replace('an unforgettable evening', 'a truly memorable evening')

  // Probe I1a: the named phrase is reworded out, the passage gets LONGER, and an
  // add clause stands the whole-document word count down.
  it('remove+add: fails when the phrase is reworded out and the passage grows', () => {
    const after = facts([bgLayer(), headline(), body(reworded), el({ tag: 'p', classes: ['caption'], text: 'New caption here' }), logo()])
    const r = check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] })
    expect(r.ok).toBe(false)
  })

  it('replace+remove: fails the same rewording through the replace-with-remove path', () => {
    const after = facts([bgLayer(UPLOAD), headline(), body(reworded), logo()])
    const r = check('replace', { after, supersedes: [OLD_BG, 'unforgettable evening'], classes: ['replace', 'remove'] })
    expect(r.ok).toBe(false)
  })

  it('remove+add: fails when the phrase survives but the passage only swaps a word', () => {
    const after = facts([bgLayer(), headline(), body(LONG_BODY.replace('region', 'nation')), el({ tag: 'p', classes: ['caption'], text: 'Cap' }), logo()])
    expect(check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] }).ok).toBe(false)
  })

  it('remove+add: passes when the passage genuinely loses words (phrase kept)', () => {
    const after = facts([
      bgLayer(),
      headline(),
      body('Join us for an unforgettable evening of workshops.'),
      el({ tag: 'p', classes: ['caption'], text: 'A caption with many many many many many many many many many many words' }),
      logo(),
    ])
    expect(check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] })).toEqual({ ok: true })
  })

  it('remove: passes when the phrase is reworded out and the passage loses words', () => {
    const after = facts([bgLayer(), headline(), body('Join us for a memorable evening of workshops.'), logo()])
    expect(check('remove', { after, supersedes: ['unforgettable evening'] })).toEqual({ ok: true })
  })
})

describe('fix round 2 — a token on an element with an image AND its own text covers both (finding 2)', () => {
  const BADGE = 'http://minio.local/images/badge.png'
  const badge = (src: string | null, text = 'LIMITED SEATS') =>
    el({ tag: 'div', classes: ['promo-badge'], text, imageSources: src ? [src] : [] })
  const before = facts([bgLayer(), headline(), badge(BADGE)])

  it('replace .promo-badge: fails when the image is swapped but the old text kept', () => {
    const after = facts([bgLayer(), headline(), badge(UPLOAD)])
    expect(check('replace', { before, after, supersedes: ['.promo-badge'] }).ok).toBe(false)
  })

  it('replace .promo-badge: fails when the image is dropped and the old text moved to a <span> beside a new badge', () => {
    const after = facts([
      bgLayer(),
      headline(),
      el({ tag: 'span', text: 'LIMITED SEATS' }),
      el({ tag: 'div', classes: ['new-badge'], text: 'SOLD OUT' }),
    ])
    expect(check('replace', { before, after, supersedes: ['.promo-badge'] }).ok).toBe(false)
  })

  it('remove .promo-badge: fails when the image is gone but the text moved to a <span>', () => {
    const after = facts([bgLayer(), headline(), el({ tag: 'span', text: 'LIMITED SEATS' })], { elementCount: 3 })
    expect(check('remove', { before, after, supersedes: ['.promo-badge'] }).ok).toBe(false)
  })

  it('replace .promo-badge: passes when both the image and the text are replaced on the same element', () => {
    const after = facts([bgLayer(), headline(), badge(UPLOAD, 'SOLD OUT')])
    expect(check('replace', { before, after, supersedes: ['.promo-badge'] })).toEqual({ ok: true })
  })

  it('a container whose text contains a child element\'s shorter text is not a leaf: its images alone identify it', () => {
    // .hero carries the background AND wraps the headline (its text is the headline's).
    const hero = (src: string) => el({ tag: 'section', classes: ['hero'], imageSources: [src], text: 'INDUSTRY READINESS PROGRAMME Apply' })
    const b = facts([hero(OLD_BG), headline(), el({ tag: 'span', text: 'Apply' })], { text: 'INDUSTRY READINESS PROGRAMME Apply' })
    const a = facts([hero(UPLOAD), headline(), el({ tag: 'span', text: 'Apply' })], { text: 'INDUSTRY READINESS PROGRAMME Apply' })
    expect(check('replace', { before: b, after: a, supersedes: ['.hero'] })).toEqual({ ok: true })
  })
})

describe('fix round 2 — constrain measures the target, not a same-shape newcomer (finding 3)', () => {
  it('constrain+add: fails when the body is untouched and a short same-shape <p> is inserted before it', () => {
    const after = facts([bgLayer(), headline(), body('Short new caption.'), body(), logo()])
    const r = check('constrain', {
      after,
      constrains: [{ fragment: 'hands-on workshops', direction: 'decrease' }],
      classes: ['constrain', 'add'],
    })
    expect(r.ok).toBe(false)
  })

  it('phrase gone: a moderately cut passage is found by word overlap', () => {
    const after = facts([bgLayer(), headline(), body(LONG_BODY.replace('hands-on workshops', 'workshops')), logo()])
    expect(check('constrain', { after, constrains: [{ fragment: 'hands-on workshops', direction: 'decrease' }] })).toEqual({ ok: true })
  })

  // Fix round 3 ruling: with the phrase gone, a passage keeping under half its
  // words has no counterpart and reads as gone — fail-closed for a constrain.
  it('phrase gone: a passage that kept under half its words reads as gone (fail closed)', () => {
    const after = facts([bgLayer(), headline(), body('Join us for an evening.'), logo()])
    const r = check('constrain', { after, constrains: [{ fragment: 'hands-on workshops', direction: 'decrease' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/gone/)
  })
})

// ── Fix round 3 probes ────────────────────────────────────────────────────────

describe('fix round 3 — the passage counterpart, not an innermost wrapper or a newcomer (findings 1 & 2)', () => {
  const swapped = LONG_BODY.replace('region', 'nation')
  const reworded = LONG_BODY.replace('an unforgettable evening', 'a truly memorable evening')
  const pullQuote = (text: string, fontSizePx = 40) =>
    el({ tag: 'blockquote', classes: ['pull-quote'], text, fontSizePx, box: { width: 600, height: 80 } })

  // N1: one word swapped in the body, the phrase also wrapped in <strong>, caption added.
  it('N1 remove+add: fails when the phrase is wrapped in <strong> and the body only swaps a word', () => {
    const after = nested(`INDUSTRY READINESS PROGRAMME ${swapped} Cap`, [
      bgLayer(),
      headline(),
      body(swapped),
      el({ tag: 'strong', text: 'unforgettable evening' }),
      el({ tag: 'p', classes: ['caption'], text: 'Cap' }),
    ])
    expect(check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] }).ok).toBe(false)
  })

  // N2: a new pull-quote repeats the phrase; the body only swaps a word.
  it('N2 remove+add: fails when a new pull-quote repeats the phrase and the body only swaps a word', () => {
    const after = facts([bgLayer(), headline(), body(swapped), pullQuote('An unforgettable evening'), logo()])
    expect(check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] }).ok).toBe(false)
  })

  // N3: the regression from the round-2 counterpart — the pull-quote was measured instead of the body.
  it('N3 constrain+add: fails when the body is untouched and a smaller pull-quote repeats the target phrase', () => {
    const after = facts([bgLayer(), headline(), body(), logo(), pullQuote('Hands-on workshops', 28)])
    const r = check('constrain', {
      after,
      constrains: [{ fragment: 'hands-on workshops', direction: 'decrease' }],
      classes: ['constrain', 'add'],
    })
    expect(r.ok).toBe(false)
  })

  // N4 / N4b: phrase reworded out, passage grows, a short same-shape <p> inserted BEFORE it.
  it('N4 remove+add: fails when the phrase is reworded out and a short same-shape <p> is inserted before the grown passage', () => {
    const after = facts([bgLayer(), headline(), body('Short new caption.'), body(reworded), logo()])
    expect(check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] }).ok).toBe(false)
  })

  it('N4b replace+remove: fails the same with the background swapped', () => {
    const after = facts([bgLayer(UPLOAD), headline(), body('Short new caption.'), body(reworded), logo()])
    const input = { after, supersedes: [OLD_BG, 'unforgettable evening'], classes: ['replace', 'remove'] as InstructionClass[] }
    expect(check('replace', input).ok).toBe(false)
    expect(check('remove', input).ok).toBe(false)
  })

  it('phrase gone: finds the same-shape passage by word overlap past an inserted caption', () => {
    const cut = LONG_BODY.replace('hands-on workshops', 'workshops')
    const after = facts([bgLayer(), headline(), body('Short new caption.'), body(cut), logo()])
    expect(
      check('constrain', { after, constrains: [{ fragment: 'hands-on workshops', direction: 'decrease' }], classes: ['constrain', 'add'] }),
    ).toEqual({ ok: true })
  })

  it('phrase survives: the same-shape holder is measured even when a shorter wrapper also holds it', () => {
    const shorter = 'Join us for an unforgettable evening of workshops.'
    const after = nested(`INDUSTRY READINESS PROGRAMME ${shorter}`, [
      bgLayer(),
      headline(),
      body(shorter),
      el({ tag: 'strong', text: 'unforgettable evening' }),
    ])
    expect(check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] })).toEqual({ ok: true })
  })
})

describe('fix round 3 — a short label elsewhere does not make a badge a container (finding 3)', () => {
  const BADGE = 'http://minio.local/images/badge.png'
  const badge = (src: string, text: string) => el({ tag: 'div', classes: ['promo-badge'], text, imageSources: [src] })
  const cases: Array<[string, string]> = [
    ['LIMITED SEATS', 'SEATS'],
    ['APPLY NOW', 'Apply'],
    ['IRP 2026', 'IRP'],
  ]

  for (const [badgeText, labelText] of cases) {
    const label = el({ tag: 'span', classes: ['label'], text: labelText })

    it(`label "${labelText}" BEFORE badge "${badgeText}": image swapped, text kept → miss`, () => {
      const before = facts([label, headline(), badge(BADGE, badgeText)])
      const after = facts([label, headline(), badge(UPLOAD, badgeText)])
      expect(check('replace', { before, after, supersedes: ['.promo-badge'] }).ok).toBe(false)
    })

    it(`label "${labelText}" right AFTER badge "${badgeText}": image swapped, text kept → miss`, () => {
      const before = facts([headline(), badge(BADGE, badgeText), label])
      const after = facts([headline(), badge(UPLOAD, badgeText), label])
      expect(check('replace', { before, after, supersedes: ['.promo-badge'] }).ok).toBe(false)
    })
  }

  it('a badge whose text lives in a child <span> of the same text: image swapped, text kept → miss (N8)', () => {
    const span = el({ tag: 'span', text: 'LIMITED SEATS' })
    const before = nested('LIMITED SEATS', [badge(BADGE, 'LIMITED SEATS'), span])
    const after = nested('LIMITED SEATS', [badge(UPLOAD, 'LIMITED SEATS'), span])
    expect(check('replace', { before, after, supersedes: ['.promo-badge'] }).ok).toBe(false)
  })

  it('a container whose descendants follow it (pre-order) is still a container', () => {
    const hero = (src: string) =>
      el({ tag: 'section', classes: ['hero'], imageSources: [src], text: 'INDUSTRY READINESS PROGRAMME Apply now' })
    const kids = [headline(), el({ tag: 'a', classes: ['cta'], text: 'Apply now' })]
    const text = 'INDUSTRY READINESS PROGRAMME Apply now'
    expect(check('replace', { before: nested(text, [hero(OLD_BG), ...kids]), after: nested(text, [hero(UPLOAD), ...kids]), supersedes: ['.hero'] })).toEqual({
      ok: true,
    })
  })

  // N7 — accepted as fail-closed: an image container whose ONLY text is one child
  // is indistinguishable from a leaf, so "replace .hero" keeping the headline misses.
  it('N7: a hero wrapping only its headline counts as a leaf (fail-closed, accepted)', () => {
    const hero = (src: string) => el({ tag: 'section', classes: ['hero'], imageSources: [src], text: 'INDUSTRY READINESS PROGRAMME' })
    expect(check('replace', { before: facts([hero(OLD_BG), headline()]), after: facts([hero(UPLOAD), headline()]), supersedes: ['.hero'] }).ok).toBe(false)
  })
})

// ── Final fix wave (Wave 3) probes ────────────────────────────────────────────

describe('final fix — with an additive class co-present, remove counts words across the passage\'s shape (I3)', () => {
  const swapped = LONG_BODY.replace('region', 'nation')
  const reworded = LONG_BODY.replace('an unforgettable evening', 'a truly memorable evening')
  const tagline = el({ tag: 'div', classes: ['tagline'], text: 'Your future starts here' })

  // SPLIT: "reduce the text and add a tagline" — the body is split into two
  // same-shape paragraphs with one word inserted (20 → 21 words) and a tagline
  // added. The counterpart used to pick the shorter half.
  it('SPLIT remove+add: fails when the body is split into two same-shape halves that together gained a word', () => {
    const after = facts([
      bgLayer(),
      headline(),
      body('Join us for an unforgettable evening of ideas, networking and hands-on workshops'),
      body('led by top industry experts from across the region.'),
      tagline,
      logo(),
    ])
    const r = check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/p\.body-copy/)
  })

  it('R1 remove+add: fails when the body swaps one word and a new same-shape <p> repeats the phrase', () => {
    const after = facts([bgLayer(), headline(), body(swapped), body('An unforgettable evening awaits.'), logo()])
    expect(check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] }).ok).toBe(false)
  })

  it('R1b remove+add: fails when the body is reworded longer and a new same-shape <p> repeats the phrase', () => {
    const after = facts([bgLayer(), headline(), body(reworded), body('An unforgettable evening awaits.'), logo()])
    expect(check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] }).ok).toBe(false)
  })

  it('R1 mid-passage remove+replace: fails when the background is swapped, the body swaps a word and a same-shape <p> repeats a mid-passage phrase', () => {
    const after = facts([bgLayer(UPLOAD), headline(), body(swapped), body('Hands-on workshops await.'), logo()])
    const results = checkPostConditions({
      before: BEFORE,
      after,
      supersedes: [OLD_BG, 'hands-on workshops'],
      constrains: [],
      classes: ['replace', 'remove'],
    })
    expect(results.some((x) => !x.result.ok)).toBe(true)
  })

  // Guards: genuine reductions still pass with an additive class co-present.
  it('remove+add: passes a split whose same-shape halves together lost words', () => {
    const after = facts([
      bgLayer(),
      headline(),
      body('Join us for an unforgettable evening of ideas.'),
      body('Workshops led by industry experts.'),
      tagline,
      logo(),
    ])
    expect(check('remove', { after, supersedes: ['unforgettable evening'], classes: ['remove', 'add'] })).toEqual({ ok: true })
  })

  it('remove+replace: passes a shortened body with the background swapped', () => {
    const after = facts([bgLayer(UPLOAD), headline(), body(SHORT_BODY), logo()])
    const results = checkPostConditions({
      before: BEFORE,
      after,
      supersedes: [OLD_BG, 'Join us for'],
      constrains: [],
      classes: ['replace', 'remove'],
    })
    expect(results.every((x) => x.result.ok)).toBe(true)
  })

  // Accepted consequence of the ruling: a deliberately added paragraph with the
  // passage's own tag+classes counts against the reduction (fail closed).
  it('remove+add: a long same-shape paragraph added alongside a shortened body fails closed (accepted)', () => {
    const after = facts([bgLayer(), headline(), body(SHORT_BODY), body('A brand new paragraph that the add clause asked for, written at length.'), logo()])
    expect(check('remove', { after, supersedes: ['Join us for'], classes: ['remove', 'add'] }).ok).toBe(false)
  })
})

describe('final fix — the phrase-gone word overlap counts DISTINCT words (R3)', () => {
  it('R3 constrain+add: fails when the passage is deleted and a same-shape <p> repeats one of its words', () => {
    const after = facts([bgLayer(), headline(), body('join join join join join join join join join join join'), logo()])
    const r = check('constrain', {
      after,
      constrains: [{ fragment: 'hands-on workshops', direction: 'decrease' }],
      classes: ['constrain', 'add'],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/gone/)
  })
})

// T17 — the flat supersedes list serves both clauses of a replace+remove
// instruction. A text/token fragment whose passage was rewritten WHOLESALE
// (under half its distinct words kept, phrase gone) is the replace clause's —
// replace may reuse the same element, so the id fallback must not re-identify
// the rewritten element as a passage that "failed to shrink".
describe('T17 — replace+remove with one flat supersedes: a wholesale-replaced text fragment is the replace clause\'s', () => {
  const NEW_HEADLINE = 'APPLY NOW FOR THE 2027 COHORT AND LAUNCH YOUR CAREER WITH US'
  const both = (supersedes: string[], after: DomFacts) =>
    checkPostConditions({ before: BEFORE, after, supersedes, constrains: [], classes: ['replace', 'remove'] })

  it('"change the headline to X and remove the logo" passes when correctly applied (phrase fragment, element reused by id)', () => {
    const after = facts([bgLayer(), headline(96, NEW_HEADLINE), body()])
    const results = both(['INDUSTRY READINESS PROGRAMME', '.logo'], after)
    expect(results.map((r) => [r.class, r.result])).toEqual([
      ['replace', { ok: true }],
      ['remove', { ok: true }],
    ])
  })

  it('passes the same with a #id token fragment for the headline', () => {
    const after = facts([bgLayer(), headline(96, NEW_HEADLINE), body()])
    expect(both(['#headline', '.logo'], after).every((r) => r.result.ok)).toBe(true)
  })

  it('still fails when the logo is kept (the remove clause did nothing)', () => {
    const after = facts([bgLayer(), headline(96, NEW_HEADLINE), body(), logo()])
    const results = both(['INDUSTRY READINESS PROGRAMME', '.logo'], after)
    expect(results.some((r) => !r.result.ok)).toBe(true)
  })

  it('still fails when the headline is kept (the replace clause did nothing)', () => {
    const after = facts([bgLayer(), headline(), body()])
    const results = both(['INDUSTRY READINESS PROGRAMME', '.logo'], after)
    expect(results.find((r) => r.class === 'replace')?.result.ok).toBe(false)
  })

  it('a rewording that keeps most of the passage is not a replacement — remove still requires fewer words', () => {
    const reworded = LONG_BODY.replace('an unforgettable evening', 'a truly memorable evening')
    const after = facts([bgLayer(UPLOAD), headline(), body(reworded), logo()])
    const results = both([OLD_BG, 'unforgettable evening'], after)
    expect(results.find((r) => r.class === 'remove')?.result.ok).toBe(false)
  })

  it('the exemption is replace-only: remove+add still rejects a passage rewritten wholesale and longer', () => {
    const after = facts([bgLayer(), headline(), body('Completely different words describing another thing entirely, at even greater length than before, so that this new passage runs well past the twenty words of the original body.'), logo()])
    const r = check('remove', { after, supersedes: ['Join us for'], classes: ['remove', 'add'] })
    expect(r.ok).toBe(false)
  })
})
