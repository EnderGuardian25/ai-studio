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
    if (!r.ok) expect(r.reason).toMatch(/word count/)
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
