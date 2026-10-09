import React from 'react'
import { cn } from '@/lib/utils'
import { NOTICE } from './folio'

export type NoticeTone = 'warning' | 'error' | 'info' | 'neutral'

// Each tone is its text colour on a 10 % fill of the same colour (§3.2, the
// pair §3.3 checks), with NOTICE's 1 px inset ring in currentColor. Neutral is
// the --surface-1 fill and --fg text, so it sets its --line ring explicitly
// rather than leaving currentColor to colour it. Tailwind can't build class
// names from template strings, so each tone spells its utilities out.
const TONE: Record<NoticeTone, string> = {
  warning: 'bg-status-scheduled/10 text-status-scheduled',
  error: 'bg-status-failed/10 text-status-failed',
  info: 'bg-accent/10 text-accent',
  neutral: 'bg-surface text-fg shadow-[inset_0_0_0_1px_rgb(var(--line))]',
}

// NOTICE without its currentColor ring, for neutral: `cn` is a plain join, so
// two shadow utilities side by side would be settled by CSS source order.
const NEUTRAL_BASE = 'rounded-ui-sm px-4 py-3 text-ui-sm'

interface NoticeProps extends React.HTMLAttributes<HTMLDivElement> {
  tone: NoticeTone
  icon?: React.ReactNode
  className?: string
  children: React.ReactNode
}

// A notice in a status colour (DESIGN_SYSTEM.md §3.2). It renders no role of
// its own: the caller passes role="status" or role="alert" where it wants one,
// and role, aria-* and data-* attributes pass through. With an icon, the icon
// and a flexible body sit in a row. No outer margin: the caller adds it.
export function Notice({ tone, icon, className, children, ...props }: NoticeProps) {
  return (
    <div
      className={cn(
        tone === 'neutral' ? NEUTRAL_BASE : NOTICE,
        TONE[tone],
        icon ? 'flex items-start gap-2' : undefined,
        className,
      )}
      {...props}
    >
      {icon ? (
        <>
          {icon}
          <div className="min-w-0 flex-1">{children}</div>
        </>
      ) : (
        children
      )}
    </div>
  )
}
