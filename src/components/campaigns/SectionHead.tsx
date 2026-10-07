import React from 'react'
import { SECTION_HEAD, SECTION_NUMERAL } from './folio'

// A numbered section head (DESIGN_SYSTEM.md §8.14), copied from the draft
// page's: an italic --accent numeral, the h2, and on the right the tail (a
// version, a count, small buttons). The numeral is decorative, so it sits
// outside the heading's name. The row wraps at 375 px; the tail keeps right.
export function SectionHead({
  numeral,
  title,
  children,
}: {
  numeral: string
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
      <span aria-hidden className={SECTION_NUMERAL}>
        {numeral}
      </span>
      <h2 className={SECTION_HEAD}>{title}</h2>
      {children && (
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3.5 gap-y-1 text-ui-xs">
          {children}
        </div>
      )}
    </div>
  )
}
