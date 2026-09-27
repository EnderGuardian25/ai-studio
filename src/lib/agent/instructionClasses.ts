// The per-class instruction table for AGUI refine (change 004 Phase 2).
//
// A refine instruction is one or more of four classes — add / replace / remove /
// constrain — declared by the refine model in its reply envelope
// (refineEnvelope.ts). This module is the ONLY definition of what each class
// means. It has two consumers:
//
//   - the refine prompt renders each class's `semantics` (renderClassSemantics),
//   - the verifier runs each class's `postCondition` against facts extracted
//     from the rendered DOM before and after the edit.
//
// Because both read the same object, editing a class here changes the prompt
// AND the verification criteria together (FR-06, AC-19). Do not restate the
// semantics anywhere else.
//
// ── Post-conditions ──────────────────────────────────────────────────────────
// Post-conditions are pure functions over DomFacts — never over raw HTML. The
// fact extractor runs against the rendered DOM in Chromium (T14) and produces
// the DomFacts shape defined below. `add` has no deterministic post-condition
// (nothing measurable says "a human character is now present"), so it is
// verified by a model call that also receives DomFacts (FR-09).
//
// Every post-condition takes the full set of classes the instruction carried,
// because multi-clause instructions (AC-11) are verified class by class over the
// SAME document: "make the headline smaller and add a logo" is constrain + add,
// and constrain's "nothing was added" check would reject the logo the add clause
// asked for. Where a co-present class legitimately grows the document, the
// growth checks of the other classes stand down; the per-fragment checks never
// do.
//
// ── supersedes fragments ─────────────────────────────────────────────────────
// `supersedes` entries are verbatim identifying fragments copied from the
// ORIGINAL document, one of:
//   - an image URL, as in src="…" or CSS url(…)  — matched as a substring of an
//     extracted image source, so a filename or relative path also matches; a
//     `url('…')` wrapper and quotes are tolerated
//   - `#id` or `.class`                          — matched against element ids /
//     class tokens, or as visible text (a hashtag like "#IRP"); never as an
//     image-URL substring
//   - a phrase of visible text                   — matched case- and
//     whitespace-insensitively (rendered text honours text-transform, so an
//     uppercase headline renders differently from its source)
// A fragment is "present" in a set of facts if any of the applicable matchers
// hits. A fragment that is not present in `before` is always a miss: the model
// named something that is not there, so its absence afterwards proves nothing.
//
// ── Worked constrain example (party-ba) ──────────────────────────────────────
// Instruction: "make the headline smaller".
// Envelope:    classes ["constrain"], supersedes [] — nothing is deleted.
// before:      h1#headline fontSizePx 96, 4 elements, 2 image sources.
//   ✓ after: h1#headline fontSizePx 72, same elements, same images, same text
//     → ok: nothing added, and something measurably changed.
//   ✗ after: headline at 72px but a "NEW" badge span added → miss: the element
//     count and the visible text grew — a constrain bounds, it never adds.
//   ✗ after: identical facts → miss: the design is unchanged, so the bound was
//     not applied (the silent-failure class this change exists to catch).
// What is NOT measured: the bound itself (that the headline is "smaller", or
// that "the body is under 12 words"). The bound's target and value live in the
// instruction's prose; checking them needs either a model or a structured bound
// field in the envelope. Facts support "nothing added" and "something changed",
// and those are what is checked. The known false negative is a constrain that
// is already satisfied ("keep it under 20 words" when it is) — that no-op is a
// miss, recoverable through "Use anyway" (FR-14a).
//
// Pure — no I/O.

export const INSTRUCTION_CLASS_KEYS = ['add', 'replace', 'remove', 'constrain'] as const
export type InstructionClass = (typeof INSTRUCTION_CLASS_KEYS)[number]

// The class every ambiguous or defaulted classification resolves to (FR-05):
// it preserves all existing content.
export const PRESERVING_CLASS: InstructionClass = 'add'

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
  // model's supersedes vocabulary and the facts' vocabulary agree.
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
  // document order. Document order matters: it is compared for the no-op check.
  elements: DomElementFact[]
}

export interface PostConditionInput {
  before: DomFacts
  after: DomFacts
  supersedes: string[]
  // Every class the instruction carried (after effectiveClasses), including the
  // one being checked.
  classes: InstructionClass[]
}

export type PostConditionResult = { ok: true } | { ok: false; reason: string }
export type PostCondition = (input: PostConditionInput) => PostConditionResult

export interface InstructionClassDefinition {
  semantics: string
  postCondition: PostCondition | null
  // Destructive classes delete content and are permitted only with a non-empty
  // supersedes (FR-04 — enforced by the route via effectiveClasses).
  destructive: boolean
}

// ── Fact helpers ─────────────────────────────────────────────────────────────

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()
const fold = (s: string) => collapse(s).toLowerCase()
const textLength = (facts: DomFacts) => collapse(facts.text).length

// Strip a CSS url(…) wrapper and surrounding quotes from an image fragment.
function unwrapUrl(fragment: string): string {
  const m = /^url\(\s*(['"]?)(.*?)\1\s*\)$/i.exec(fragment)
  return (m ? m[2] : fragment).replace(/^['"]|['"]$/g, '')
}

function isTokenFragment(fragment: string): boolean {
  return /^[#.][\w-]+$/.test(fragment)
}

function imagePresent(facts: DomFacts, fragment: string): boolean {
  const url = unwrapUrl(fragment)
  return url.length > 0 && facts.imageSources.some((src) => src.includes(url))
}

function tokenPresent(facts: DomFacts, fragment: string): boolean {
  if (!isTokenFragment(fragment)) return false
  const name = fragment.slice(1)
  return fragment.startsWith('#')
    ? facts.elements.some((e) => e.id === name)
    : facts.elements.some((e) => e.classes.includes(name))
}

function textPresent(facts: DomFacts, fragment: string): boolean {
  const needle = fold(fragment)
  return needle.length > 0 && fold(facts.text).includes(needle)
}

// A #id/.class-shaped fragment is matched as a token or as text (a hashtag such
// as "#IRP" is visible text) — never as an image-URL substring, where ".logo"
// would hit an unrelated "brand.logo.svg".
function fragmentPresent(facts: DomFacts, fragment: string): boolean {
  if (isTokenFragment(fragment)) return tokenPresent(facts, fragment) || textPresent(facts, fragment)
  return imagePresent(facts, fragment) || textPresent(facts, fragment)
}

// Length of the innermost element whose text contains the phrase, or null when
// no element contains it.
function containerLength(facts: DomFacts, fragment: string): number | null {
  const needle = fold(fragment)
  let best: number | null = null
  for (const e of facts.elements) {
    if (!fold(e.text).includes(needle)) continue
    const len = collapse(e.text).length
    if (best === null || len < best) best = len
  }
  return best
}

// A fragment is "reduced" when it is absent afterwards, or — for a visible-text
// phrase that survives — when its innermost container's text got shorter.
function fragmentReduced(before: DomFacts, after: DomFacts, fragment: string): boolean {
  if (!fragmentPresent(after, fragment)) return true
  if (!textPresent(after, fragment)) return false // a surviving image or #id/.class: not reduced
  if (isTokenFragment(fragment) ? tokenPresent(after, fragment) : imagePresent(after, fragment)) return false
  const was = containerLength(before, fragment)
  const now = containerLength(after, fragment)
  return was !== null && now !== null && now < was
}

function namedFragments(supersedes: string[]): string[] {
  return supersedes.map((s) => s.trim()).filter((s) => s.length > 0)
}

// Common preamble for the destructive classes: a non-empty list, and every
// fragment present in the original.
function checkNamed(cls: InstructionClass, input: PostConditionInput): PostConditionResult | string[] {
  const fragments = namedFragments(input.supersedes)
  if (fragments.length === 0) {
    return { ok: false, reason: `${cls}: no superseded element was named, so nothing can be ${cls === 'replace' ? 'replaced' : 'removed'}` }
  }
  const missing = fragments.filter((f) => !fragmentPresent(input.before, f))
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `${cls}: ${missing.map((f) => JSON.stringify(f)).join(', ')} does not appear in the original design — a supersedes entry must be copied verbatim from the current document`,
    }
  }
  return fragments
}

const ADDITIVE: InstructionClass[] = ['add', 'replace']
const hasAdditive = (classes: InstructionClass[], self: InstructionClass) =>
  classes.some((c) => c !== self && ADDITIVE.includes(c))

function factsFingerprint(facts: DomFacts): string {
  return JSON.stringify({
    text: collapse(facts.text),
    imageSources: facts.imageSources,
    elementCount: facts.elementCount,
    elements: facts.elements.map((e) => [e.tag, e.id, e.classes, collapse(e.text), e.imageSources, e.fontSizePx, e.box]),
  })
}

// ── Post-conditions ──────────────────────────────────────────────────────────

// replace: every superseded fragment was present before and is absent after.
// The replacing element is not checked here — the old element's absence is the
// half that failed in practice (the duplicate-image report, AC-09). When remove
// is co-present the one flat supersedes list serves both clauses, so a text
// phrase that was shortened rather than deleted also satisfies replace; an image
// or #id/.class fragment must still be gone.
const supersededElementAbsent: PostCondition = (input) => {
  const named = checkNamed('replace', input)
  if (!Array.isArray(named)) return named
  const withRemove = input.classes.includes('remove')
  const kept = named.filter((f) =>
    withRemove ? !fragmentReduced(input.before, input.after, f) : fragmentPresent(input.after, f),
  )
  return kept.length === 0
    ? { ok: true }
    : {
        ok: false,
        reason: `replace: ${kept.map((f) => JSON.stringify(f)).join(', ')} is still present after the edit — a replace must remove the element it supersedes, not keep it alongside the new one`,
      }
}

// remove: every named fragment is reduced (absent, or its innermost text
// container shorter), AND the document as a whole shrank — shorter visible
// text, fewer image sources, or fewer elements — so the removal was not
// compensated by adding content elsewhere. The whole-document check stands down
// when add/replace is co-present, since those clauses legitimately grow it.
const targetTextShorter: PostCondition = (input) => {
  const named = checkNamed('remove', input)
  if (!Array.isArray(named)) return named
  const { before, after } = input
  const unreduced = named.filter((f) => !fragmentReduced(before, after, f))
  if (unreduced.length > 0) {
    return {
      ok: false,
      reason: `remove: ${unreduced.map((f) => JSON.stringify(f)).join(', ')} was neither removed nor shortened`,
    }
  }
  if (hasAdditive(input.classes, 'remove')) return { ok: true }
  const shrank =
    textLength(after) < textLength(before) ||
    after.imageSources.length < before.imageSources.length ||
    after.elementCount < before.elementCount
  return shrank
    ? { ok: true }
    : {
        ok: false,
        reason: `remove: the design is not smaller overall (visible text ${textLength(before)} → ${textLength(after)} chars, ${before.elementCount} → ${after.elementCount} elements) — removed content must not be replaced by new content elsewhere`,
      }
}

// constrain: nothing was added — no new image source, element count not
// increased, visible text not longer — and something measurably changed. The
// nothing-added checks stand down when add/replace is co-present; the change
// check never does.
const boundedAttributeHolds: PostCondition = (input) => {
  const { before, after } = input
  if (!hasAdditive(input.classes, 'constrain')) {
    const prior = new Set(before.imageSources)
    const newSources = after.imageSources.filter((s) => !prior.has(s))
    if (newSources.length > 0) {
      return { ok: false, reason: `constrain: a new image was added (${newSources.join(', ')}) — a constrain bounds existing content and never adds` }
    }
    if (after.elementCount > before.elementCount) {
      return { ok: false, reason: `constrain: elements were added (${before.elementCount} → ${after.elementCount}) — a constrain bounds existing content and never adds` }
    }
    if (textLength(after) > textLength(before)) {
      return { ok: false, reason: `constrain: visible text grew (${textLength(before)} → ${textLength(after)} chars) — a constrain bounds existing content and never adds` }
    }
  }
  if (factsFingerprint(before) === factsFingerprint(after)) {
    return { ok: false, reason: 'constrain: the design is unchanged — no measurable change to size, text, or layout, so the bound was not applied' }
  }
  return { ok: true }
}

// ── The table ────────────────────────────────────────────────────────────────

export const INSTRUCTION_CLASSES: Readonly<Record<InstructionClass, InstructionClassDefinition>> = {
  add: {
    semantics:
      'Add what the instruction asks for and preserve everything else — every existing element, image and line of text stays where it is. Example: "include a human character" → add a figure; the headline, copy, logo and background all remain.',
    postCondition: null,
    destructive: false,
  },
  replace: {
    semantics:
      'Put a new element in place of an existing one. The element being replaced must be GONE from the result — not hidden, not layered underneath, not kept alongside the new one. List it in supersedes. Example: "use the uploaded image as the background" → supersedes ["<the current background image URL, copied exactly from its url(...) or src>"]; the old background must not remain anywhere in the document.',
    postCondition: supersededElementAbsent,
    destructive: true,
  },
  remove: {
    semantics:
      'Delete or shorten the named content. The result must contain measurably less: removed content is gone, shortened text is shorter, and nothing new is added elsewhere to compensate. List each thing you remove or shorten in supersedes. Example: "reduce the text" → supersedes ["<a phrase copied from each passage you shorten>"]; each of those passages must come out shorter.',
    postCondition: targetTextShorter,
    destructive: true,
  },
  constrain: {
    semantics:
      'Bound an attribute of existing content — size, length, count, spacing, emphasis — without adding anything: no new elements, no new images, no new text. The change must still be visible; leaving the design as it was does not satisfy a constrain. Examples: "make the headline smaller" → reduce the headline\'s font-size and change nothing else; "keep the body text under 12 words" → cut the body copy to 12 words or fewer without adding text anywhere. supersedes stays empty — a constrain deletes nothing.',
    postCondition: boundedAttributeHolds,
    destructive: false,
  },
}

// ── Prompt consumer ──────────────────────────────────────────────────────────

// Renders the class semantics block for the refine prompt (wired in by T17).
// The table is a parameter so AC-19 is testable: editing the table edits this.
export function renderClassSemantics(
  table: Readonly<Record<InstructionClass, InstructionClassDefinition>> = INSTRUCTION_CLASSES,
): string {
  const lines = INSTRUCTION_CLASS_KEYS.map((k) => `- ${k}: ${table[k].semantics}`)
  return `Instruction classes — classify the instruction before editing. It is one or more of these; a multi-clause instruction gets every class it contains, and each one must be satisfied:
${lines.join('\n')}

If you cannot cleanly classify the instruction, or cannot split a multi-clause instruction into these classes, use ${PRESERVING_CLASS} (or constrain) — the preserving classes. Never guess a destructive class.

supersedes (required for replace and remove): list each element you are replacing or removing as a verbatim fragment copied from the CURRENT document — an image URL exactly as it appears in src="…" or url(…), its id or class written as #id or .class, or a phrase of its visible text. Each entry must identify something that is in the current design, specifically enough that its absence can be checked. Example: ["https://example.com/images/old-background.png", ".promo-badge", "Limited seats available"]. With no supersedes entry, replace and remove are not permitted and nothing will be deleted.`
}
