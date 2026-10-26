import React from 'react'
import { cn } from '@/lib/utils'

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
  className?: string
  /** Kept addition (032): accepted for post-021 callers; Folio has one card class. */
  bezel?: boolean
}

// An in-flow panel on the Folio `.surface` class (DESIGN_SYSTEM.md §4.1).
export function Panel({ className, children, bezel: _bezel, ...props }: PanelProps) {
  return (
    <div className={cn('surface', className)} {...props}>
      {children}
    </div>
  )
}
