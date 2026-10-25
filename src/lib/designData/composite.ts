// The pure verdict for a rendered composite element (025 FR-14). The renderer
// (src/lib/renderer/puppeteer.ts) collects the facts in the page; everything
// that decides is here, so the page carries no copy of the rules. Pure.

// How far the element's box may sit from the contract rect, per edge, in CSS px.
export const COMPOSITE_TOLERANCE_PX = 2

export interface CompositeRectPx {
  left: number
  top: number
  width: number
  height: number
}

// What the page reports about the composite element. `hits` has five entries:
// the centre and four points inset 10% from the corners; each is true when
// elementFromPoint there is the element or one of its children.
export interface CompositeFacts {
  found: boolean
  complete: boolean
  naturalWidth: number
  box: CompositeRectPx
  hits: readonly boolean[]
}

export type CompositeVerdict = { ok: true } | { ok: false; detail: string }

export function evaluateCompositeFacts(
  facts: CompositeFacts,
  rectPx: CompositeRectPx,
  tolerance: number = COMPOSITE_TOLERANCE_PX,
): CompositeVerdict {
  if (!facts.found) return { ok: false, detail: 'the composite element is not in the page' }
  if (!facts.complete) return { ok: false, detail: 'the screenshot image did not finish loading' }
  if (!(facts.naturalWidth > 0)) return { ok: false, detail: 'the screenshot image has no pixels' }
  const edge = (r: CompositeRectPx) => ({
    left: r.left,
    top: r.top,
    right: r.left + r.width,
    bottom: r.top + r.height,
  })
  const got = edge(facts.box)
  const want = edge(rectPx)
  for (const e of ['left', 'top', 'right', 'bottom'] as const) {
    if (!(Math.abs(got[e] - want[e]) <= tolerance)) {
      return { ok: false, detail: `the composite ${e} edge is at ${got[e]} px, expected ${want[e]} px` }
    }
  }
  if (facts.hits.length !== 5) return { ok: false, detail: 'the topmost check needs five points' }
  const missed = facts.hits.findIndex((h) => h !== true)
  if (missed !== -1) return { ok: false, detail: `something covers the composite element at point ${missed}` }
  return { ok: true }
}
