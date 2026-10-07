'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import {
  Loader2,
  RotateCcw,
  Download,
  ImageIcon,
  ArrowLeft,
  Sparkles,
  Undo2,
  Maximize2,
  AlertTriangle,
  Pencil,
} from 'lucide-react'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { StatusChip } from '@/components/ui/StatusChip'
import { PublishDialog } from '@/components/library/PublishDialog'
import { CopyEditor } from '@/components/drafts/CopyEditor'
import { RefinementPanel } from '@/components/drafts/RefinementPanel'
import { InlineEditModal } from '@/components/drafts/InlineEditModal'
import { BackgroundNotice } from '@/components/drafts/BackgroundNotice'
import { SectionHead } from '@/components/drafts/SectionHead'
import { FOCUS, ICON, PAGE_TITLE, SECTION, SMALL_CAPS, SUB_HEAD } from '@/components/drafts/folio'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useUndoableAction } from '@/lib/hooks/useUndoableAction'
import type { DraftAction, DraftDetail } from '@/lib/api-types'
import { ASPECT_LABELS, aspectClassFor, dimensionsFor } from '@/lib/aspectRatio'
import { channelLabel } from '@/lib/channels'
import { formatDateTime } from '@/lib/format'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Revision {
  id: string
  revisionNumber: number
  instruction: string
  exportUrl: string | null
  createdAt: string
}

const STATUS_TO_CHIP: Record<DraftDetail['status'], 'draft' | 'exported' | 'published' | 'failed'> = {
  IN_PROGRESS: 'draft',
  EXPORTED: 'exported',
  PUBLISHED: 'published',
  FAILED: 'failed',
}

// A proof-plate crop mark (DESIGN_SYSTEM.md §8.12): 18 px, 1 px --line, inset
// 20 px from its corner; each mark draws two of its four edges.
const CROP = 'pointer-events-none absolute h-[18px] w-[18px] border-line'

// The expand badge sits on the post image, which can be any colour, so it
// uses fixed ink-on-paper values that read in both themes (§8.12): 30 × 30,
// inset 10 px, shown while the post is hovered or keyboard-focused.
const EXPAND_BADGE =
  'absolute right-2.5 top-2.5 inline-flex h-[30px] w-[30px] items-center justify-center rounded-ui-sm border border-[#211c18] bg-[#fffefb] text-[#211c18] opacity-0 transition-opacity duration-fast ease-standard group-hover:opacity-100 group-focus-visible:opacity-100' // ui-exception: drawn on the post image, fixed ink-on-paper per DESIGN_SYSTEM.md §8.12

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DraftDetailPage() {
  const params = useParams<{ id: string }>()
  const draftId = params.id

  const [draft, setDraft] = useState<DraftDetail | null>(null)
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [restoringRev, setRestoringRev] = useState<number | null>(null)
  const { isTeamAdmin } = useCurrentUser()
  const [showPublish, setShowPublish] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showInlineEdit, setShowInlineEdit] = useState(false)
  const [regenDesign, setRegenDesign] = useState(false)
  // Snapshot = revisionNumber of the design taken before the last regenerate (Undo target).
  const designUndo = useUndoableAction<number>(async (rev) => {
    await apiFetch(`/api/drafts/${draftId}/revisions/${rev}/restore`, { method: 'POST' })
    refreshAfterChange()
  })

  const fetchDraft = useCallback(async () => {
    try {
      const data = await apiFetch<DraftDetail>(`/api/drafts/${draftId}`)
      setDraft(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [draftId])

  const fetchRevisions = useCallback(async () => {
    try {
      setRevisions(await apiFetch<Revision[]>(`/api/drafts/${draftId}/revisions`))
    } catch {
      // Non-fatal — revision list is supplementary.
    }
  }, [draftId])

  useEffect(() => {
    fetchDraft()
    fetchRevisions()
  }, [fetchDraft, fetchRevisions])

  // Poll while a draft is still generating — or while an async action
  // (regenerate/refine) is running — so the preview updates without a
  // manual refresh.
  useEffect(() => {
    if (draft?.status !== 'IN_PROGRESS' && draft?.pendingAction == null) return
    const timer = setInterval(fetchDraft, 4000)
    return () => clearInterval(timer)
  }, [draft?.status, draft?.pendingAction, fetchDraft])

  // When a background action completes (pendingAction non-null → null) it may
  // have created a new revision — refresh the revision list.
  const prevPendingActionRef = useRef<DraftAction | null>(null)
  useEffect(() => {
    const prev = prevPendingActionRef.current
    prevPendingActionRef.current = draft?.pendingAction ?? null
    if (prev != null && draft?.pendingAction == null) {
      fetchRevisions()
    }
  }, [draft?.pendingAction, fetchRevisions])

  function refreshAfterChange() {
    fetchDraft()
    fetchRevisions()
  }

  async function handleExport() {
    setExporting(true)
    try {
      await apiFetch('/api/generate/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId }),
      })
      await fetchDraft()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setExporting(false)
    }
  }

  async function handleRestore(rev: number) {
    setRestoringRev(rev)
    try {
      await apiFetch(`/api/drafts/${draftId}/revisions/${rev}/restore`, { method: 'POST' })
      await fetchDraft()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setRestoringRev(null)
    }
  }

  async function handleRetry() {
    setRetrying(true)
    try {
      await apiFetch(`/api/drafts/${draftId}/retry`, { method: 'POST' })
      // Back to IN_PROGRESS — refetch immediately; the poll takes over from here.
      await fetchDraft()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Retry failed')
    } finally {
      setRetrying(false)
    }
  }

  async function handleRegenerateDesign() {
    if (!draft) return
    setRegenDesign(true)
    // The action runs in the background (202, no payload) — capture the Undo
    // target (the revision we're on right now) BEFORE firing. Legacy drafts
    // without a revision pointer have nothing to undo to.
    if (draft.currentRevisionNumber != null) {
      designUndo.capture(draft.currentRevisionNumber)
    } else {
      designUndo.clear()
    }
    try {
      await apiFetch(`/api/drafts/${draftId}/regenerate-design`, { method: 'POST' })
      // Refetch immediately to pick up pendingAction; the poll takes over.
      await fetchDraft()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to regenerate design')
    } finally {
      setRegenDesign(false)
    }
  }

  const isPathB = draft?.brief.designMode === 'GENERATE'
  const isGenerating = draft?.status === 'IN_PROGRESS'
  // An async action (regenerate/refine) is running in the background.
  const actionPending = draft?.pendingAction != null
  const designActionPending =
    draft?.pendingAction === 'REGENERATE_DESIGN' || draft?.pendingAction === 'REFINE'
  const isFailed = draft?.status === 'FAILED'
  // Copy resolves independently of the image: show it the moment it's written,
  // even while the design is still rendering. The skeleton stands in for copy
  // that hasn't been WRITTEN YET, which only happens before the design exists
  // (generation writes copy first) — a draft that already has a design has
  // finished generating, so empty copy there is a deliberate deletion and must
  // show the editable field, never a skeleton the user can't type into.
  const copyPending = isGenerating && !draft?.copyText && !draft?.htmlContent
  const ready = draft?.status === 'EXPORTED' || draft?.status === 'PUBLISHED'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={28} strokeWidth={1.4} className="animate-spin text-fg-muted" />
      </div>
    )
  }

  if (error || !draft) {
    return (
      <Panel className="mx-auto mt-12 max-w-md p-12 text-center">
        <p className="mb-3 text-ui-sm text-fg">{error ?? 'Draft not found.'}</p>
        <Link href="/library">
          <Button variant="secondary" size="sm">
            <ArrowLeft {...ICON} /> Back to Library
          </Button>
        </Link>
      </Panel>
    )
  }

  const { width, height } = dimensionsFor(draft.brief.aspectRatio)
  const ratioShort = ASPECT_LABELS[draft.brief.aspectRatio ?? 'SQUARE'].split(' ')[0]
  const currentRevision = revisions.find((r) => r.revisionNumber === draft.currentRevisionNumber)
  // The contact sheet reads left to right, oldest first, like the study (§8.13);
  // the API lists newest first.
  const versions = [...revisions].sort((a, b) => a.revisionNumber - b.revisionNumber)

  return (
    <>
      <Link
        href="/library"
        className={`mb-6 inline-flex items-center gap-1.5 text-ui-sm text-fg-muted underline decoration-line underline-offset-4 transition-colors duration-fast ease-standard hover:text-fg ${FOCUS}`}
      >
        <ArrowLeft {...ICON} /> Library
      </Link>

      {/* The spread (DESIGN_SYSTEM.md §6): the proof and the copy desk side by
          side only where a 500 px proof and a desk of at least 480 px both fit
          beside the sidebar; otherwise one column, proof first. */}
      <div className="grid grid-cols-1 items-start gap-10 min-[1360px]:grid-cols-[500px_minmax(0,1fr)] min-[1360px]:gap-14">
        {/* ── Left: the proof ─────────────────────────────────────────────── */}
        <div className="w-full min-w-0 max-w-[500px]">
          {/* The proof plate (§8.12): paper, a hairline edge, crop marks. */}
          <div className="relative border border-line-subtle bg-surface-raised p-10">
            <span aria-hidden className={`${CROP} left-5 top-5 border-l border-t`} />
            <span aria-hidden className={`${CROP} right-5 top-5 border-r border-t`} />
            <span aria-hidden className={`${CROP} bottom-5 left-5 border-b border-l`} />
            <span aria-hidden className={`${CROP} bottom-5 right-5 border-b border-r`} />

            {/* The post, at its own aspect ratio, never cropped or restyled. */}
            <div className={`relative ${aspectClassFor(draft.brief.aspectRatio)} w-full bg-surface`}>
              {draft.exportUrl ? (
                <button
                  onClick={() => setShowPreview(true)}
                  aria-label="View full screen"
                  title="View full screen"
                  className={`group relative block h-full w-full cursor-zoom-in ${FOCUS}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={draft.exportUrl}
                    alt={draft.brief.topic}
                    className="block h-full w-full object-contain"
                  />
                  <span aria-hidden className={EXPAND_BADGE}>
                    <Maximize2 {...ICON} />
                  </span>
                </button>
              ) : isGenerating ? (
                <div
                  className="absolute inset-0 flex animate-pulse flex-col items-center justify-center gap-3 bg-surface"
                  aria-label="Generating design"
                  role="status"
                >
                  <Loader2 size={28} strokeWidth={1.4} className="animate-spin text-fg-muted" />
                  <span className="text-ui-xs text-fg-muted">Designing your post…</span>
                </div>
              ) : isFailed ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <AlertTriangle size={28} strokeWidth={1.4} className="text-status-failed" />
                  <span className="text-ui-sm font-semibold text-fg">Generation failed</span>
                  <span className="line-clamp-3 text-ui-xs text-fg-muted">
                    {draft.failureReason ?? 'Something went wrong while generating this post.'}
                  </span>
                  <Button variant="secondary" size="sm" onClick={handleRetry} disabled={retrying}>
                    {retrying ? <Loader2 {...ICON} className="animate-spin" /> : <RotateCcw {...ICON} />}
                    Retry
                  </Button>
                </div>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                  <ImageIcon size={32} strokeWidth={1.4} className="text-fg-muted" />
                  <span className="text-ui-xs text-fg-muted">No preview available</span>
                </div>
              )}
              {/* In-progress overlay for background design actions — the current
                  image stays visible underneath (NOT the generation skeleton).
                  The words sit on an opaque label, never on the scrim (§4.2). */}
              {designActionPending && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center bg-scrim/40"
                  aria-label={draft.pendingAction === 'REFINE' ? 'Refining design' : 'Regenerating design'}
                  role="status"
                >
                  <span className="surface-raised flex items-center gap-2 px-3 py-2 text-ui-xs font-semibold text-fg">
                    <Loader2 {...ICON} className="animate-spin" />
                    {draft.pendingAction === 'REFINE' ? 'Refining design…' : 'Regenerating design…'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* The caption line beneath the plate (§8.12). */}
          <div className="mt-3.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-ui-xs text-fg-muted">
            <span className="min-w-0 break-words">
              <i className="font-display text-ui-sm text-fg">Preview</i>
              {currentRevision && (
                <span>
                  , v{currentRevision.revisionNumber} of {revisions.length} — {currentRevision.instruction}
                </span>
              )}
            </span>
            <span className="whitespace-nowrap">
              {width} × {height} · {ratioShort}
            </span>
          </div>

          {/* 005 FR-07: why this design has no AI background, when that
              was not the model's choice. Non-blocking. */}
          {draft.backgroundSkipped && <BackgroundNotice skipped={draft.backgroundSkipped} />}

          {/* Versions, as a contact sheet (§8.13). Undo sits beside them. */}
          <div className="mb-2.5 mt-7 flex items-baseline justify-between gap-3 border-b border-fg pb-2">
            <h2 className={SUB_HEAD}>Revision History</h2>
            {/* Regenerate design's Undo — Path B only, like the button itself. */}
            {isPathB && designUndo.snapshot !== null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={designUndo.undo}
                disabled={regenDesign || designUndo.undoing || actionPending}
                title="Go back to the previous design"
              >
                {designUndo.undoing ? <Loader2 {...ICON} className="animate-spin" /> : <Undo2 {...ICON} />}
                Undo
              </Button>
            )}
          </div>
          {revisions.length === 0 ? (
            <p className="text-ui-sm text-fg-muted">No revisions yet.</p>
          ) : (
            <ul className="grid grid-cols-4 gap-3 sm:gap-5">
              {versions.map((r) => {
                const isCurrent = r.revisionNumber === draft.currentRevisionNumber
                const frame = (
                  <>
                    {/* A version's own render, shown as rendered (§8.12). */}
                    <span
                      className={[
                        `relative block w-full max-w-[72px] ${aspectClassFor(draft.brief.aspectRatio)} bg-surface`,
                        'outline outline-offset-[3px] transition-[outline-color] duration-fast ease-standard',
                        isCurrent ? 'outline-2 outline-fg' : 'outline-1 outline-line-subtle group-hover:outline-line',
                      ].join(' ')}
                    >
                      {r.exportUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.exportUrl} alt="" className="block h-full w-full object-contain" />
                      )}
                    </span>
                    <span className="mt-2.5 flex flex-wrap items-baseline gap-x-1.5 font-display text-ui-base font-medium text-fg">
                      v{r.revisionNumber}
                      {isCurrent && <span className={`${SMALL_CAPS} font-text text-accent`}>Current</span>}
                      {restoringRev === r.revisionNumber && (
                        <Loader2 {...ICON} className="animate-spin self-center text-fg-muted" />
                      )}
                    </span>
                    <span className="line-clamp-2 break-words text-ui-xs leading-snug text-fg-muted">
                      {r.instruction}
                    </span>
                    <span className="mt-0.5 block text-ui-2xs leading-snug text-fg-muted">
                      {formatDateTime(r.createdAt)}
                    </span>
                  </>
                )
                return (
                  <li key={r.id} className="min-w-0">
                    {/* Cells are narrow, so the clamped instruction is repeated in
                        the tooltip; the accessible name stays "Switch to vN". */}
                    {isCurrent ? (
                      <div aria-current="true" title={r.instruction ?? undefined}>
                        {frame}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRestore(r.revisionNumber)}
                        disabled={restoringRev !== null || actionPending}
                        aria-label={`Switch to v${r.revisionNumber}`}
                        title={`Switch to v${r.revisionNumber}${r.instruction ? ` — ${r.instruction}` : ''}`}
                        className={`group block w-full text-left disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
                      >
                        {frame}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* ── Right: the copy desk ────────────────────────────────────────── */}
        <div className="min-w-0">
          <p className={`${SMALL_CAPS} text-fg-muted`}>
            Draft{draft.brandKitName ? ` · ${draft.brandKitName}` : ''}
          </p>
          <h1 className={`mb-3 mt-2 break-words ${PAGE_TITLE}`}>{draft.brief.topic}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ui-sm text-fg-muted">
            <StatusChip status={STATUS_TO_CHIP[draft.status]} />
            <span>
              {draft.brief.channels.map(channelLabel).join(', ')} · {ratioShort}
            </span>
          </div>

          {/* The action bar (§8.17, within FR-12): every control stays a visible
              button with its own name. The design action on the left; the rest
              on the right, Publish the one primary. It wraps, never scrolls. */}
          <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-t-2 border-b-line-subtle border-t-fg py-3.5">
            {/* Regenerate design — Path B (freeform) only. Produces a fresh design
                variant; the prior one is saved to history and offered as Undo. */}
            {isPathB && (
              <Button
                variant="secondary"
                onClick={handleRegenerateDesign}
                disabled={regenDesign || designUndo.undoing || !draft.htmlContent || actionPending}
                title="Generate a brand-new design from the same brief"
              >
                {regenDesign || draft.pendingAction === 'REGENERATE_DESIGN' ? (
                  <Loader2 {...ICON} className="animate-spin" />
                ) : (
                  <Sparkles {...ICON} />
                )}
                Regenerate design
              </Button>
            )}
            <div className="ml-auto flex flex-wrap justify-end gap-2">
              {ready && (
                <Button
                  variant="secondary"
                  onClick={() => setShowInlineEdit(true)}
                  disabled={actionPending || !draft.htmlContent}
                  title="Manually edit text and images, then re-export"
                >
                  <Pencil {...ICON} /> Edit inline
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={handleExport}
                disabled={exporting || !draft.htmlContent || actionPending}
              >
                {exporting ? <Loader2 {...ICON} className="animate-spin" /> : <Download {...ICON} />}
                {draft.exportUrl ? 'Re-export' : 'Export'}
              </Button>
              {isTeamAdmin && (
                <Button
                  variant="primary"
                  disabled={!draft.exportUrl || actionPending}
                  onClick={() => setShowPublish(true)}
                >
                  Publish
                </Button>
              )}
            </div>
          </div>
          {isPathB && regenDesign && (
            <p className="mt-3 flex items-center gap-1.5 text-ui-xs text-fg-muted">
              <Loader2 {...ICON} className="animate-spin" /> Designing a new variant — up to a minute…
            </p>
          )}

          {/* A background action failed — surface the error inline; the
              buttons above are re-enabled so the user can simply re-trigger.
              Claiming a new run does not clear the message (it is hidden
              while that run is pending); the run settling does: success
              clears it, a failure replaces it. */}
          {draft.pendingActionError && !actionPending && (
            <p className="mt-3 flex items-start gap-1.5 text-ui-xs text-status-failed">
              <AlertTriangle {...ICON} className="mt-0.5 flex-shrink-0" />
              <span className="line-clamp-3">{draft.pendingActionError}</span>
            </p>
          )}

          {/* The copy desk (§8.14): ruled sections. The caption (012) and the
              refine panel (008) stay self-contained components. */}
          <div className="divide-y divide-line-subtle">
            {copyPending ? (
              <section className={SECTION}>
                <SectionHead numeral="i." title="Copy" />
                <div className="animate-pulse space-y-2.5" aria-label="Generating copy" role="status">
                  <div className="h-4 w-3/4 rounded-ui-sm bg-line-subtle" />
                  <div className="h-4 w-full rounded-ui-sm bg-line-subtle" />
                  <div className="h-4 w-5/6 rounded-ui-sm bg-line-subtle" />
                  <div className="h-4 w-2/3 rounded-ui-sm bg-line-subtle" />
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-ui-xs text-fg-muted">
                  <Loader2 {...ICON} className="animate-spin" /> Writing the copy…
                </p>
              </section>
            ) : (
              <CopyEditor draft={draft} onSaved={() => fetchDraft()} onActionStarted={fetchDraft} />
            )}
            {/* Refinement only makes sense once there's a rendered design to refine. */}
            {ready && (
              <RefinementPanel
                draftId={draftId}
                pendingAction={draft.pendingAction}
                pendingActionError={draft.pendingActionError}
                conflict={draft.conflict}
                notApplied={draft.notApplied}
                currentRevisionNumber={draft.currentRevisionNumber}
                onActionStarted={fetchDraft}
                onRefined={refreshAfterChange}
              />
            )}
          </div>
        </div>
      </div>

      {/* Full-screen preview of the exported PNG. */}
      {draft.exportUrl && (
        <ImageLightbox
          open={showPreview}
          onClose={() => setShowPreview(false)}
          src={draft.exportUrl}
          topic={draft.brief.topic}
          aspectRatio={draft.brief.aspectRatio}
        />
      )}

      {/* Publish dialog — channel + optional schedule (shared with Library). */}
      {showPublish && (
        <PublishDialog
          draftId={draftId}
          onClose={() => setShowPublish(false)}
          onSuccess={() => {
            setShowPublish(false)
            fetchDraft()
          }}
        />
      )}

      {/* Manual inline edit — sandboxed iframe; whole-document text + image
          edits, or single-element edits (change 004 T24). Mounted per open so
          the modal reads html + revision pointer from THIS draft read, once. */}
      {draft.htmlContent && showInlineEdit && (
        <InlineEditModal
          open={showInlineEdit}
          onClose={() => setShowInlineEdit(false)}
          draftId={draftId}
          html={draft.htmlContent}
          baseRevisionNumber={draft.currentRevisionNumber}
          aspectRatio={draft.brief.aspectRatio}
          onSaved={refreshAfterChange}
        />
      )}
    </>
  )
}
