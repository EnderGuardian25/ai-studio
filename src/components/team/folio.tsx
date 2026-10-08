import React from 'react'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'

// Shared Folio class helpers and small presentational pieces for /team,
// /settings, /admin/users, /admin/teams and the admin gate (DESIGN_SYSTEM.md
// §5.2, §6, §8.2–§8.6, §8.14–§8.16, §9). Copied from the campaigns and brand
// kit screens on purpose: each screen group keeps its own copy until T13 adds a
// shared primitive. No hooks here, so the server-rendered admin layout can use
// GateNotice too.

// The §9 focus outline, for the raw <button>s and links these screens draw.
export const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

// A scroll container's focus outline, inset so its own overflow can't clip it.
export const SCROLL_FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus'

// Small caps (eyebrows, group labels, status words) — §5.2.
export const SMALL_CAPS = 'text-ui-2xs font-semibold uppercase tracking-[0.14em]'
export const EYEBROW = `${SMALL_CAPS} text-fg-muted`

// Page title (§5.2): 42 px display, stepping down to 24 px below md.
export const PAGE_TITLE =
  "font-display font-normal text-ui-xl md:text-ui-2xl leading-[1.04] tracking-[-0.025em] [font-variation-settings:'opsz'_144]"
export const PAGE_LEAD = 'mt-3 text-ui-sm text-fg-muted'

// A section head (§8.14): an italic --accent numeral, then the h2.
export const SECTION_NUMERAL = 'font-display italic text-ui-base text-accent'
export const SECTION_HEAD =
  "font-display text-ui-xl font-medium leading-tight tracking-[-0.01em] [font-variation-settings:'opsz'_48]"

// A sub-head (§5.2 h3) and a small-caps group label set as an h3.
export const SUB_HEAD = 'font-display text-ui-lg font-medium leading-snug text-fg'
export const GROUP_HEAD = `${SMALL_CAPS} text-fg-muted`

// A section's body opens with the 2 px ink block rule (§6).
export const BLOCK = 'border-t-2 border-fg pt-4'

// A ruled row (§6: lists as ruled rows, not cards).
export const ROW = 'border-b border-line-subtle py-3'

// Links in text: --accent, underlined (§3.2).
export const TEXT_LINK = 'text-accent underline decoration-line underline-offset-4 hover:decoration-accent'

// A quiet icon-only button (§8.16): --fg-muted, a 30 px target. Callers add
// the hover colour, FOCUS, and always an aria-label.
export const ICON_BUTTON =
  'inline-flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-ui-sm text-fg-muted transition-colors duration-fast ease-standard disabled:cursor-not-allowed disabled:opacity-40'

// A UI tag (a provider slot, "Super admin"): not a status, so neutral.
export const TAG =
  'inline-flex max-w-full items-center gap-1 rounded-ui-sm border border-line-subtle bg-surface px-2 py-0.5 text-ui-xs text-fg'

// The small-caps header row of a ruled data table (§8.15).
export const TABLE_HEAD_ROW = 'border-b border-line-subtle text-left text-ui-2xs uppercase tracking-[0.1em] text-fg-muted'

// A notice in a status colour (the T9 background notice): the status tint, a
// 1 px inset ring in currentColor. Callers add the tone's bg and text.
export const NOTICE = 'rounded-ui-sm px-4 py-3 text-ui-sm shadow-[inset_0_0_0_1px_currentColor]'
export const WARN_NOTICE = `${NOTICE} bg-status-scheduled/10 text-status-scheduled`

// Icons (§8.16): 15 px, stroke 1.4, currentColor.
export const ICON = { size: 15, strokeWidth: 1.4 } as const
export const ICON_SM = { size: 12, strokeWidth: 1.4 } as const

// A status word as a §8.5 chip, for states StatusChip has no entry for
// (Connected, Invalid, Active, Deactivated, Revoked). The label is always the
// visible text: status is never colour alone.
type Tone = 'published' | 'draft' | 'scheduled' | 'failed'
const TONE: Record<Tone, string> = {
  published: 'bg-status-published/10 text-status-published',
  draft: 'bg-status-draft/10 text-status-draft',
  scheduled: 'bg-status-scheduled/10 text-status-scheduled',
  failed: 'bg-status-failed/10 text-status-failed',
}

export function StatusWord({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex h-[22px] flex-shrink-0 items-center whitespace-nowrap rounded-ui-sm px-2 font-text ${SMALL_CAPS} shadow-[inset_0_0_0_1px_currentColor] ${TONE[tone]}`}
    >
      {children}
    </span>
  )
}

// A numbered section head (§8.14), copied from the campaigns screens: the
// numeral is decorative, so it sits outside the heading's name. The tail (a
// status, a small button) keeps right and wraps at 375 px.
export function SectionHead({
  numeral,
  title,
  children,
}: {
  numeral?: string
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
      {numeral && (
        <span aria-hidden className={SECTION_NUMERAL}>
          {numeral}
        </span>
      )}
      <h2 className={SECTION_HEAD}>{title}</h2>
      {children && (
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3.5 gap-y-1 text-ui-xs">
          {children}
        </div>
      )}
    </div>
  )
}

// A page head (§6): an eyebrow, the display title, a lead, and an optional
// action on the right that drops below the title at 375 px.
export function PageHead({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string
  title: string
  lead: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className={EYEBROW}>{eyebrow}</div>
        <h1 className={`mt-2 ${PAGE_TITLE}`}>{title}</h1>
        <p className={PAGE_LEAD}>{lead}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

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
