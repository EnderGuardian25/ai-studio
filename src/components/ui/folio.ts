// The shared Folio class strings (DESIGN_SYSTEM.md §3.2, §5.2, §6, §8.3,
// §8.5, §8.14–§8.16, §9). These are the only definitions of the shared atoms:
// a screen imports them from here, or uses the PageHead / SectionHead /
// Notice / FieldLabel components built on them, and never keeps a copy of its
// own (014 FR-01, FR-05). No 'use client' and no hooks, so server components
// can import them. None of them carries an outer margin: the caller adds it.

// The §9 focus outline, for the raw <button>s and links a screen draws itself.
export const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

// A scroll container's focus outline, inset so its own overflow can't clip it.
export const SCROLL_FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus'

// Small caps (§5.2), with no colour: the caller adds the one it shows.
export const SMALL_CAPS = 'text-ui-2xs font-semibold uppercase tracking-[0.14em]'
// Small caps in --fg-muted: eyebrows, field and group labels.
export const EYEBROW = `${SMALL_CAPS} text-fg-muted`

// Page title (§5.2): 42 px display, stepping down to 24 px below md. No top
// margin: PageHead adds `mt-2` under an eyebrow.
export const PAGE_TITLE =
  "font-display font-normal text-ui-xl md:text-ui-2xl leading-[1.04] tracking-[-0.025em] [font-variation-settings:'opsz'_144]"
export const PAGE_LEAD = 'mt-3 text-ui-sm text-fg-muted'

// A section head (§8.14): an italic --accent numeral, then the h2.
export const SECTION_NUMERAL = 'font-display italic text-ui-base text-accent'
export const SECTION_HEAD =
  "font-display text-ui-xl font-medium leading-tight tracking-[-0.01em] [font-variation-settings:'opsz'_48]"

// A sub-head (§5.2 h3).
export const SUB_HEAD = 'font-display text-ui-lg font-medium leading-snug text-fg'

// A notice on its status tint (§3.2): the text in the status colour on its
// 10 % fill (the pair §3.3 checks), ringed in currentColor like a chip (§8.5).
// Notice adds the tone's bg and text.
export const NOTICE = 'rounded-ui-sm px-4 py-3 text-ui-sm shadow-[inset_0_0_0_1px_currentColor]'

// Icons (§8.16): 15 px, stroke 1.4, currentColor.
export const ICON = { size: 15, strokeWidth: 1.4 } as const
export const ICON_SM = { size: 12, strokeWidth: 1.4 } as const

// A quiet icon-only button (§8.16): --fg-muted, a 30 px target. Callers add
// the hover colour, FOCUS, and always an aria-label.
export const ICON_BUTTON =
  'inline-flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-ui-sm text-fg-muted transition-colors duration-fast ease-standard disabled:cursor-not-allowed disabled:opacity-40'

// Links in text: --accent, underlined (§3.2).
export const TEXT_LINK =
  'text-accent underline decoration-line underline-offset-4 hover:decoration-accent'

// A UI tag (a brand-kit or tone chip, a template size, a provider slot): not a
// status, so it is neutral — a hairline box, --fg text. Brand data never
// colours it.
export const TAG =
  'inline-flex max-w-full items-center gap-1 rounded-ui-sm border border-line-subtle bg-surface px-2 py-0.5 text-ui-xs text-fg'

// The small-caps header row of a ruled data table (§8.15).
export const TABLE_HEAD_ROW =
  'border-b border-line-subtle text-left text-ui-2xs uppercase tracking-[0.1em] text-fg-muted'

// A compact field, the §8.3 field at --text-sm. Written out in full because
// `cn` is a plain join: overriding fieldClasses' padding would leave two
// competing utilities.
export const COMPACT_FIELD =
  'rounded-ui-sm border border-line bg-surface-raised px-2.5 py-1.5 font-text text-ui-sm text-fg placeholder:text-fg-muted transition-[border-color,box-shadow] duration-fast ease-standard focus:outline-none focus:border-focus focus:ring-1 focus:ring-focus disabled:cursor-not-allowed disabled:opacity-50'
