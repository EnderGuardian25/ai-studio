import React from 'react'
import { cn } from '@/lib/utils'
import { EYEBROW } from './folio'

interface FieldLabelProps {
  htmlFor?: string
  id?: string
  as?: 'label' | 'span'
  className?: string
  children: React.ReactNode
}

// A Folio field label (DESIGN_SYSTEM.md §5.2): small caps in --fg-muted.
// as="span" is for the caption of a group that carries its own aria-label.
// No spacing of its own: the caller, or the Input/Select wrapper, sets it.
export function FieldLabel({ htmlFor, id, as = 'label', className, children }: FieldLabelProps) {
  const classes = cn(`${EYEBROW} block`, className)
  if (as === 'span') {
    return (
      <span id={id} className={classes}>
        {children}
      </span>
    )
  }
  return (
    <label htmlFor={htmlFor} id={id} className={classes}>
      {children}
    </label>
  )
}
