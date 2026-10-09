'use client'

import React from 'react'
import { EYEBROW } from '@/components/ui/folio'

// ─── Review row ──────────────────────────────────────────────────────────────
// One ruled row of the Review step's <dl> (DESIGN_SYSTEM.md §8.15): a
// small-caps term beside its value.

export interface ReviewRowProps {
  label: string
  value: string
  capitalize?: boolean
}

export function ReviewRow({ label, value, capitalize = false }: ReviewRowProps) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] sm:grid-cols-[8rem_minmax(0,1fr)] gap-4 py-3 border-b border-line-subtle">
      <dt className={`${EYEBROW} pt-1`}>{label}</dt>
      <dd className={`text-ui-sm text-fg leading-relaxed break-words${capitalize ? ' capitalize' : ''}`}>{value}</dd>
    </div>
  )
}
