// Shared Folio class helpers for the campaigns and projects screens and the
// scheduled queue (DESIGN_SYSTEM.md §5.2, §6, §8.2–§8.6, §8.14, §8.15, §9).
// Copied from the dashboard, brief wizard and draft page on purpose: each
// screen group keeps its own copy until T13 adds a shared primitive.

// The §9 focus outline, for the raw <button>s and links these screens draw.
export const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

// A scroll container's focus outline, inset so its own overflow can't clip it.
export const SCROLL_FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus'

// Small caps (eyebrows, field and group labels, status words) — §5.2.
export const SMALL_CAPS = 'text-ui-2xs font-semibold uppercase tracking-[0.14em]'
export const EYEBROW = `${SMALL_CAPS} text-fg-muted`

// Page title (§5.2): 42 px display, stepping down to 24 px below md.
export const PAGE_TITLE =
  "font-display font-normal text-ui-xl md:text-ui-2xl leading-[1.04] tracking-[-0.025em] [font-variation-settings:'opsz'_144]"
export const PAGE_LEAD = 'mt-3 text-ui-sm text-fg-muted'

// A section head (§8.14): an italic --accent numeral, then the h2.
export const SECTION_NUMERAL = 'font-display italic text-ui-base text-accent'
export const SECTION_HEAD =
  "font-display text-ui-xl font-medium leading-tight tracking-[-0.01em] [font-variation-settings:'opsz'_48]"

// A row's title link: --fg in the display face, --accent on hover.
export const ROW_TITLE =
  'font-display text-ui-lg font-medium leading-snug text-fg break-words transition-colors duration-fast ease-standard hover:text-accent'

// Links in text: --accent, underlined (§3.2).
export const TEXT_LINK = 'text-accent underline decoration-line underline-offset-4 hover:decoration-accent'

// A quiet icon-only button (§8.16): --fg-muted, a 30 px target, the §9 outline.
// Callers add the hover colour and always an aria-label.
export const ICON_BUTTON =
  'inline-flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-ui-sm text-fg-muted transition-colors duration-fast ease-standard disabled:cursor-not-allowed disabled:opacity-40'

// A UI tag (the brand-kit and tone chips on a row): not a status, so it is
// neutral — a hairline box, muted icon, --fg text. Brand data never colours it.
export const TAG =
  'inline-flex max-w-full items-center gap-1 rounded-ui-sm border border-line-subtle bg-surface px-2 py-0.5 text-ui-xs text-fg'

// The small-caps header row of a ruled data table (§8.15).
export const TABLE_HEAD_ROW = 'border-b border-line-subtle text-left text-ui-2xs uppercase tracking-[0.1em] text-fg-muted'

// A compact field (the plan-review rows), the §8.3 field at --text-sm. Written
// out in full because `cn` is a plain join: overriding fieldClasses' padding
// would leave two competing utilities.
export const COMPACT_FIELD =
  'rounded-ui-sm border border-line bg-surface-raised px-2.5 py-1.5 font-text text-ui-sm text-fg placeholder:text-fg-muted transition-[border-color,box-shadow] duration-fast ease-standard focus:outline-none focus:border-focus focus:ring-1 focus:ring-focus disabled:cursor-not-allowed disabled:opacity-50'

// Icons (§8.16): 15 px, stroke 1.4, currentColor.
export const ICON = { size: 15, strokeWidth: 1.4 } as const
export const ICON_SM = { size: 12, strokeWidth: 1.4 } as const

// Breadcrumbs (§8.6): --text-sm in --fg-muted, links underlined in --line,
// the current page in --fg 500.
export const CRUMB_LINK =
  'inline-flex items-center gap-1.5 rounded-ui-sm text-fg-muted underline decoration-line underline-offset-4 transition-colors duration-fast ease-standard hover:text-fg'
export const CRUMB_CURRENT = 'min-w-0 break-words font-medium text-fg'

// The aside's ruled blocks (brand kit, details): a small-caps h2 over a
// --line-subtle rule; the column opens with a 2 px --fg rule (§6).
export const ASIDE_BLOCK = 'border-b border-line-subtle py-4'
export const ASIDE_HEAD = `${SMALL_CAPS} mb-3 text-fg-muted`
