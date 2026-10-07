// Shared Folio class helpers for the brand kits admin (DESIGN_SYSTEM.md §5.2,
// §6, §8.2–§8.6, §8.14–§8.16, §9). Copied from the campaigns screens and the
// brief wizard on purpose: each screen group keeps its own copy until T13 adds
// a shared primitive.

// The §9 focus outline, for the raw <button>s and links these screens draw.
export const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

// A scroll container's focus outline, inset so its own overflow can't clip it.
export const SCROLL_FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus'

// Small caps (eyebrows, field and group labels, status words) — §5.2.
export const SMALL_CAPS = 'text-ui-2xs font-semibold uppercase tracking-[0.14em]'
export const EYEBROW = `${SMALL_CAPS} text-fg-muted`
export const FIELD_LABEL = `${SMALL_CAPS} text-fg-muted`

// Page title (§5.2): 42 px display, stepping down to 24 px below md.
export const PAGE_TITLE =
  "font-display font-normal text-ui-xl md:text-ui-2xl leading-[1.04] tracking-[-0.025em] [font-variation-settings:'opsz'_144]"
export const PAGE_LEAD = 'mt-3 text-ui-sm text-fg-muted'

// The open kit's name: the section-head style (§5.2 h2).
export const KIT_TITLE =
  "font-display text-ui-xl font-medium leading-tight tracking-[-0.01em] [font-variation-settings:'opsz'_48]"

// A numbered sub-section of the kit (§8.14's head at the h3 size): an italic
// --accent numeral, then the h3.
export const SECTION_NUMERAL = 'font-display italic text-ui-base text-accent'
export const SECTION_HEAD = 'font-display text-ui-lg font-medium leading-snug text-fg'

// A quiet icon-only button (§8.16): --fg-muted, a 30 px target, the §9 outline.
// Callers add the hover colour and always an aria-label.
export const ICON_BUTTON =
  'inline-flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-ui-sm text-fg-muted transition-colors duration-fast ease-standard disabled:cursor-not-allowed disabled:opacity-40'

// A UI tag (the template size, a font guess): not a status, so it is neutral —
// a hairline box, --fg text. Brand data never colours it.
export const TAG =
  'inline-flex max-w-full items-center gap-1 rounded-ui-sm border border-line-subtle bg-surface px-2 py-0.5 text-ui-xs text-fg'

// A compact field, the §8.3 field at --text-sm. Written out in full because
// `cn` is a plain join: overriding fieldClasses' padding would leave two
// competing utilities.
export const COMPACT_FIELD =
  'rounded-ui-sm border border-line bg-surface-raised px-2.5 py-1.5 font-text text-ui-sm text-fg placeholder:text-fg-muted transition-[border-color,box-shadow] duration-fast ease-standard focus:outline-none focus:border-focus focus:ring-1 focus:ring-focus disabled:cursor-not-allowed disabled:opacity-50'

// Icons (§8.16): 15 px, stroke 1.4, currentColor.
export const ICON = { size: 15, strokeWidth: 1.4 } as const
export const ICON_SM = { size: 12, strokeWidth: 1.4 } as const

// A ruled list row (the kit list): no box, a --line-subtle rule beneath.
// Selected: paper fill, --fg weight and a 2 px --accent bar at the left edge,
// as the sidebar marks the current page (§8.6).
export function rowCls(selected: boolean, extra = '') {
  return [
    'relative font-text border-b border-line-subtle',
    'transition-colors duration-fast ease-standard',
    'before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5',
    selected ? 'bg-surface-raised before:bg-accent' : 'hover:bg-surface before:bg-transparent',
    extra,
  ].join(' ')
}

// An option button (the template size). Idle: a 1 px --line control edge, --fg
// on hover. Selected: paper fill and a 2 px ink frame (§8.4's ink, as a card).
export function optionCls(selected: boolean, extra = '') {
  return [
    'rounded-ui-md border text-left font-text',
    'transition-[background-color,border-color,box-shadow] duration-fast ease-standard',
    FOCUS,
    selected
      ? 'bg-surface-raised border-fg ring-1 ring-inset ring-fg text-fg'
      : 'bg-transparent border-line text-fg-muted hover:border-fg hover:text-fg',
    extra,
  ].join(' ')
}

// A code field (the template's HTML/CSS): the §8.3 field in the mono face at
// --text-sm, written out in full for the same reason as COMPACT_FIELD.
export const CODE_FIELD =
  'w-full rounded-ui-sm border border-line bg-surface-raised px-3.5 py-2.5 font-mono text-ui-sm text-fg placeholder:text-fg-muted transition-[border-color,box-shadow] duration-fast ease-standard focus:outline-none focus:border-focus focus:ring-1 focus:ring-focus'

// The kit name while editing: the §8.3 field set in the kit title's face.
export const TITLE_FIELD =
  'w-full max-w-md rounded-ui-sm border border-line bg-surface-raised px-3.5 py-1.5 font-display text-ui-xl font-medium text-fg transition-[border-color,box-shadow] duration-fast ease-standard focus:outline-none focus:border-focus focus:ring-1 focus:ring-focus'
