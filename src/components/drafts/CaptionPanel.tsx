'use client'

import React, { useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Check, AlertTriangle, Copy, Sparkles, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SectionHead } from '@/components/ui/SectionHead'
import { Notice } from '@/components/ui/Notice'
import { ICON } from '@/components/ui/folio'
import { apiFetch } from '@/lib/apiFetch'
import { captionLength, captionSpec } from '@/lib/channels'
import { useUndoableAction } from '@/lib/hooks/useUndoableAction'
import type { DraftCaptionDetail } from '@/lib/api-types'

// The ruled caption field (DESIGN_SYSTEM.md §8.3): a 1 px --line-subtle rule
// every 26 px, scrolling with the text. Only captions are ruled.
const RULED_TEXTAREA = [
  'block w-full resize-y rounded-ui-sm border border-line bg-surface-raised px-4 py-1',
  'font-text text-ui-sm leading-[26px] text-fg placeholder:text-fg-muted',
  '[background-image:repeating-linear-gradient(to_bottom,transparent_0,transparent_25px,rgb(var(--line-subtle))_25px,rgb(var(--line-subtle))_26px)]',
  '[background-attachment:local] [background-position:0_4px]',
  'transition-[border-color,box-shadow] duration-fast ease-standard',
  'focus:outline-none focus:border-focus focus:ring-1 focus:ring-focus',
  'disabled:cursor-not-allowed disabled:opacity-60',
].join(' ')

export const count = (n: number) => n.toLocaleString('en-US')

// A panel's save state, in its head's tail: Saving… / Saved / Unsaved changes.
export function SaveState({ saving, saved }: { saving: boolean; saved: boolean }) {
  if (saving) {
    return (
      <span className="flex items-center gap-1.5 text-fg-muted">
        <Loader2 {...ICON} className="animate-spin" aria-hidden /> Saving…
      </span>
    )
  }
  if (saved) {
    return (
      <span className="flex items-center gap-1.5 font-semibold text-status-published">
        <Check {...ICON} aria-hidden /> Saved
      </span>
    )
  }
  return <span className="font-semibold text-status-scheduled">Unsaved changes</span>
}

/** Lets "Regenerate all" take every caption panel's undo snapshot before it
 *  fires. `capture` returns how to put back the snapshot it replaced; `flush`
 *  resolves once the panel's blur-save, if any, has landed. */
export interface CaptionUndoHandle {
  capture: () => () => void
  flush: () => Promise<void>
}

export interface CaptionPanelProps {
  draftId: string
  caption: DraftCaptionDetail
  /** The draft can take a caption action (EXPORTED or PUBLISHED). */
  ready: boolean
  /** Any action is firing or running on the draft (single-flight, A2). */
  locked: boolean
  /** Fires this channel's regenerate; resolves false when it was refused. */
  onRegenerate: () => Promise<boolean>
  undoRef?: React.Ref<CaptionUndoHandle>
  /** Called after an edit is saved, so the parent refetches the draft. */
  onSaved: () => void
}

// One channel's caption (012 FR-18/FR-19): its h3 with the tail (save state,
// Undo, Copy, Generate/Regenerate), the ruled textarea named by that heading
// and saved on blur, the per-registry counter, a FAILED notice, and a skeleton
// only while the row is PENDING. Empty text on a row that is not PENDING always
// shows the editable field (TC-ASYNC-10).
export function CaptionPanel({
  draftId,
  caption,
  ready,
  locked,
  onRegenerate,
  undoRef,
  onSaved,
}: CaptionPanelProps) {
  const spec = captionSpec(caption.channel)
  const headingId = useId()
  const [value, setValue] = useState(caption.text)
  const [saved, setSaved] = useState(true)
  const [saving, setSaving] = useState(false)
  // The caption before the last regenerate; Undo restores only this channel.
  const undo = useUndoableAction<string>(async (previous) => {
    await apiFetch(`/api/drafts/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: caption.channel, text: previous }),
    })
    setValue(previous)
    setSaved(true)
    onSaved()
  })

  // A regenerate's new text arrives through the parent's poll.
  useEffect(() => {
    setValue(caption.text)
    setSaved(true)
  }, [caption.text])

  const pending = caption.status === 'PENDING'

  // An empty caption has nothing to go back to. The snapshot is what the
  // field shows, typed or saved. Returns a revert for a refused request, so a
  // refusal only undoes its own capture and never drops an earlier live Undo.
  const captureUndo = () => {
    const previous = undo.snapshot
    if (value === '') undo.clear()
    else undo.capture(value)
    return () => (previous === null ? undo.clear() : undo.capture(previous))
  }
  // The blur-save in flight, if any. Clicking Regenerate blurs the field first,
  // so a regenerate waits for that PATCH to land; racing the claim, it would 409.
  const inFlightSave = useRef<Promise<void>>(Promise.resolve())
  const flushSave = () => inFlightSave.current
  useImperativeHandle(undoRef, () => ({ capture: captureUndo, flush: flushSave }))

  // A regenerate that settled without changing the text (it failed, and A7
  // kept the caption) leaves nothing to undo.
  const wasPending = useRef(pending)
  const clearUndo = undo.clear
  useEffect(() => {
    const was = wasPending.current
    wasPending.current = pending
    if (was && !pending && caption.text === undo.snapshot) clearUndo()
  }, [pending, caption.text, undo.snapshot, clearUndo])

  const length = captionLength(value)
  const over = spec.hardLimit !== null && length > spec.hardLimit
  const verb = value === '' ? 'Generate' : 'Regenerate'

  async function save() {
    if (saved || value === caption.text) {
      setSaved(true)
      return
    }
    setSaving(true)
    try {
      await apiFetch(`/api/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: caption.channel, text: value }),
      })
      setSaved(true)
      onSaved()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function regenerate() {
    // The action runs in the background (202, no payload): capture the Undo
    // target BEFORE firing, and put the previous one back if refused.
    await flushSave()
    const revert = captureUndo()
    if (!(await onRegenerate())) revert()
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      toast.success('Caption copied')
    } catch {
      // Clipboard can be blocked (insecure origin, no permission).
      toast.error("Couldn't copy. Select the text and copy it manually.")
    }
  }

  return (
    <div>
      <SectionHead level={3} title={spec.label} id={headingId} className="mb-3">
        {!pending && <SaveState saving={saving} saved={saved} />}
        {undo.snapshot !== null && (
          <Button
            variant="ghost"
            size="sm"
            onClick={undo.undo}
            disabled={locked || undo.undoing}
            aria-label={`Undo ${spec.label} caption`}
            title="Restore the previous caption"
          >
            {undo.undoing ? <Loader2 {...ICON} className="animate-spin" /> : <Undo2 {...ICON} />} Undo
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={copy}
          disabled={pending || value === ''}
          aria-label={`Copy ${spec.label} caption`}
        >
          <Copy {...ICON} /> Copy
        </Button>
        {/* Any in-flight action blocks a new one — the server would 409 anyway. */}
        <Button
          variant="ghost"
          size="sm"
          onClick={regenerate}
          disabled={!ready || locked || undo.undoing}
          aria-label={`${verb} ${spec.label} caption`}
        >
          {pending ? <Loader2 {...ICON} className="animate-spin" /> : <Sparkles {...ICON} />} {verb}
        </Button>
      </SectionHead>

      {caption.status === 'FAILED' && (
        <Notice
          tone="error"
          className="mb-3"
          icon={<AlertTriangle {...ICON} className="mt-0.5 flex-shrink-0" aria-hidden />}
        >
          The {spec.label} caption failed to generate ({caption.failureReason ?? 'no reason given'}). Write it
          below, or use Generate.
        </Notice>
      )}

      {pending ? (
        <div
          className="animate-pulse space-y-2.5"
          aria-label={`Generating the ${spec.label} caption`}
          role="status"
        >
          <div className="h-4 w-3/4 rounded-ui-sm bg-line-subtle" />
          <div className="h-4 w-full rounded-ui-sm bg-line-subtle" />
          <div className="h-4 w-5/6 rounded-ui-sm bg-line-subtle" />
        </div>
      ) : (
        <>
          <textarea
            aria-labelledby={headingId}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setSaved(false)
            }}
            onBlur={() => {
              inFlightSave.current = save()
            }}
            rows={8}
            className={RULED_TEXTAREA}
            placeholder={`Write the ${spec.label} caption…`}
          />
          <div className="mt-2 flex justify-end">
            <span className={`text-ui-xs ${over ? 'font-semibold text-status-failed' : 'text-fg-muted'}`}>
              {spec.hardLimit !== null
                ? `${count(length)} / ${count(spec.hardLimit)} (${spec.label})`
                : `${count(length)} characters`}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
