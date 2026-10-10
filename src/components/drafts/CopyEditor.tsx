'use client'

import React, { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Check, Sparkles, Undo2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SectionHead } from '@/components/ui/SectionHead'
import { ICON } from '@/components/ui/folio'
import { apiFetch } from '@/lib/apiFetch'
import { channelLabel, channelCopyLimit } from '@/lib/channels'
import { useUndoableAction } from '@/lib/hooks/useUndoableAction'
import type { DraftAction } from '@/lib/api-types'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CopyEditorDraft {
  id: string
  copyText: string
  pendingAction: DraftAction | null
  pendingActionError: string | null
  brief: {
    channels: string[]
  }
}

export interface CopyEditorProps {
  draft: CopyEditorDraft
  onSaved: (copyText: string) => void
  /** Called right after an async action is accepted (202) so the parent can
   *  refetch the draft and start polling `pendingAction`. */
  onActionStarted: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function copyLimitFor(channels: string[]): { channel: string; limit: number } {
  let chosen = { channel: 'LinkedIn', limit: 3000 }
  for (const ch of channels) {
    const limit = channelCopyLimit(ch)
    if (limit !== undefined && limit < chosen.limit) {
      chosen = { channel: channelLabel(ch), limit }
    }
  }
  return chosen
}

// ─── Copy editor ────────────────────────────────────────────────────────────

export function CopyEditor({ draft, onSaved, onActionStarted }: CopyEditorProps) {
  const [value, setValue] = useState(draft.copyText)
  // The caption is named by the "Copy" heading (FR-12 row 26).
  const headingId = useId()
  const [saved, setSaved] = useState(true)
  const [saving, setSaving] = useState(false)
  // True only while the regenerate POST itself is in flight (202 arrives fast);
  // the background run is tracked via the polled `draft.pendingAction`.
  const [firing, setFiring] = useState(false)
  // Background-failure message surfaced inline next to the Regenerate button.
  const [regenError, setRegenError] = useState<string | null>(null)
  // Holds the copy that was live before the last regenerate, enabling one-click Undo.
  const undoAction = useUndoableAction<string>(async (previousCopy) => {
    await apiFetch(`/api/drafts/${draft.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ copyText: previousCopy }),
    })
    setValue(previousCopy)
    setSaved(true)
    onSaved(previousCopy)
  })

  useEffect(() => {
    setValue(draft.copyText)
    setSaved(true)
  }, [draft.copyText])

  // A regenerate is running in the background; the new copy arrives via the
  // parent's poll (the effect above syncs it into the textarea).
  const copyActionPending = draft.pendingAction === 'REGENERATE_COPY'
  // Any in-flight action (incl. design/refine) blocks firing a new one — the
  // server would 409 anyway.
  const anyActionPending = draft.pendingAction !== null

  // Detect the REGENERATE_COPY → null transition: on background failure show
  // the error inline and drop the (now pointless) undo snapshot.
  const prevActionRef = useRef<DraftAction | null>(draft.pendingAction)
  const undoClear = undoAction.clear
  useEffect(() => {
    const prev = prevActionRef.current
    prevActionRef.current = draft.pendingAction
    if (prev === 'REGENERATE_COPY' && draft.pendingAction === null && draft.pendingActionError) {
      setRegenError(draft.pendingActionError)
      undoClear()
    }
  }, [draft.pendingAction, draft.pendingActionError, undoClear])

  const { channel, limit } = copyLimitFor(draft.brief.channels)
  const over = value.length > limit

  async function save() {
    if (saved || value === draft.copyText) {
      setSaved(true)
      return
    }
    setSaving(true)
    try {
      await apiFetch(`/api/drafts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copyText: value }),
      })
      setSaved(true)
      onSaved(value)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function regenerate() {
    setFiring(true)
    setRegenError(null)
    // The action runs in the background (202, no payload) — capture the Undo
    // target BEFORE firing; the regenerated copy arrives via the parent's poll.
    undoAction.capture(draft.copyText)
    try {
      await apiFetch(`/api/drafts/${draft.id}/regenerate-copy`, { method: 'POST' })
      // Refetch immediately so the parent picks up pendingAction and polls.
      onActionStarted()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to regenerate copy')
    } finally {
      setFiring(false)
    }
  }

  const regenerating = firing || copyActionPending
  const busy = regenerating || undoAction.undoing

  return (
    <section className="pt-[22px] pb-1.5">
      <SectionHead numeral="i." title="Copy" id={headingId} className="mb-3">
        {copyActionPending ? (
          <span className="flex items-center gap-1.5 text-fg-muted">
            <Loader2 {...ICON} className="animate-spin" aria-hidden /> Regenerating…
          </span>
        ) : saving ? (
          <span className="flex items-center gap-1.5 text-fg-muted">
            <Loader2 {...ICON} className="animate-spin" aria-hidden /> Saving…
          </span>
        ) : saved ? (
          <span className="flex items-center gap-1.5 font-semibold text-status-published">
            <Check {...ICON} aria-hidden /> Saved
          </span>
        ) : (
          <span className="font-semibold text-status-scheduled">Unsaved changes</span>
        )}
        {undoAction.snapshot !== null && (
          <Button
            variant="ghost"
            size="sm"
            onClick={undoAction.undo}
            disabled={busy || anyActionPending}
            title="Restore the previous copy"
          >
            {undoAction.undoing ? <Loader2 {...ICON} className="animate-spin" /> : <Undo2 {...ICON} />} Undo
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={regenerate} disabled={busy || anyActionPending}>
          {regenerating ? <Loader2 {...ICON} className="animate-spin" /> : <Sparkles {...ICON} />} Regenerate
        </Button>
      </SectionHead>
      {regenError && (
        <p className="mb-2 flex items-start gap-1.5 text-ui-xs text-status-failed">
          <AlertTriangle {...ICON} className="mt-0.5 flex-shrink-0" aria-hidden />
          <span className="line-clamp-3">{regenError}</span>
        </p>
      )}
      {/* The ruled caption field (§8.3): a 1 px --line-subtle rule every 26 px,
          scrolling with the text. Only the caption is ruled. */}
      <textarea
        aria-labelledby={headingId}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setSaved(false)
        }}
        onBlur={save}
        disabled={busy}
        rows={10}
        className={[
          'block w-full resize-y rounded-ui-sm border border-line bg-surface-raised px-4 py-1',
          'font-text text-ui-sm leading-[26px] text-fg placeholder:text-fg-muted',
          '[background-image:repeating-linear-gradient(to_bottom,transparent_0,transparent_25px,rgb(var(--line-subtle))_25px,rgb(var(--line-subtle))_26px)]',
          '[background-attachment:local] [background-position:0_4px]',
          'transition-[border-color,box-shadow] duration-fast ease-standard',
          'focus:outline-none focus:border-focus focus:ring-1 focus:ring-focus',
          'disabled:cursor-not-allowed disabled:opacity-60',
          copyActionPending ? 'animate-pulse' : '',
        ].join(' ')}
        placeholder="Post copy…"
      />
      <div className="mt-2 flex justify-end">
        <span className={`text-ui-xs ${over ? 'font-semibold text-status-failed' : 'text-fg-muted'}`}>
          {value.length} / {limit} ({channel})
        </span>
      </div>
    </section>
  )
}
