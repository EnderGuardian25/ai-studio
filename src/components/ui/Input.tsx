import React from 'react'
import { cn } from '@/lib/utils'

// The Folio field (DESIGN_SYSTEM.md §8.3): a 1 px --line edge (3:1), a
// --surface-2 fill, and a --focus ring while focused. Shared with Select.
// background-COLOR only (bg-*), so a background-image set beside it survives.
export const fieldClasses = [
  'w-full rounded-ui-sm border bg-surface-raised',
  'px-3.5 py-2.5 font-text text-ui-base text-fg',
  'placeholder:text-fg-muted',
  'transition-[border-color,box-shadow] duration-fast ease-standard',
  'focus:outline-none focus:border-focus focus:ring-1 focus:ring-focus',
  'disabled:opacity-50 disabled:cursor-not-allowed',
].join(' ')

// The edge colour, kept out of fieldClasses: cn is a plain join, so two
// competing border colours would be settled by CSS source order.
export const fieldEdge = (error?: string) => (error ? 'border-status-failed' : 'border-line')

export const fieldLabelClasses = 'font-text text-ui-sm font-medium text-fg'
export const fieldErrorClasses = 'font-text text-ui-xs text-status-failed'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({
  label,
  error,
  id,
  className,
  ...props
}: InputProps) {
  // Stable, collision-free fallback: an explicit id wins, otherwise React.useId.
  // (The old label-derived id collided when two inputs shared the same label text.)
  const generatedId = React.useId()
  const inputId = id ?? (label ? generatedId : undefined)

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className={fieldLabelClasses}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(fieldClasses, fieldEdge(error), className)}
        {...props}
      />
      {error && <p className={fieldErrorClasses}>{error}</p>}
    </div>
  )
}
