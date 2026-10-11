'use client'

import React, { createRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Sparkles } from 'lucide-react'
import type { Channel } from '@prisma/client'
import { Button } from '@/components/ui/Button'
import { SectionHead } from '@/components/ui/SectionHead'
import { ICON } from '@/components/ui/folio'
import { apiFetch } from '@/lib/apiFetch'
import { CAPTION_CHANNELS } from '@/lib/channels'
import { captionActionTargets } from '@/lib/captions/actionTargets'
import type { DraftDetail } from '@/lib/api-types'
import { CaptionPanel, type CaptionUndoHandle } from './CaptionPanel'
import { HeadlinePanel } from './HeadlinePanel'

export interface CaptionPanelsProps {
  draft: Pick<DraftDetail, 'id' | 'headline' | 'captions' | 'pendingAction' | 'pendingActionError' | 'status'>
  /** Called after an edit is saved, so the parent refetches the draft. */
  onSaved: () => void
  /** Called right after an async action is accepted (202) so the parent can
   *  refetch the draft and start polling `pendingAction`. */
  onActionStarted: () => void | Promise<unknown>
}

// The regenerate-copy bodies (012 FR-11): {} is "Regenerate all" (the three
// captions, never the headline — A9).
type RegenerateBody = Record<string, never> | { channel: Channel } | { headline: true }

// The caption desk (012 FR-18): "i. Captions" with "Regenerate all" in its
// tail, then the headline and one panel per registry channel, in registry
// order. Each panel owns its Regenerate and its Undo (FR-19). A background
// failure is shown by the page's pendingActionError line; a channel's own
// failure by its panel.
export function CaptionPanels({ draft, onSaved, onActionStarted }: CaptionPanelsProps) {
  // True while a regenerate POST is in flight and until the refetch after its
  // 202 has landed, so no panel can fire a second request (which would 409) in
  // the gap before pendingAction is seen. The background run is tracked via
  // the polled pendingAction and row status.
  const [firing, setFiring] = useState(false)
  // One undo handle per caption panel, so "Regenerate all" can capture all three.
  const [undoRefs] = useState(
    () => new Map(CAPTION_CHANNELS.map((s) => [s.channel, createRef<CaptionUndoHandle>()]))
  )

  const ready = draft.status === 'EXPORTED' || draft.status === 'PUBLISHED'
  const writing = draft.status === 'IN_PROGRESS' && draft.captions.some((c) => c.status === 'PENDING')
  const regenerating = firing || draft.pendingAction === 'REGENERATE_COPY'
  // Single-flight is draft-level (A2): any in-flight action blocks every
  // panel's Regenerate and Undo — the server would 409 anyway.
  const locked = firing || draft.pendingAction !== null

  async function regenerate(body: RegenerateBody, failure: string): Promise<boolean> {
    setFiring(true)
    try {
      await apiFetch(`/api/drafts/${draft.id}/regenerate-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : failure)
      setFiring(false)
      return false
    }
    // Accepted (202). Refetch so the parent picks up pendingAction and polls;
    // a failed refetch never turns the accept into a refusal.
    try {
      await onActionStarted()
    } catch {
      // The parent's fetch reports its own errors.
    } finally {
      setFiring(false)
    }
    return true
  }

  async function regenerateAll() {
    // Let a blur-save in flight land first, then capture every caption's Undo
    // target BEFORE firing; put the previous ones back if refused.
    await Promise.all([...undoRefs.values()].map((r) => r.current?.flush()))
    const reverts = [...undoRefs.values()].flatMap((r) => (r.current ? [r.current.capture()] : []))
    if (!(await regenerate({}, 'Failed to regenerate the captions'))) reverts.forEach((revert) => revert())
  }

  return (
    <section className="pt-[22px] pb-1.5">
      <SectionHead numeral="i." title="Captions" className="mb-3">
        {regenerating && (
          <span className="flex items-center gap-1.5 text-fg-muted">
            <Loader2 {...ICON} className="animate-spin" aria-hidden /> Regenerating…
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={regenerateAll} disabled={!ready || locked}>
          {regenerating ? <Loader2 {...ICON} className="animate-spin" /> : <Sparkles {...ICON} />} Regenerate all
        </Button>
      </SectionHead>
      {writing && (
        <p className="mb-3 flex items-center gap-1.5 text-ui-xs text-fg-muted">
          <Loader2 {...ICON} className="animate-spin" aria-hidden /> Writing the captions…
        </p>
      )}
      <div className="space-y-6">
        <HeadlinePanel
          draftId={draft.id}
          headline={draft.headline}
          busy={captionActionTargets(draft).includes('HEADLINE')}
          ready={ready}
          locked={locked}
          editLocked={draft.pendingAction === 'REGENERATE_COPY'}
          onRegenerate={() => regenerate({ headline: true }, 'Failed to regenerate the headline')}
          onSaved={onSaved}
        />
        {draft.captions.map((caption) => (
          <CaptionPanel
            key={caption.channel}
            draftId={draft.id}
            caption={caption}
            ready={ready}
            locked={locked}
            onRegenerate={() => regenerate({ channel: caption.channel }, 'Failed to regenerate the caption')}
            undoRef={undoRefs.get(caption.channel)}
            onSaved={onSaved}
          />
        ))}
      </div>
    </section>
  )
}
