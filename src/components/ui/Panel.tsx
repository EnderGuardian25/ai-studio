import React from 'react'
import { cn } from '@/lib/utils'

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
  className?: string
}

// An in-flow panel on the Folio `.surface` class (DESIGN_SYSTEM.md §4.1).
// Formerly GlassPanel; that name stays as an alias until the cleanup (FR-13).
export function Panel({ className, children, ...props }: PanelProps) {
  return (
    <div className={cn('surface', className)} {...props}>
      {children}
    </div>
  )
}
