'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { StatusChip } from '@/components/ui/StatusChip'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import {
  FOCUS,
  SCROLL_FOCUS,
  SECTION_HEAD,
  TABLE_HEAD_ROW,
  TEXT_LINK,
} from '@/components/ui/folio'
import { apiFetch } from '@/lib/apiFetch'
import type { DraftStatus } from '@prisma/client'
import { channelLabel as sharedChannelLabel } from '@/lib/channels'

// ─── Recent Drafts card (dashboard) ─────────────────────────────────────────
// Collapsed it shows the first COLLAPSED_COUNT rows; Expand grows the same
// block in place and scrolls the full server-provided list internally — no
// overlay, no extra fetch. Folio draws it as a ruled table, not a card box.

const COLLAPSED_COUNT = 8

// Folio's visible focus (DESIGN_SYSTEM.md §9), on a rounded-ui-sm box: the
// links and buttons in this card draw their outline with the corner.
const FOCUS_ROUNDED = `${FOCUS} rounded-ui-sm`
// A row's title link: --fg, --accent on hover.
const TOPIC_LINK = 'font-medium text-fg transition-colors duration-fast ease-standard hover:text-accent'
// The small-caps header cell (§8.15).
const HEAD_CELL = 'py-2 font-semibold'

const DRAFT_CHIP: Record<DraftStatus, 'draft' | 'exported' | 'published' | 'failed'> = {
  IN_PROGRESS: 'draft',
  EXPORTED: 'exported',
  PUBLISHED: 'published',
  FAILED: 'failed',
}

function channelLabel(channels: string[]): string {
  if (!channels?.length) return '—'
  return channels.map(sharedChannelLabel).join(', ')
}

export interface RecentDraftRow {
  id: string
  status: DraftStatus
  // Pre-formatted on the server (relativeTime uses Date.now(), which would
  // hydration-mismatch in a client component).
  createdAtLabel: string
  brief: {
    topic: string | null
    designMode: string | null
    channels: string[]
    campaign: { name: string } | null
  } | null
}

// An unfinished (autosaved) brief-wizard session — rendered as a leading row
// with Resume/Discard instead of a draft link.
export interface UnfinishedBriefRow {
  id: string
  topic: string
  updatedAtLabel: string
}

export function RecentDraftsCard({
  drafts,
  unfinished = [],
  className,
}: {
  drafts: RecentDraftRow[]
  unfinished?: UnfinishedBriefRow[]
  className?: string
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [expanded, setExpanded] = useState(false)
  const [discarding, setDiscarding] = useState<string | null>(null)

  // Unfinished rows lead (most recent working state first) and share the
  // collapsed-row budget with generated drafts.
  const draftBudget = expanded ? drafts.length : Math.max(0, COLLAPSED_COUNT - unfinished.length)
  const unfinishedRows = expanded ? unfinished : unfinished.slice(0, COLLAPSED_COUNT)
  const rows = drafts.slice(0, draftBudget)
  const hasMore = drafts.length + unfinished.length > COLLAPSED_COUNT

  async function discardUnfinished(row: UnfinishedBriefRow) {
    const ok = await confirm({
      title: 'Discard this unfinished brief?',
      description: `"${row.topic || 'Untitled brief'}" and its uploaded images will be deleted.`,
      confirmLabel: 'Discard',
    })
    if (!ok) return
    setDiscarding(row.id)
    try {
      await apiFetch(`/api/brief-drafts/${row.id}`, { method: 'DELETE' })
      router.refresh()
    } catch {
      /* already gone — refresh reflects reality either way */
      router.refresh()
    } finally {
      setDiscarding(null)
    }
  }

  return (
    <div className={className}>
      {/* Section head over a 2 px --fg rule (DESIGN_SYSTEM.md §6, §8.13) */}
      <div className="flex items-baseline gap-4 pb-2.5">
        <h2 className={SECTION_HEAD}>Recent Drafts</h2>
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className={`ml-auto inline-flex items-center gap-1 px-1.5 text-ui-xs font-semibold text-fg underline decoration-line underline-offset-4 ${FOCUS_ROUNDED}`}
          >
            {expanded ? (
              <>
                Collapse <ChevronUp size={14} strokeWidth={1.4} />
              </>
            ) : (
              <>
                Expand <ChevronDown size={14} strokeWidth={1.4} />
              </>
            )}
          </button>
        )}
      </div>

      {drafts.length === 0 && unfinished.length === 0 ? (
        <p className="border-t-2 border-fg py-8 text-center text-ui-sm text-fg-muted">
          No drafts yet.{' '}
          <Link href="/brief" className={`${TEXT_LINK} ${FOCUS_ROUNDED}`}>
            Create your first brief
          </Link>
          .
        </p>
      ) : (
        // A wide table scrolls inside its own container; the page never does.
        // The container is a focusable, labelled region so keyboard users can
        // scroll it (WCAG 2.1.1); its focus ring is inset so overflow can't clip it.
        <div
          tabIndex={0}
          role="region"
          aria-label="Recent drafts"
          className={`border-t-2 border-fg ${SCROLL_FOCUS} ${expanded ? 'max-h-96 overflow-y-auto overflow-x-auto' : 'overflow-x-auto'}`}
        >
          {/* Folio data table (§8.15): ruled rows, a small-caps header row */}
          <table className="w-full min-w-[600px] text-ui-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW}>
                <th scope="col" className={`${HEAD_CELL} pr-3`}>Topic</th>
                <th scope="col" className={`${HEAD_CELL} pr-3`}>Campaign</th>
                <th scope="col" className={`${HEAD_CELL} pr-3`}>Platform</th>
                <th scope="col" className={`${HEAD_CELL} pr-3`}>Path</th>
                <th scope="col" className={`${HEAD_CELL} pr-3`}>Status</th>
                <th scope="col" className={HEAD_CELL}>Created</th>
              </tr>
            </thead>
            <tbody>
              {unfinishedRows.map(u => (
                <tr key={`unfinished-${u.id}`} className="group border-b border-line-subtle">
                  <td className="py-2.5 pr-3">
                    <Link href={`/brief?resume=${u.id}`} className={`${TOPIC_LINK} ${FOCUS_ROUNDED}`}>
                      {u.topic || 'Untitled brief'}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 text-fg-muted">—</td>
                  <td className="py-2.5 pr-3 text-fg-muted">—</td>
                  <td className="py-2.5 pr-3 text-fg-muted">—</td>
                  <td className="py-2.5 pr-3">
                    <StatusChip status="unfinished" />
                  </td>
                  <td className="whitespace-nowrap py-2.5 text-ui-xs text-fg-muted">
                    <span className="inline-flex items-center gap-3">
                      {u.updatedAtLabel}
                      <Link href={`/brief?resume=${u.id}`} className={`text-ui-xs font-semibold ${TEXT_LINK} ${FOCUS_ROUNDED}`}>
                        Resume
                      </Link>
                      <button
                        type="button"
                        aria-label="Discard unfinished brief"
                        disabled={discarding === u.id}
                        onClick={() => void discardUnfinished(u)}
                        className={`inline-flex items-center text-fg-muted transition-colors duration-fast ease-standard hover:text-status-failed disabled:opacity-50 ${FOCUS_ROUNDED}`}
                      >
                        <Trash2 size={15} strokeWidth={1.4} />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
              {rows.map(d => (
                <tr key={d.id} className="group border-b border-line-subtle">
                  <td className="py-2.5 pr-3">
                    <Link href={`/drafts/${d.id}`} className={`${TOPIC_LINK} ${FOCUS_ROUNDED}`}>
                      {d.brief?.topic ?? 'Untitled'}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 text-fg-muted">{d.brief?.campaign?.name ?? '—'}</td>
                  <td className="py-2.5 pr-3 text-fg-muted">{channelLabel(d.brief?.channels ?? [])}</td>
                  <td className="py-2.5 pr-3 text-fg-muted">
                    {d.brief?.designMode === 'TEMPLATE' ? 'A' : 'B'}
                  </td>
                  <td className="py-2.5 pr-3">
                    <StatusChip status={DRAFT_CHIP[d.status]} />
                  </td>
                  <td className="whitespace-nowrap py-2.5 text-ui-xs text-fg-muted">{d.createdAtLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
