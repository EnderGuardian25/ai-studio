import React from 'react'
import { SectionHead } from '@/components/ui/SectionHead'
import { BLOCK, EYEBROW, SUB_HEAD } from '@/components/ui/atoms'

interface InsightSectionProps {
  id: string
  title: string
  /** The decision this section serves, in one line. */
  question: string
  tail?: React.ReactNode
  children: React.ReactNode
}

// One page section (§6, §8.27): the head over the 2 px ink rule, then a body
// holding the question and the content. Labelled by its heading; no numeral.
export function InsightSection({ id, title, question, tail, children }: InsightSectionProps) {
  return (
    <div className="min-w-0" role="region" aria-labelledby={`${id}-h`} data-testid={`section-${id}`}>
      <SectionHead id={`${id}-h`} title={title} className="mb-3">
        {tail}
      </SectionHead>
      <div className={BLOCK}>
        <p className="mb-4 text-ui-sm text-fg-muted">{question}</p>
        <div className="flex flex-col gap-5">{children}</div>
      </div>
    </div>
  )
}

/** A sub-block inside a section: a small head and its content. */
export function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className={`mb-2 ${SUB_HEAD}`}>{title}</h3>
      {children}
    </div>
  )
}

/** A labelled figure (a count or a rate): Folio's KPI, an eyebrow over a display numeral on a ruled row. */
export function Stat({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) {
  return (
    <div className="min-w-0 border-b border-line-subtle py-4">
      <div className={EYEBROW}>{label}</div>
      <div
        data-testid={testId}
        className="mt-2 font-display text-ui-2xl font-normal leading-none tabular-nums [font-variation-settings:'opsz'_144]"
      >
        {value}
      </div>
    </div>
  )
}
