import React from 'react'
import { cn } from '@/lib/utils'
import { FieldLabel } from './FieldLabel'

// The Folio field (DESIGN_SYSTEM.md §8.3): a 1 px --line edge (3:1), a
// --surface-2 fill, and a --focus ring while focused.
// background-COLOR only (bg-*), so a background-image set beside it survives.
const fieldBase = (box: string) => [
  'w-full rounded-ui-sm border bg-surface-raised',
  `${box} font-text text-ui-base text-fg`,
  'placeholder:text-fg-muted',
  'transition-[border-color,box-shadow] duration-fast ease-standard',
  'focus:outline-none focus:border-focus focus:ring-1 focus:ring-focus',
  'disabled:opacity-50 disabled:cursor-not-allowed',
].join(' ')

// A multi-line field (textareas): its height comes from its rows and padding.
export const fieldClasses = fieldBase('px-3.5 py-2.5')

// A single-line field (Input, Select and raw <input>s): the md control height
// (--control-md, 014 FR-07), so it lines up with the md Button beside it.
// Horizontal padding only: a vertical one would compete with the height.
export const inputClasses = fieldBase('h-control-md px-3.5')

// The edge colour, kept out of fieldClasses: cn is a plain join, so two
// competing border colours would be settled by CSS source order.
export const fieldEdge = (error?: string) => (error ? 'border-status-failed' : 'border-line')

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

  // The label is the shared small-caps FieldLabel (014 FR-06): one field-label
  // style app-wide, the same in Select.
  return (
    <div className="flex flex-col gap-1.5">
      {label && <FieldLabel htmlFor={inputId}>{label}</FieldLabel>}
      <input
        id={inputId}
        className={cn(inputClasses, fieldEdge(error), className)}
        {...props}
      />
      {error && <p className={fieldErrorClasses}>{error}</p>}
    </div>
  )
}
