import React from 'react'
import { cn } from '@/lib/utils'

// Folio buttons (DESIGN_SYSTEM.md §8.2). The variant names predate Folio and
// stay, so callers compile unchanged: `secondary` is Folio's Outline button and
// `ghost` its Text button. `ink` is the refine Send button.
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ink'
type ButtonSize    = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg border border-accent enabled:hover:shadow-raised',
  secondary: [
    'bg-transparent text-fg border border-line enabled:hover:border-fg',
    // an open menu button
    'aria-expanded:border-fg aria-expanded:bg-surface-raised',
  ].join(' '),
  ghost: 'bg-transparent text-fg border border-transparent underline decoration-line underline-offset-4',
  danger: 'bg-transparent text-status-failed border border-status-failed',
  ink: 'bg-fg text-canvas border border-fg',
}

// One class per property and size: `cn` is a plain join (no tailwind-merge),
// so two competing paddings would be settled by CSS source order.
const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-[30px] text-ui-xs',
  md: 'h-9 text-ui-sm',
  lg: 'h-10 text-ui-base',
}

function paddingFor(variant: ButtonVariant, size: ButtonSize): string {
  if (variant === 'ghost') return 'px-1.5'
  if (size === 'sm') return 'px-2.5'
  if (variant === 'primary') return 'px-5'
  if (variant === 'ink') return 'px-4'
  return 'px-3.5'
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap',
        'font-text font-semibold rounded-ui-md',
        'transition-[background-color,border-color,color,box-shadow] duration-fast ease-standard',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        paddingFor(variant, size),
        className,
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
