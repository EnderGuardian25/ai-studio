// The brand kits admin's own Folio class helpers (DESIGN_SYSTEM.md §6, §8.3,
// §8.4, §8.6). The shared atoms (FOCUS, SMALL_CAPS, the heading strings, ICON,
// TAG, COMPACT_FIELD…) come from @/components/ui/folio; this module keeps only
// what this screen group alone uses (014 FR-02's residue rule).

import { FOCUS } from '@/components/ui/folio'

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
