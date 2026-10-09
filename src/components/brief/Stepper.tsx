'use client'

import React from 'react'
import { Check } from 'lucide-react'
import { STEPS } from './constants'
import { FOCUS, SMALL_CAPS } from '@/components/ui/folio'

// ─── Stepper ─────────────────────────────────────────────────────────────────
// Folio (DESIGN_SYSTEM.md §5.2, §6): one ruled column per step. The rule on top
// is --accent for the current step, --fg for a done one and --line-subtle ahead;
// beneath it the numeral (a check once done) and the label in small caps. The
// state is never colour alone: the current step carries aria-current="step",
// a done step its check. Below sm the label is sr-only, not removed, so a done
// step (whose numeral became a check) still has a name.

interface StepperProps {
  step: number
  onJump: (i: number) => void
}

export function Stepper({ step, onJump }: StepperProps) {
  return (
    <ol className="grid grid-cols-5 gap-2 mb-10">
      {STEPS.map((label, i) => {
        const done = i < step
        const active = i === step
        return (
          <li key={label} className="min-w-0">
            <button
              type="button"
              onClick={() => done && onJump(i)}
              aria-current={active ? 'step' : undefined}
              className={[
                'w-full text-left border-t-2 pt-2.5 pb-1 font-text',
                'transition-colors duration-fast ease-standard',
                FOCUS,
                active
                  ? 'border-accent text-fg'
                  : done
                    ? 'border-fg text-fg cursor-pointer hover:text-accent'
                    : 'border-line-subtle text-fg-muted cursor-default',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-5 items-center font-display italic text-ui-base leading-none',
                  active ? 'text-accent' : '',
                ].join(' ')}
              >
                {done ? <Check size={15} strokeWidth={2} aria-hidden className="text-accent" /> : i + 1}
              </span>
              <span className={`sr-only sm:not-sr-only sm:block mt-1.5 ${SMALL_CAPS} leading-snug`}>
                {label}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
