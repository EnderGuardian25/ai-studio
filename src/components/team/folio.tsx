import React from 'react'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { FOCUS, SECTION_HEAD, TEXT_LINK } from '@/components/ui/folio'

// The screen-specific Folio pieces for /team, /settings, /admin/users,
// /admin/teams and the admin gate (DESIGN_SYSTEM.md §6, §8.18). The shared
// atoms and the PageHead / SectionHead / Notice / StatusChip primitives come
// from src/components/ui (014 FR-02's residue rule). No hooks here, so the
// server-rendered admin layout can use GateNotice too.

// A section's body opens with the 2 px ink block rule (§6).
export const BLOCK = 'border-t-2 border-fg pt-4'

// A ruled row (§6: lists as ruled rows, not cards).
export const ROW = 'border-b border-line-subtle py-3'

// The "Requires …" gate shown to a role that can't use a page.
export function GateNotice({
  title,
  children,
  backLink,
}: {
  title: string
  children: React.ReactNode
  backLink?: boolean
}) {
  return (
    <Panel className="mx-auto mt-12 max-w-md p-12 text-center">
      <ShieldAlert size={32} strokeWidth={1.4} aria-hidden className="mx-auto mb-3 text-fg-muted" />
      <h1 className={`mb-1 ${SECTION_HEAD}`}>{title}</h1>
      <p className={`text-ui-sm text-fg-muted ${backLink ? 'mb-4' : ''}`}>{children}</p>
      {backLink && (
        <Link href="/" className={`rounded-ui-sm text-ui-sm ${TEXT_LINK} ${FOCUS}`}>
          Back to Dashboard
        </Link>
      )}
    </Panel>
  )
}
