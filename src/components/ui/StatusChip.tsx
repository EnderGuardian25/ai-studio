import React from 'react'
import { cn } from '@/lib/utils'

type PostStatus =
  | 'draft'
  | 'exported'
  | 'scheduled'
  | 'published'
  | 'failed'
  // Scheduled-generation queue states (reuse the existing status-* tokens):
  | 'queued'
  | 'generating'
  | 'generated'
  | 'cancelled'
  // Unfinished (autosaved) brief-wizard sessions on the dashboard:
  | 'unfinished'

interface StatusChipProps {
  status: PostStatus
  className?: string
}

// Folio status chip (DESIGN_SYSTEM.md §8.5): text in the status colour, a fill
// of the same colour at 0.10 (in both themes — the --status-* vars switch, and
// tests/unit/contrast.test.ts measures the text at 0.10), and a 1 px inset ring
// in currentColor. The label is always present: status is never colour alone.
// Tailwind can't build class names from template strings, so each status
// spells its utilities out.
const statusConfig: Record<PostStatus, { label: string; classes: string }> = {
  draft: { label: 'Draft', classes: 'bg-status-draft/10 text-status-draft' },
  exported: { label: 'Exported', classes: 'bg-status-exported/10 text-status-exported' },
  scheduled: { label: 'Scheduled', classes: 'bg-status-scheduled/10 text-status-scheduled' },
  published: { label: 'Published', classes: 'bg-status-published/10 text-status-published' },
  failed: { label: 'Failed', classes: 'bg-status-failed/10 text-status-failed' },
  queued: { label: 'Queued', classes: 'bg-status-scheduled/10 text-status-scheduled' },
  generating: { label: 'Generating', classes: 'bg-status-exported/10 text-status-exported' },
  generated: { label: 'Generated', classes: 'bg-status-published/10 text-status-published' },
  cancelled: { label: 'Cancelled', classes: 'bg-status-draft/10 text-status-draft' },
  unfinished: { label: 'Unfinished', classes: 'bg-status-scheduled/10 text-status-scheduled' },
}

export function StatusChip({ status, className }: StatusChipProps) {
  const config = statusConfig[status]

  return (
    <span
      className={cn(
        'inline-flex items-center h-[22px] px-2 rounded-ui-sm',
        'font-text text-ui-2xs font-semibold uppercase tracking-[0.14em]',
        'shadow-[inset_0_0_0_1px_currentColor]',
        config.classes,
        className,
      )}
    >
      {config.label}
    </span>
  )
}
