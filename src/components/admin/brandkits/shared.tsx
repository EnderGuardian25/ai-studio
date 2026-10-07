'use client'

import React from 'react'
import { SECTION_HEAD, SECTION_NUMERAL } from './folio'

// Small presentational helpers shared across the brand kit admin components
// (ColorEditor, KitDetail, and the brand kits list page).

interface ColorSwatchProps {
  color: string
}

// A kit colour, shown as the kit's own value: the fill comes from data and is
// never token-styled. Only its frame (a --line edge) is chrome.
export function ColorSwatch({ color }: ColorSwatchProps) {
  return (
    <span
      className="inline-block h-5 w-5 flex-shrink-0 rounded-ui-sm border border-line"
      style={{ backgroundColor: color }} // ui-exception: brand-kit swatch, the kit's own colour from data
      title={color}
    />
  )
}

interface SectionHeaderProps {
  numeral: string
  title: string
  action?: React.ReactNode
}

// A numbered kit section head (DESIGN_SYSTEM.md §8.14), one level below the
// kit's name: an italic --accent numeral, the h3, and on the right the
// section's actions. The numeral is decorative, so it sits outside the
// heading's name. The row wraps at 375 px; the actions keep right.
export function SectionHeader({ numeral, title, action }: SectionHeaderProps) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
      <span aria-hidden className={SECTION_NUMERAL}>
        {numeral}
      </span>
      <h3 className={SECTION_HEAD}>{title}</h3>
      {action && (
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">{action}</div>
      )}
    </div>
  )
}
