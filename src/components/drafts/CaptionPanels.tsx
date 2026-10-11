'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SectionHead } from '@/components/ui/SectionHead'
import { ICON } from '@/components/ui/folio'
import { apiFetch } from '@/lib/apiFetch'
import type { DraftDetail } from '@/lib/api-types'
import { CaptionPanel } from './CaptionPanel'

export interface CaptionPanelsProps {
  draft: Pick<DraftDetail, 'id' | 'headline' | 'captions' | 'pendingAction' | 'pendingActionError' | 'status'>
  /** Called after an edit is saved, so the parent refetches the draft. */
  onSaved: () => void
  /** Called right after an async action is accepted (202) so the parent can
   *  refetch the draft and start polling `pendingAction`. */
  onActionStarted: () => void
}

// The caption desk (012 FR-18, wave-1 base): "i. Captions" with "Regenerate
// all" in its tail, then one panel per registry channel, in registry order.
// A background failure is shown by the page's pendingActionError line; a
// channel's own failure by its panel.
export function CaptionPanels({ draft, onSaved, onActionStarted }: CaptionPanelsProps) {
  // True only while the regenerate POST itself is in flight (202 arrives fast);
  // the background run is tracked via the polled pendingAction and row status.
  const [firing, setFiring] = useState(false)

  const ready = draft.status === 'EXPORTED' || draft.status === 'PUBLISHED'
  const writing = draft.status === 'IN_PROGRESS' && draft.captions.some((c) => c.status === 'PENDING')
  const regenerating = firing || draft.pendingAction === 'REGENERATE_COPY'

  async function regenerateAll() {
    setFiring(true)
    try {
      await apiFetch(`/api/drafts/${draft.id}/regenerate-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      // Refetch immediately so the parent picks up pendingAction and polls.
      onActionStarted()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to regenerate the captions')
    } finally {
      setFiring(false)
    }
  }

  return (
    <section className="pt-[22px] pb-1.5">
      <SectionHead numeral="i." title="Captions" className="mb-3">
        {regenerating && (
          <span className="flex items-center gap-1.5 text-fg-muted">
            <Loader2 {...ICON} className="animate-spin" aria-hidden /> Regenerating…
          </span>
        )}
        {/* Any in-flight action blocks a new one — the server would 409 anyway. */}
        <Button
          variant="ghost"
          size="sm"
          onClick={regenerateAll}
          disabled={!ready || firing || draft.pendingAction !== null}
        >
          {regenerating ? <Loader2 {...ICON} className="animate-spin" /> : <Sparkles {...ICON} />} Regenerate all
        </Button>
      </SectionHead>
      {writing && (
        <p className="mb-3 flex items-center gap-1.5 text-ui-xs text-fg-muted">
          <Loader2 {...ICON} className="animate-spin" aria-hidden /> Writing the captions…
        </p>
      )}
      <div className="space-y-6">
        {draft.captions.map((caption) => (
          <CaptionPanel key={caption.channel} draftId={draft.id} caption={caption} onSaved={onSaved} />
        ))}
      </div>
    </section>
  )
}
