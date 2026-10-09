'use client'

import React from 'react'
import { SECTION_HEAD, SECTION_NUMERAL } from '@/components/ui/folio'

// ─── Step head ───────────────────────────────────────────────────────────────
// Folio section head (DESIGN_SYSTEM.md §8.14): an italic --accent numeral, the
// h2 in the display face, then a muted lead. The numeral is decorative (the
// stepper announces the step), so it sits outside the heading's name. Bespoke
// rather than the ui SectionHead (014 FR-01): a non-wrapping row and a lead
// with its own spacing, built from the shared heading strings.

interface StepHeadProps {
  index: number // 0-based step index
  title: React.ReactNode
  children?: React.ReactNode // the lead paragraph
}

export function StepHead({ index, title, children }: StepHeadProps) {
  return (
    <>
      <div className="flex items-baseline gap-3.5">
        <span aria-hidden className={SECTION_NUMERAL}>
          {index + 1}.
        </span>
        <h2 className={SECTION_HEAD}>{title}</h2>
      </div>
      {children && <p className="mt-2 mb-8 text-ui-sm text-fg-muted">{children}</p>}
    </>
  )
}
