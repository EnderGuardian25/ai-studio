import React from 'react'
import { cn } from '@/lib/utils'
import { SECTION_HEAD, SUB_HEAD } from './atoms'

interface SectionHeadProps {
  title: React.ReactNode
  /** Not rendered since 021 (A11); the prop is removed in 021 T8. */
  numeral?: string
  level?: 2 | 3
  id?: string
  className?: string
  children?: React.ReactNode
}

// A section head (DESIGN_SYSTEM.md §8.14, the study's .card-hd): the heading
// (an h2 in the section style, or with level={3} an h3 in the sub-head style),
// and on the right the tail (a status, a count, small buttons). `numeral` is
// still accepted but not rendered (021 A11). `id` goes on the heading, for
// aria-labelledby. The row wraps at 375 px; the tail keeps right. No outer
// margin: the caller passes it (usually mb-3).
export function SectionHead({
  title,
  level = 2,
  id,
  className,
  children,
}: SectionHeadProps) {
  const Heading = level === 3 ? 'h3' : 'h2'
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-3 gap-y-2', className)}>
      <Heading id={id} className={level === 3 ? SUB_HEAD : SECTION_HEAD}>
        {title}
      </Heading>
      {children && (
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3.5 gap-y-1 text-ui-xs">
          {children}
        </div>
      )}
    </div>
  )
}
