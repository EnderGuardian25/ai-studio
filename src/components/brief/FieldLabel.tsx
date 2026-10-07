'use client'

import React from 'react'
import { SMALL_CAPS } from './cardCls'

// ─── Field label ─────────────────────────────────────────────────────────────
// A Folio small-caps label (DESIGN_SYSTEM.md §5.2).

interface FieldLabelProps {
  children: React.ReactNode
}

export function FieldLabel({ children }: FieldLabelProps) {
  return <label className={`${SMALL_CAPS} mb-2.5 block`}>{children}</label>
}
