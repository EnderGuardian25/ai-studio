'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface SegmentOption {
  value: string
  label: string
}

interface SegmentedToggleProps {
  options: SegmentOption[]
  value: string
  onChange: (value: string) => void
  /** The tablist's accessible name (014 FR-13): every tablist is named. */
  label: string
  className?: string
}

// Folio segmented toggle (DESIGN_SYSTEM.md §8.4): a --line outline, and the
// selected segment in ink (--fg fill, --canvas text). The focus ring is inset,
// because the outline's overflow-hidden would clip an outer one.
export function SegmentedToggle({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedToggleProps) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'inline-flex items-center overflow-hidden',
        'border border-line rounded-ui-md',
        className,
      )}
    >
      {options.map(opt => {
        const isActive = opt.value === value
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt.value)}
            className={cn(
              'px-2.5 py-1.5 font-text text-ui-xs font-semibold',
              'transition-colors duration-fast ease-standard',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
              isActive ? 'bg-fg text-canvas' : 'text-fg-muted hover:text-fg',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
