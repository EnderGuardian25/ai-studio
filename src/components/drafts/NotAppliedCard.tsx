'use client'

import { AlertTriangle } from 'lucide-react'
import type { DraftNotApplied } from '@/lib/api-types'
import { formatDateTime } from '@/lib/format'

export interface NotAppliedCardProps {
  notApplied: DraftNotApplied
}

// FR-14/AC-18 hard failure: a refine that failed its fidelity check on both
// attempts. Deliberately red/`role="alert"`, never a dismissible toast and
// never attached to a revision row — no revision was committed for
// `notApplied.instruction` (FR-12), so there is nothing to attach a warning
// to. Reads differently on purpose from the amber brand-kit conflict card
// (a choice to make) and from the `pendingActionError` crash message ("the
// run crashed" vs. this — "it ran, but did not do what you asked").
//
// The image, when present, is the RETAINED REJECTED render — what the model
// actually produced, kept for diagnosis only; it was never rendered onto the
// draft. Extracted out of RefinementPanel so that panel doesn't keep growing.
//
// T19 slot: a "Use anyway" action (adopts this rejected render as a real,
// committed revision via `POST /api/drafts/[id]/rejected/[revisionId]/adopt`)
// belongs right below the preview, where the comment marks it. Not built here.
export function NotAppliedCard({ notApplied }: NotAppliedCardProps) {
  return (
    <div
      role="alert"
      className="mb-3 rounded-xl border border-red-300 dark:border-red-700/50 bg-red-50 dark:bg-red-900/20 p-3 animate-fade-in"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">
            Couldn&rsquo;t apply &ldquo;{notApplied.instruction}&rdquo;
          </p>
          <p className="text-xs text-red-700 dark:text-red-400/90 mt-1">{notApplied.reason}</p>

          {notApplied.previewUrl && (
            <div className="mt-2 max-w-[180px] rounded-lg overflow-hidden border border-red-200 dark:border-red-800/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={notApplied.previewUrl}
                alt="What the model produced — not applied to your design"
                className="w-full h-auto block"
              />
            </div>
          )}

          <p className="text-[11px] text-red-600/80 dark:text-red-400/70 mt-1.5">
            Rejected {formatDateTime(notApplied.rejectedAt)} — your design was left unchanged.
          </p>

          {/* T19 slot: "Use anyway" goes here, next to the preview above. */}
        </div>
      </div>
    </div>
  )
}
