import React from 'react'
import { SectionHead } from '@/components/ui/SectionHead'
import { SUB_HEAD } from '@/components/ui/atoms'

interface InsightSectionProps {
  id: string
  title: string
  /** The decision this section serves, in one line. */
  question: string
  tail?: React.ReactNode
  children: React.ReactNode
}

// One page section (§6): opened by the 2 px ink rule, labelled by its heading.
export function InsightSection({ id, title, question, tail, children }: InsightSectionProps) {
  return (
    <div className="min-w-0 border-t-2 border-fg pt-4" role="region" aria-labelledby={`${id}-h`} data-testid={`section-${id}`}>
      <SectionHead id={`${id}-h`} title={title} className="mb-1">
        {tail}
      </SectionHead>
      <p className="mb-4 text-ui-sm text-fg-muted">{question}</p>
      <div className="flex flex-col gap-5">{children}</div>
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

/** A labelled figure (a count or a rate). */
export function Stat({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-ui-xs text-fg-muted">{label}</div>
      <div data-testid={testId} className="text-ui-lg font-semibold tabular-nums">
        {value}
      </div>
    </div>
  )
}
