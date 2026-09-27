// The per-class instruction table for AGUI refine (change 004 Phase 2).
//
// A refine instruction is one or more of four classes — add / replace / remove /
// constrain — declared by the refine model in its reply envelope
// (refineEnvelope.ts). This module is the ONLY definition of what each class
// means. It has two consumers:
//
//   - the refine prompt renders each class's `semantics` plus the fragment rules
//     (renderClassSemantics),
//   - the verifier runs each class's `postCondition` (checkPostConditions)
//     against facts extracted from the rendered DOM before and after the edit.
//
// Because both read the same table, editing a class here changes the prompt
// AND the verification criteria together (FR-06, AC-19). Do not restate the
// semantics or the fragment rules anywhere else.
//
// ── Post-conditions ──────────────────────────────────────────────────────────
// Post-conditions are pure functions over DomFacts — never over raw HTML. The
// fact extractor runs against the rendered DOM in Chromium (T14) and produces
// the DomFacts shape defined below. `add` has no deterministic post-condition
// (nothing measurable says "a human character is now present"), so it is
// verified by a model call that also receives DomFacts (FR-09).
//
// Every post-condition sees the full set of classes the instruction carried,
// because multi-clause instructions (AC-11) are verified class by class over the
// SAME document. Where a co-present class is `additive` in the table (add,
// replace) it legitimately grows the document, so the whole-document growth /
// shrink checks of the other classes stand down — remove's word count is then
// narrowed to the named passages' shapes rather than dropped (see Known limits,
// I3). The per-fragment and per-target checks never stand down.
//
// ── Fragments ────────────────────────────────────────────────────────────────
// `supersedes` entries and `constrains[].fragment` are verbatim identifying
// fragments copied from the ORIGINAL document (HTML entities such as &amp; are
// decoded before matching). Each is resolved against the `before` facts into
// the CONTENT it identifies:
//   - `#id` / `.class` matching an element → that element's image sources AND,
//     when it is a leaf (no other element's non-empty text is a strictly
//     shorter substring of its text) or carries no image, its visible text. The
//     element itself may survive an edit — swapping the image on the same `.bg`
//     element is a correct replace, but a badge whose image is swapped while its
//     old text stays is not. (DomFacts has no parent links; the leaf test keeps
//     an image-bearing container from being identified by its children's
//     text.) A token that
//     matches no element falls through to the rules below, so a hashtag such as
//     "#IRP" is matched as visible text.
//   - a substring of an image source (URL, filename, `url('…')`, or an
//     __INLINE_ASSET_n__ token) → that image.
//   - a phrase of visible text (case- and whitespace-insensitive, because
//     rendered text honours text-transform) → the phrase, plus the full text of
//     its innermost containing element (the "passage").
// A fragment that resolves to nothing in `before` is always a miss: the model
// named something that is not there, so its absence afterwards proves nothing.
//
// Finding the passage afterwards (counterpart): a surviving phrase is followed
// to the shortest element holding it with the passage's own tag+classes; a
// vanished phrase to the same-shape element sharing at least half the
// passage's words; otherwise the passage is "gone". Known limits:
//   - N5 (open, minor): a passage that is re-tagged (a <p class="body-copy">
//     rewritten as <div class="lead">) with its phrase reworded out has no
//     counterpart and counts as gone — a remove passes it.
//   - A constrain whose target phrase vanishes and whose passage keeps under
//     half its words reads as gone (a miss). The constrain semantics ask for a
//     target phrase that stays in the result.
//   - N7 (accepted, fail-closed): an image-bearing container whose only text is
//     a single child (section.hero wrapping just an <h1>) is indistinguishable
//     from a leaf, so "replace .hero" that keeps the headline misses. The
//     prompt steers backgrounds to image-URL fragments, which do not hit this.
//   - The overlap counts DISTINCT shared words, so a newcomer repeating one
//     passage word ("join join join …") is not taken for the passage (R3).
//   - Remove with an additive class co-present (I3): the counterpart alone can
//     be fooled — a passage split into same-shape halves, or a new same-shape
//     element repeating the phrase, gives a shorter "counterpart". So the
//     stood-down whole-document word count is replaced by the words summed
//     over every element with each text passage's tag+classes, which must
//     strictly decrease. Accepted consequences (fail-closed): a deliberately
//     added paragraph of the passage's own shape counts against the reduction,
//     and so does a replace+remove whose replacement TEXT, in the same shape,
//     is longer than what it replaced. Nested same-shape elements (a class-less
//     <div> inside another) are counted once per level, before and after
//     alike.
//
// A text passage counts as reduced only when it no longer appears INTACT in the
// document's text (re-wrapping a phrase in <strong>, or splitting a paragraph
// into several elements, shrinks the innermost container without removing a
// character, and must not pass) AND its innermost container lost words or is
// gone — whether or not the named phrase survives, since rewording the phrase
// out while growing the passage is not a reduction.
//
// ── AC-08 relies on a text fragment ──────────────────────────────────────────
// "reduce the text" is verified by visible word count, which only applies when
// the model names a TEXT fragment in supersedes. The remove semantics tell the
// model so. Image/element shrinkage satisfies remove only when every supersedes
// fragment is an image.
//
// ── Worked constrain example (party-ba) ──────────────────────────────────────
// Instruction: "make the headline smaller".
// Envelope:    classes ["constrain"], supersedes [],
//              constrains [{"fragment": "#headline", "direction": "decrease"}].
// before:      h1#headline fontSizePx 96, box 900×200.
//   ✓ after: h1#headline 72px, box 900×150, nothing else changed → ok.
//   ✗ after: h1#headline 140px → miss: font-size moved in the wrong direction.
//   ✗ after: headline at 72px but a "NEW" badge added → miss: constrain was the
//     only class, and elements and text were added.
//   ✗ after: headline untouched (with or without other clauses applied) → miss.
// Measured attributes: fontSizePx, box area, text length, word count. A bound on
// anything else (colour, weight, spacing) is not measurable from facts; the
// semantics steer those instructions to `add`, which the model verifier checks.
// The bound's VALUE ("under 12 words") is not checked — only its direction.
//
// Pure — no I/O.

export const INSTRUCTION_CLASS_KEYS = ['add', 'replace', 'remove', 'constrain'] as const
export type InstructionClass = (typeof INSTRUCTION_CLASS_KEYS)[number]

// The class every ambiguous, defaulted or downgraded classification resolves to
// (FR-05): it preserves all existing content.
export const PRESERVING_CLASS: InstructionClass = 'add'

export type ConstrainDirection = 'decrease' | 'increase'
export interface ConstrainTarget {
  fragment: string
  direction?: ConstrainDirection
}

// ── DomFacts — the contract the T14 extractor implements ─────────────────────

export interface DomElementFact {
  tag: string // lowercase tag name
  id: string | null
  classes: string[] // class tokens, in attribute order
  // Rendered visible text of the element's subtree (innerText), whitespace
  // collapsed. Ancestors therefore contain their descendants' text; the
  // innermost container of a phrase is the one with the shortest text.
  text: string
  // Image sources ON THIS ELEMENT: <img> currentSrc/src, and every url(…) in
  // its computed background-image. Resolved URLs. Data URIs that the model saw
  // as __INLINE_ASSET_n__ tokens must be reported as those tokens, so the
  // model's fragment vocabulary and the facts' vocabulary agree.
  imageSources: string[]
  fontSizePx: number | null // computed font-size, rounded to an integer
  box: { width: number; height: number } | null // rendered size, rounded to integers
}

export interface DomFacts {
  // All visible text of the rendered document (body innerText), whitespace
  // collapsed.
  text: string
  // Every image source in the rendered document, in document order, duplicates
  // kept (an image used twice is two sources).
  imageSources: string[]
  // Count of rendered (display != none) elements under <body>.
  elementCount: number
  // Every rendered element that carries visible text or an image source, in
  // document (pre-)order — an element's descendants immediately follow it. The
  // leaf test in this module relies on that order.
  elements: DomElementFact[]
}

export interface PostConditionInput {
  before: DomFacts
  after: DomFacts
  supersedes: string[]
  constrains: ConstrainTarget[]
  // Every class the instruction carried (after effectiveClasses), including the
  // one being checked.
  classes: InstructionClass[]
}

export type PostConditionResult = { ok: true } | { ok: false; reason: string }
// The table is passed in so that per-class flags (`additive`) are read from the
// same table the prompt was rendered from.
export type PostCondition = (input: PostConditionInput, table: InstructionClassTable) => PostConditionResult

export interface InstructionClassDefinition {
  semantics: string
  postCondition: PostCondition | null
  // Deletes content; permitted only with a non-empty supersedes (FR-04 —
  // enforced by the route via effectiveClasses).
  destructive: boolean
  // Legitimately grows the document; while one is co-present, the other
  // classes' whole-document growth/shrink checks stand down.
  additive: boolean
}

export type InstructionClassTable = Readonly<Record<InstructionClass, InstructionClassDefinition>>

// ── Text / fragment helpers ──────────────────────────────────────────────────

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()
const fold = (s: string) => collapse(s).toLowerCase()
const textLength = (s: string) => collapse(s).length
const wordCount = (s: string) => (collapse(s) ? collapse(s).split(' ').length : 0)

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole
  })
}

// Strip a CSS url(…) wrapper and surrounding quotes from an image fragment.
function unwrapUrl(fragment: string): string {
  const m = /^url\(\s*(['"]?)(.*?)\1\s*\)$/i.exec(fragment)
  return (m ? m[2] : fragment).replace(/^['"]|['"]$/g, '')
}

const isTokenFragment = (f: string) => /^[#.][\w-]+$/.test(f)

function tokenElements(facts: DomFacts, token: string): DomElementFact[] {
  const name = token.slice(1)
  return facts.elements.filter((e) => (token.startsWith('#') ? e.id === name : e.classes.includes(name)))
}

// Innermost element(s) containing a folded phrase, and their text length.
function innermost(facts: DomFacts, phrase: string): { elements: DomElementFact[]; length: number | null } {
  let best: number | null = null
  let els: DomElementFact[] = []
  for (const e of facts.elements) {
    if (!fold(e.text).includes(phrase)) continue
    const len = textLength(e.text)
    if (best === null || len < best) {
      best = len
      els = [e]
    } else if (len === best) els.push(e)
  }
  return { elements: els, length: best }
}

const unique = <T>(xs: T[]) => [...new Set(xs)]

// A leaf carries text of its own rather than only its descendants' text.
// DomFacts has no parent links, but `elements` is in pre-order, so an
// element's descendants are the contiguous run right after it. The scan walks
// that run and stops at the first element that cannot be a descendant:
//   - its text is not contained in the element's text, or
//   - the document text shows it FOLLOWING the element (the element's text
//     immediately followed by its own) — a next sibling such as a "SEATS" label
//     right after a "LIMITED SEATS" badge.
// Inside the run, a non-empty strictly shorter text means the element wraps a
// child's text: a container, not a leaf. Unrelated labels elsewhere in the
// document no longer matter.
function isLeaf(facts: DomFacts, el: DomElementFact): boolean {
  const t = fold(el.text)
  if (!t) return false
  const doc = fold(facts.text)
  const i = facts.elements.indexOf(el)
  for (let j = i + 1; j < facts.elements.length; j++) {
    const ot = fold(facts.elements[j].text)
    if (!t.includes(ot)) break
    if (ot && (doc.includes(`${t} ${ot}`) || doc.includes(t + ot))) break
    if (ot.length > 0 && ot.length < t.length) return false
  }
  return true
}

// What a fragment identified in `before`.
interface ResolvedFragment {
  raw: string
  kind: 'token' | 'image' | 'text'
  // Image content. `imageSubstring` = match any source containing one of these
  // (a URL/filename fragment); otherwise exact sources (a token's images).
  images: string[]
  imageSubstring: boolean
  phrase: string | null // folded phrase (text kind)
  passages: string[] // folded text content that must not survive intact
  elements: DomElementFact[] // the elements identified (constrain targets)
}

function resolveFragment(facts: DomFacts, rawFragment: string): ResolvedFragment | null {
  const raw = rawFragment.trim()
  const needle = decodeHtmlEntities(raw).trim()
  if (!needle) return null

  if (isTokenFragment(needle)) {
    const els = tokenElements(facts, needle)
    if (els.length > 0) {
      const images = unique(els.flatMap((e) => e.imageSources))
      const passages = unique(
        els.filter((e) => e.imageSources.length === 0 || isLeaf(facts, e)).map((e) => fold(e.text)).filter(Boolean),
      )
      return { raw, kind: 'token', images, imageSubstring: false, phrase: null, passages, elements: els }
    }
  }

  const url = unwrapUrl(needle)
  if (url && facts.imageSources.some((s) => s.includes(url))) {
    const els = facts.elements.filter((e) => e.imageSources.some((s) => s.includes(url)))
    return { raw, kind: 'image', images: [url], imageSubstring: true, phrase: null, passages: [], elements: els }
  }

  const phrase = fold(needle)
  if (fold(facts.text).includes(phrase)) {
    const { elements } = innermost(facts, phrase)
    const passages = elements.length ? unique(elements.map((e) => fold(e.text))) : [phrase]
    return { raw, kind: 'text', images: [], imageSubstring: false, phrase, passages, elements }
  }
  return null
}

function imagesPresent(after: DomFacts, r: ResolvedFragment): boolean {
  return r.imageSubstring
    ? after.imageSources.some((s) => r.images.some((u) => s.includes(u)))
    : after.imageSources.some((s) => r.images.includes(s))
}

const passageIntact = (after: DomFacts, r: ResolvedFragment) => r.passages.some((p) => fold(after.text).includes(p))

// The identified content is entirely gone from `after`.
function contentAbsent(after: DomFacts, r: ResolvedFragment): boolean {
  if (imagesPresent(after, r)) return false
  if (r.kind === 'text') return !fold(after.text).includes(r.phrase!)
  return !passageIntact(after, r)
}

// The identified content is gone, or (text) shortened such that the original
// passage no longer survives intact.
function contentReduced(before: DomFacts, after: DomFacts, r: ResolvedFragment): boolean {
  if (imagesPresent(after, r)) return false
  if (r.passages.length === 0) return true // image-only content, and it is gone
  if (passageIntact(after, r)) return false // re-wrapped or split, not reduced
  const words = (els: DomElementFact[]) => els.reduce((n, e) => n + wordCount(e.text), 0)
  if (r.kind === 'text') {
    // The phrase crossed element boundaries: only its disappearance counts.
    if (r.elements.length === 0) return !fold(after.text).includes(r.phrase!)
    // Each innermost container must lose words or be gone — whether or not the
    // named phrase survives (rewording it out while growing the passage is not
    // a reduction).
    return r.elements.every((e) => {
      const now = counterpart(before, after, e, r.raw, 'text')
      return !now || wordCount(now.text) < wordCount(e.text)
    })
  }
  // Token with text content: the element is gone, or its text lost words.
  const now = tokenElements(after, decodeHtmlEntities(r.raw))
  return now.length === 0 || words(now) < words(r.elements)
}

const hasText = (r: ResolvedFragment) => r.passages.length > 0

const shapeKey = (e: DomElementFact) => [e.tag, ...e.classes].join('.')

// For a TEXT fragment: each shape (tag+classes) of its passage elements whose
// total word count, summed over EVERY element of that shape, did not strictly
// decrease. Splitting the passage into same-shape halves, or re-adding its
// phrase in a new same-shape element, cannot pass. Tokens are already measured
// over every element carrying them (contentReduced); image fragments carry no
// passage; a phrase that crossed element boundaries has no shape.
function shapesNotShrunk(before: DomFacts, after: DomFacts, r: ResolvedFragment): string[] {
  if (r.kind !== 'text') return []
  const total = (facts: DomFacts, key: string) =>
    facts.elements.filter((e) => shapeKey(e) === key).reduce((n, e) => n + wordCount(e.text), 0)
  return unique(r.elements.map(shapeKey)).flatMap((key) => {
    const w0 = total(before, key)
    const w1 = total(after, key)
    return w1 < w0 ? [] : [`${key} ${w0} → ${w1} words`]
  })
}
const quoted = (fs: string[]) => fs.map((f) => JSON.stringify(f)).join(', ')

const othersAdditive = (input: PostConditionInput, table: InstructionClassTable, self: InstructionClass) =>
  input.classes.some((c) => c !== self && table[c].additive)

// Resolves supersedes for a destructive class: non-empty, every fragment found
// in `before`.
function resolveSupersedes(cls: InstructionClass, input: PostConditionInput): ResolvedFragment[] | PostConditionResult {
  const fragments = input.supersedes.map((s) => s.trim()).filter(Boolean)
  if (fragments.length === 0) {
    return { ok: false, reason: `${cls}: no superseded element was named, so nothing can be ${cls === 'replace' ? 'replaced' : 'removed'}` }
  }
  const resolved = fragments.map((f) => resolveFragment(input.before, f))
  const missing = fragments.filter((_, i) => resolved[i] === null)
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `${cls}: ${quoted(missing)} does not appear in the original design — a supersedes entry must be copied verbatim from the current document`,
    }
  }
  return resolved as ResolvedFragment[]
}

// ── Constrain target measurement ─────────────────────────────────────────────

// The `after` element corresponding to a `before` element identified by a
// fragment. Returns null when it is gone.
//
// TEXT fragment (the element is the phrase's innermost container, the passage):
//   - phrase survives → the SHORTEST after element holding the phrase with the
//     same tag+classes as the passage — not an innermost <strong> wrapper or a
//     new pull-quote repeating it; the innermost holder only if none has that
//     shape;
//   - phrase gone → the same-tag+classes element sharing the most words with the
//     original passage, provided it shares at least half of them (an inserted
//     caption ahead of it is not the passage); else the same id; else gone.
// Other fragments: same id; else the same tag+classes at the same ordinal; else
// the fragment re-resolved in after.
function counterpart(
  before: DomFacts,
  after: DomFacts,
  el: DomElementFact,
  fragment: string,
  kind: ResolvedFragment['kind'],
): DomElementFact | null {
  const sameShape = (e: DomElementFact) => e.tag === el.tag && e.classes.join(' ') === el.classes.join(' ')
  const again = resolveFragment(after, fragment)

  if (kind === 'text') {
    const phrase = fold(decodeHtmlEntities(fragment).trim())
    const holders = after.elements.filter((e) => fold(e.text).includes(phrase))
    if (holders.length > 0) {
      const same = holders.filter(sameShape).sort((a, b) => textLength(a.text) - textLength(b.text))[0]
      return same ?? (again?.kind === 'text' ? again.elements[0] : undefined) ?? holders[0]
    }
    const passageWords = new Set(fold(el.text).split(' ').filter(Boolean))
    // DISTINCT shared words — a newcomer repeating one passage word is not the passage.
    const overlap = (e: DomElementFact) => new Set(fold(e.text).split(' ').filter((w) => passageWords.has(w))).size
    const best = after.elements.filter(sameShape).sort((a, b) => overlap(b) - overlap(a))[0]
    if (best && overlap(best) * 2 >= passageWords.size) return best
    if (el.id) return after.elements.find((e) => e.id === el.id) ?? null
    return null
  }

  if (el.id) return after.elements.find((e) => e.id === el.id) ?? null
  const ordinal = before.elements.filter(sameShape).indexOf(el)
  const candidate = after.elements.filter(sameShape)[ordinal]
  if (candidate) return candidate
  return again?.elements[0] ?? null
}

function measures(e: DomElementFact): Record<string, number | null> {
  return {
    'font-size': e.fontSizePx,
    'box area': e.box ? e.box.width * e.box.height : null,
    'text length': textLength(e.text),
    'word count': wordCount(e.text),
  }
}

// null = the target satisfies the bound; otherwise the reason it does not.
function targetMiss(was: DomElementFact, now: DomElementFact, direction?: ConstrainDirection): string | null {
  const a = measures(was)
  const b = measures(now)
  const up: string[] = []
  const down: string[] = []
  for (const k of Object.keys(a)) {
    if (a[k] === null || b[k] === null) continue
    if (b[k]! > a[k]!) up.push(`${k} ${a[k]}→${b[k]}`)
    if (b[k]! < a[k]!) down.push(`${k} ${a[k]}→${b[k]}`)
  }
  if (up.length === 0 && down.length === 0) return 'is unchanged (font-size, size, text length and word count all identical)'
  if (direction === 'decrease' && (up.length > 0 || down.length === 0)) return `did not decrease (${[...up, ...down].join(', ')})`
  if (direction === 'increase' && (down.length > 0 || up.length === 0)) return `did not increase (${[...up, ...down].join(', ')})`
  return null
}

// ── Post-conditions ──────────────────────────────────────────────────────────

// replace: every superseded fragment's content was present before and is
// absent after. The element may be reused (same .bg, new image). When remove
// is co-present the one flat supersedes list serves both clauses, so a text
// fragment that was shortened (per contentReduced) also satisfies replace; an
// image must still be gone.
const supersededElementAbsent: PostCondition = (input) => {
  const resolved = resolveSupersedes('replace', input)
  if (!Array.isArray(resolved)) return resolved
  const withRemove = input.classes.includes('remove')
  const kept = resolved.filter((r) =>
    withRemove ? !contentReduced(input.before, input.after, r) : !contentAbsent(input.after, r),
  )
  return kept.length === 0
    ? { ok: true }
    : {
        ok: false,
        reason: `replace: the content of ${quoted(kept.map((r) => r.raw))} is still present after the edit — the superseded content must be gone, not kept alongside the new one`,
      }
}

// remove: every named fragment's content is reduced, AND the document shrank:
//   - if any fragment carries text → visible WORD COUNT strictly lower;
//   - if every fragment is image-only → fewer image sources or fewer elements.
// While an additive class is co-present the whole document may legitimately
// grow, so that check is replaced by one scoped to each TEXT passage's shape:
// the words across all elements with the passage's tag+classes must strictly
// decrease. The per-fragment check (which requires the original passage to be
// broken, not merely re-wrapped) always applies.
const targetTextShorter: PostCondition = (input, table) => {
  const resolved = resolveSupersedes('remove', input)
  if (!Array.isArray(resolved)) return resolved
  const { before, after } = input
  const unreduced = resolved.filter((r) => !contentReduced(before, after, r))
  if (unreduced.length > 0) {
    return {
      ok: false,
      reason: `remove: ${quoted(unreduced.map((r) => r.raw))} was neither removed nor shortened by whole words (the original passage is still intact, or its element lost no words)`,
    }
  }
  if (othersAdditive(input, table, 'remove')) {
    // The whole document may grow (the add/replace clause), so the count is
    // scoped to the elements shaped like each named passage.
    const grown = resolved.flatMap((r) => shapesNotShrunk(before, after, r).map((d) => `${JSON.stringify(r.raw)} (${d})`))
    return grown.length === 0
      ? { ok: true }
      : {
          ok: false,
          reason: `remove: the text shaped like the named passage did not lose words overall — ${grown.join(', ')}; shortened text must not be split up or repeated in another element of the same kind`,
        }
  }
  if (resolved.some(hasText)) {
    const w0 = wordCount(before.text)
    const w1 = wordCount(after.text)
    return w1 < w0
      ? { ok: true }
      : { ok: false, reason: `remove: the visible word count did not go down (${w0} → ${w1}) — removed text must not be replaced by new text elsewhere` }
  }
  const shrank = after.imageSources.length < before.imageSources.length || after.elementCount < before.elementCount
  return shrank
    ? { ok: true }
    : {
        ok: false,
        reason: `remove: the design is not smaller (${before.imageSources.length} → ${after.imageSources.length} images, ${before.elementCount} → ${after.elementCount} elements)`,
      }
}

// constrain: every named target changed measurably, in the stated direction;
// and, when constrain is the only class, nothing was added (no new image
// source, element count not increased, visible text not longer).
const boundedAttributeHolds: PostCondition = (input) => {
  const { before, after } = input
  const targets = input.constrains.filter((t) => t.fragment.trim())
  if (targets.length === 0) return { ok: false, reason: 'constrain: no target was named, so the bound cannot be checked' }

  for (const t of targets) {
    const r = resolveFragment(before, t.fragment)
    if (!r || r.elements.length === 0) {
      return { ok: false, reason: `constrain: target ${JSON.stringify(t.fragment)} does not identify an element in the original design` }
    }
    for (const el of r.elements) {
      const now = counterpart(before, after, el, t.fragment, r.kind)
      if (!now) return { ok: false, reason: `constrain: target ${JSON.stringify(t.fragment)} is gone — a constrain must not delete` }
      const miss = targetMiss(el, now, t.direction)
      if (miss) return { ok: false, reason: `constrain: target ${JSON.stringify(t.fragment)} ${miss}` }
    }
  }

  if (input.classes.every((c) => c === 'constrain')) {
    const prior = new Set(before.imageSources)
    const newSources = after.imageSources.filter((s) => !prior.has(s))
    if (newSources.length > 0) {
      return { ok: false, reason: `constrain: a new image was added (${newSources.join(', ')}) — a constrain bounds existing content and never adds` }
    }
    if (after.elementCount > before.elementCount) {
      return { ok: false, reason: `constrain: elements were added (${before.elementCount} → ${after.elementCount}) — a constrain bounds existing content and never adds` }
    }
    if (textLength(after.text) > textLength(before.text)) {
      return {
        ok: false,
        reason: `constrain: visible text grew (${textLength(before.text)} → ${textLength(after.text)} chars) — a constrain bounds existing content and never adds`,
      }
    }
  }
  return { ok: true }
}

// ── The table ────────────────────────────────────────────────────────────────

export const INSTRUCTION_CLASSES: InstructionClassTable = {
  add: {
    semantics:
      'Add what the instruction asks for and preserve everything else — every existing element, image and line of text stays where it is. Also use add for changes to colour, weight, style or spacing. Example: "include a human character" → add a figure; the headline, copy, logo and background all remain.',
    postCondition: null,
    destructive: false,
    additive: true,
  },
  replace: {
    semantics:
      'Put new content in place of existing content. The superseded content — the old image, the old text — must be GONE from the result: not hidden, not layered underneath, not moved to another element, not kept alongside the new one. You may reuse the same element (for example, swap the image on the same background element). List what is replaced in supersedes. Example: "use the uploaded image as the background" → supersedes ["<the current background image URL, copied exactly from its url(...) or src>"].',
    postCondition: supersededElementAbsent,
    destructive: true,
    additive: true,
  },
  remove: {
    semantics:
      'Delete or shorten the named content. The result must contain measurably less: removed content is gone, shortened text loses whole words, and nothing new is added elsewhere to compensate. List each thing you remove or shorten in supersedes. For a text reduction, name a TEXT phrase from each passage you shorten — text reductions are checked by word count, and only when a text phrase is named. Example: "reduce the text" → supersedes ["<a phrase unique to each passage you shorten>"]; each of those passages must come out shorter.',
    postCondition: targetTextShorter,
    destructive: true,
    additive: false,
  },
  constrain: {
    semantics:
      'Bound a measurable size or length of existing content — font size, element size, text length or word count — without adding anything: no new elements, images or text. Name the target in constrains with the direction of the change; a text phrase used as the target must still be present after your edit. Examples: "make the headline smaller" → constrains [{"fragment": "<the headline\'s #id, .class or a phrase of its text>", "direction": "decrease"}] and reduce its font-size; "keep the body text under 12 words" → constrains [{"fragment": "<a phrase of the body text>", "direction": "decrease"}]. supersedes stays empty — a constrain deletes nothing.',
    postCondition: boundedAttributeHolds,
    destructive: false,
    additive: false,
  },
}

// ── Fragment rules — stated once, rendered into the prompt ───────────────────

export const FRAGMENT_RULE = `A fragment is copied verbatim from the CURRENT document and must identify one thing in it specifically enough that the verifier can find it: an image URL exactly as it appears in src="…" or url(…), an element's id or class written as #id or .class, or a phrase of visible text that is unique to that passage (a phrase appearing in several places identifies the wrong one).`

export const SUPERSEDES_RULE = `supersedes (required for replace and remove): a list of fragments, one for each piece of content you replace or remove. Example: ["https://example.com/images/old-background.png", ".promo-badge", "Limited seats available"]. With no supersedes entry, replace and remove are not permitted and nothing will be deleted.`

export const CONSTRAINS_RULE = `constrains (required for constrain): a list of {"fragment": …, "direction": "decrease" | "increase"}, one for each element whose size or length you bound. Example: [{"fragment": "#headline", "direction": "decrease"}]. With no constrains entry, a constrain is treated as add.`

// ── Consumers ────────────────────────────────────────────────────────────────

// Renders the class semantics block for the refine prompt (wired in by T17).
// The table is a parameter so AC-19 is testable: editing the table edits this.
export function renderClassSemantics(table: InstructionClassTable = INSTRUCTION_CLASSES): string {
  const lines = INSTRUCTION_CLASS_KEYS.map((k) => `- ${k}: ${table[k].semantics}`)
  return `Instruction classes — classify the instruction before editing. It is one or more of these; a multi-clause instruction gets every class it contains, and each one must be satisfied:
${lines.join('\n')}

If you cannot cleanly classify the instruction, or cannot split a multi-clause instruction into these classes, use ${PRESERVING_CLASS} — the preserving class. Never guess a destructive class.

${FRAGMENT_RULE}

${SUPERSEDES_RULE}

${CONSTRAINS_RULE}`
}

// Runs every class's post-condition from the table (the verifier consumer;
// classes with a null post-condition — add — are skipped for the model verifier).
export function checkPostConditions(
  input: PostConditionInput,
  table: InstructionClassTable = INSTRUCTION_CLASSES,
): Array<{ class: InstructionClass; result: PostConditionResult }> {
  return input.classes.flatMap((c) => {
    const pc = table[c].postCondition
    return pc ? [{ class: c, result: pc(input, table) }] : []
  })
}
