// Parses the refine model's reply envelope (change 004 Phase 2, FR-01).
//
// The refine call returns its instruction classification and the edited
// document in ONE response — there is no separate classifier call.
//
// ── Wire format ──────────────────────────────────────────────────────────────
// A small JSON header, then the complete HTML document:
//
//   ```json
//   {"classes": ["replace"], "supersedes": ["https://…/old-background.png"]}
//   ```
//   <!DOCTYPE html>
//   <html>…</html>
//
//   - `classes`    — one or more of add | replace | remove | constrain
//                    (instructionClasses.ts). Order is kept.
//   - `supersedes` — verbatim fragments of the ORIGINAL document naming what a
//                    replace/remove deletes (see instructionClasses.ts).
//   - The header comes BEFORE the document. The code fence is optional.
//
// Why this shape: the document is never inside JSON. A 50 KB HTML string in a
// JSON field would have to survive the model's JSON-escaping of every quote and
// newline; one slip and the whole reply is lost. Instead the document is cut by
// extractHtmlDocument — the same boundary every other design surface uses, which
// already tolerates chat narration and code fences (the 2026-08-03 preamble
// incident). The header is looked for only OUTSIDE that cut: first in the text
// before the document (the last JSON object there carrying `classes` or
// `supersedes`), then, as a fallback for a model that put it last, in the text
// after it. JSON inside the document (a <script type="application/json">, CSS
// braces) is never read as the envelope.
//
// ── Defaults (FR-05) ─────────────────────────────────────────────────────────
// No header, unparseable JSON, a missing/non-array `classes`, or no known class
// value surviving → classes ['add'] (the preserving class) with
// classificationDefaulted: true. Unknown class values are dropped; values are
// matched case- and whitespace-insensitively. A missing `supersedes` → [].
// No HTML document at all → null (the caller treats the refine as failed).
//
// The parser does NOT enforce FR-04 (destructive classes need a named element).
// That is the route's decision; effectiveClasses() is the helper it calls.
//
// Pure — no I/O.

import { extractHtmlDocument } from '@/lib/agent/htmlDocument'
import {
  INSTRUCTION_CLASSES,
  INSTRUCTION_CLASS_KEYS,
  PRESERVING_CLASS,
  type InstructionClass,
} from '@/lib/agent/instructionClasses'

export interface RefineEnvelope {
  classes: InstructionClass[] // never empty
  supersedes: string[]
  html: string
  // Narration around the envelope and document (header and fences removed),
  // for logging only — never rendered.
  discarded: string
  // True when the classification could not be read and was defaulted to
  // ['add'] (FR-05).
  classificationDefaulted: boolean
}

// ── Header location ──────────────────────────────────────────────────────────

interface Span {
  start: number
  end: number
}

// The end (exclusive) of the balanced JSON object starting at `start`, or -1.
// Braces inside JSON strings are skipped.
function balancedObjectEnd(text: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return i + 1
  }
  return -1
}

interface Header {
  value: Record<string, unknown>
  span: Span
}

// Every JSON object in `text` that parses and carries `classes` or
// `supersedes`, in order. Each '{' is tried as a start independently, so an
// unbalanced brace in narration cannot swallow the envelope that follows it.
function findHeaders(text: string): Header[] {
  const found: Header[] = []
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    const end = balancedObjectEnd(text, start)
    if (end === -1) continue
    let value: unknown
    try {
      value = JSON.parse(text.slice(start, end))
    } catch {
      continue
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && ('classes' in value || 'supersedes' in value)) {
      found.push({ value: value as Record<string, unknown>, span: { start, end } })
      start = end - 1 // do not re-find objects nested inside this one
    }
  }
  return found
}

// ── Field normalisation ──────────────────────────────────────────────────────

const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : [])

function normaliseClasses(v: unknown): InstructionClass[] {
  const out: InstructionClass[] = []
  for (const item of asList(v)) {
    if (typeof item !== 'string') continue
    const key = item.trim().toLowerCase()
    if ((INSTRUCTION_CLASS_KEYS as readonly string[]).includes(key) && !out.includes(key as InstructionClass)) {
      out.push(key as InstructionClass)
    }
  }
  return out
}

function normaliseSupersedes(v: unknown): string[] {
  const out: string[] = []
  for (const item of asList(v)) {
    if (typeof item !== 'string') continue
    const s = item.trim()
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

const FENCE_LINE_RE = /^[ \t]*```[\w-]*[ \t]*$/gm
const withoutSpan = (text: string, span?: Span) => (span ? text.slice(0, span.start) + text.slice(span.end) : text)

// ── Parser ───────────────────────────────────────────────────────────────────

export function parseRefineEnvelope(raw: string): RefineEnvelope | null {
  const doc = extractHtmlDocument(raw)
  if (!doc || !doc.html) return null

  // extractHtmlDocument's html is a slice of raw beginning at the first
  // doctype/<html> match, so its first occurrence is exactly where it was cut.
  const at = raw.indexOf(doc.html)
  const before = raw.slice(0, at)
  const after = raw.slice(at + doc.html.length)

  const beforeHeader = findHeaders(before).at(-1)
  const afterHeader = beforeHeader ? undefined : findHeaders(after)[0]
  const header = beforeHeader ?? afterHeader

  const classes = normaliseClasses(header?.value.classes)
  const supersedes = normaliseSupersedes(header?.value.supersedes)
  const discarded = `${withoutSpan(before, beforeHeader?.span)}\n${withoutSpan(after, afterHeader?.span)}`
    .replace(FENCE_LINE_RE, '')
    .trim()

  const classificationDefaulted = classes.length === 0
  return {
    classes: classificationDefaulted ? [PRESERVING_CLASS] : classes,
    supersedes,
    html: doc.html,
    discarded,
    classificationDefaulted,
  }
}

// ── FR-04 helper for the route ───────────────────────────────────────────────

export interface EffectiveClasses {
  classes: InstructionClass[]
  // Destructive classes that were downgraded because supersedes named nothing.
  // Non-empty means the classification was ambiguous (FR-04 → FR-05).
  downgraded: InstructionClass[]
}

// A destructive class (replace/remove) with no named superseded element is not
// permitted: it becomes the preserving class, and the downgrade is reported so
// the route can treat the classification as ambiguous (AC-10). Order is kept,
// duplicates collapse.
export function effectiveClasses(parsed: Pick<RefineEnvelope, 'classes' | 'supersedes'>): EffectiveClasses {
  const named = parsed.supersedes.some((s) => s.trim().length > 0)
  const classes: InstructionClass[] = []
  const downgraded: InstructionClass[] = []
  for (const c of parsed.classes) {
    const resolved = !named && INSTRUCTION_CLASSES[c].destructive ? PRESERVING_CLASS : c
    if (resolved !== c) downgraded.push(c)
    if (!classes.includes(resolved)) classes.push(resolved)
  }
  return { classes, downgraded }
}

// ── Prompt consumer ──────────────────────────────────────────────────────────

// The example reply shown to the model. Kept beside the parser, and parsed by
// the unit tests, so the protocol text and the parser cannot disagree.
export const REFINE_ENVELOPE_EXAMPLE = `\`\`\`json
{"classes": ["replace"], "supersedes": ["https://example.com/images/old-background.png"]}
\`\`\`
<!DOCTYPE html>
<html>…the complete updated document…</html>`

// The output-protocol lines for the refine prompt (wired in by T17, next to
// instructionClasses.renderClassSemantics()).
export function renderEnvelopeProtocol(): string {
  return `Reply format — two parts, in this order, and nothing else:
1. A JSON header on its own, before the HTML document: {"classes": [...], "supersedes": [...]}. "classes" lists every class the instruction contains, from: ${INSTRUCTION_CLASS_KEYS.join(', ')}. "supersedes" lists the verbatim fragments of the current document that a replace or remove deletes; use [] when nothing is deleted.
2. The complete updated HTML document, starting with <!DOCTYPE html> and ending with </html>. Never put the HTML inside the JSON.
Example:
${REFINE_ENVELOPE_EXAMPLE}`
}
