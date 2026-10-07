'use client'

import React from 'react'
import { STEP_HEAD, STEP_LEAD, STEP_NUMERAL } from './cardCls'

// ─── Step head ───────────────────────────────────────────────────────────────
// Folio section head (DESIGN_SYSTEM.md §8.14): an italic --accent numeral, the
// h2 in the display face, then a muted lead. The numeral is decorative (the
// stepper announces the step), so it sits outside the heading's name.

interface StepHeadProps {
  index: number // 0-based step index
  title: React.ReactNode
  children?: React.ReactNode // the lead paragraph
}

export function StepHead({ index, title, children }: StepHeadProps) {
  return (
    <>
      <div className="flex items-baseline gap-3.5">
        <span aria-hidden className={STEP_NUMERAL}>
          {index + 1}.
        </span>
        <h2 className={STEP_HEAD}>{title}</h2>
      </div>
      {children && <p className={STEP_LEAD}>{children}</p>}
    </>
  )
}
