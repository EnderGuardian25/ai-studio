import React from 'react'
import { cn } from '@/lib/utils'
import { generatedWith } from '@/lib/models/stampLabel'

export interface GeneratedWithProps {
  /** The stamp: a caption row's model, headlineModel or designModel. */
  stamp: string | null | undefined
  /** Its `…SubstitutedFrom` sibling. */
  substitutedFrom?: string | null
  className?: string
}

// 008 FR-20: the muted "Generated with Sonnet 5.5" line in a panel's tail. A
// stamp no current entry describes shows its raw ID; a substitution adds
// "(substituted)", titled with the refused value. Nothing without a stamp.
export function GeneratedWith({ stamp, substitutedFrom, className }: GeneratedWithProps) {
  const line = generatedWith(stamp, substitutedFrom)
  if (!line) return null
  return (
    <p className={cn('text-ui-xs text-fg-muted', className)}>
      {line.text}
      {line.substitutedTitle && (
        <>
          {' '}
          <span title={line.substitutedTitle}>(substituted)</span>
          <span className="sr-only">: {line.substitutedTitle}</span>
        </>
      )}
    </p>
  )
}
