import React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fieldClasses, fieldEdge, fieldErrorClasses } from './Input'
import { FieldLabel } from './FieldLabel'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[]
  label?: string
  error?: string
}

export function Select({
  options,
  label,
  error,
  id,
  className,
  ...props
}: SelectProps) {
  // Stable, collision-free fallback: an explicit id wins, otherwise React.useId.
  const generatedId = React.useId()
  const selectId = id ?? (label ? generatedId : undefined)

  return (
    <div className="flex flex-col gap-1.5">
      {label && <FieldLabel htmlFor={selectId}>{label}</FieldLabel>}
      {/* The chevron is a real positioned element, not a background-image:
          bg-image utilities are one `background` shorthand away from being
          wiped (happened once via a legacy input class), and Tailwind arbitrary
          values silently drop URLs containing spaces. */}
      <div className="relative">
        <select
          id={selectId}
          className={cn(
            fieldClasses,
            'appearance-none pr-9',
            fieldEdge(error),
            className,
          )}
          {...props}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted"
        />
      </div>
      {error && <p className={fieldErrorClasses}>{error}</p>}
    </div>
  )
}
