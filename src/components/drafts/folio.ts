// Shared Folio class helpers for the draft review page and its components
// (DESIGN_SYSTEM.md §5.2, §8.12–§8.14, §9). Copied from the brief wizard's
// cardCls.ts on purpose: the caption (012) and refine (008) components stay
// self-contained, with no import from another screen's folder.

// The §9 focus outline, for the raw <button>s and links this page draws itself.
export const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

// Small caps (eyebrows, status words, "Current") — §5.2.
export const SMALL_CAPS = 'text-ui-2xs font-semibold uppercase tracking-[0.14em]'

// Page title (§5.2): 42 px display, stepping down to 24 px below md.
export const PAGE_TITLE =
  "font-display font-normal text-ui-xl md:text-ui-2xl leading-[1.04] tracking-[-0.025em] [font-variation-settings:'opsz'_144]"

// A copy-desk section (§8.14): ruled from the one before it by the parent's
// divide-y, an italic --accent numeral, the h2, and a tail on the right.
export const SECTION = 'pt-[22px] pb-1.5'
export const SECTION_NUMERAL = 'font-display italic text-ui-base text-accent'
export const SECTION_HEAD =
  "font-display text-ui-xl font-medium leading-tight tracking-[-0.01em] [font-variation-settings:'opsz'_48]"

// A sub-head (§5.2), e.g. "Revision History" over the contact sheet.
export const SUB_HEAD = 'font-display text-ui-lg font-medium'

// A notice on its status tint (§3.2): the text in the status colour on its
// 10 % fill (the pair §3.3 checks), ringed in currentColor like a chip (§8.5).
export const NOTICE = 'rounded-ui-sm px-4 py-3 text-ui-sm shadow-[inset_0_0_0_1px_currentColor]'

// Icons (§8.16): 15 px, stroke 1.4, currentColor.
export const ICON = { size: 15, strokeWidth: 1.4 } as const
