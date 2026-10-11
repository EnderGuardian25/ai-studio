'use client'

import React, { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Check, AlertTriangle } from 'lucide-react'
import { SectionHead } from '@/components/ui/SectionHead'
import { Notice } from '@/components/ui/Notice'
import { ICON } from '@/components/ui/folio'
import { apiFetch } from '@/lib/apiFetch'
import { captionLength, captionSpec } from '@/lib/channels'
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

const count = (n: number) => n.toLocaleString('en-US')

export interface CaptionPanelProps {
  draftId: string
  caption: DraftCaptionDetail
  /** Called after an edit is saved, so the parent refetches the draft. */
  onSaved: () => void
}

// One channel's caption (012 FR-18/FR-19, wave-1 base): its h3, the ruled
// textarea named by that heading and saved on blur, the per-registry counter,
// a FAILED notice, and a skeleton only while the row is PENDING. Empty text on
// a row that is not PENDING always shows the editable field (TC-ASYNC-10).
export function CaptionPanel({ draftId, caption, onSaved }: CaptionPanelProps) {
  const spec = captionSpec(caption.channel)
  const headingId = useId()
  const [value, setValue] = useState(caption.text)
  const [saved, setSaved] = useState(true)
  const [saving, setSaving] = useState(false)

  // A regenerate's new text arrives through the parent's poll.
  useEffect(() => {
    setValue(caption.text)
    setSaved(true)
  }, [caption.text])

  const pending = caption.status === 'PENDING'
  const length = captionLength(value)
  const over = spec.hardLimit !== null && length > spec.hardLimit

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

  return (
    <div>
      <SectionHead level={3} title={spec.label} id={headingId} className="mb-3">
        {pending ? null : saving ? (
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
      </SectionHead>

      {caption.status === 'FAILED' && (
        <Notice
          tone="error"
          className="mb-3"
          icon={<AlertTriangle {...ICON} className="mt-0.5 flex-shrink-0" aria-hidden />}
        >
          The {spec.label} caption failed to generate ({caption.failureReason ?? 'no reason given'}). Write it
          below, or use Regenerate all.
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
            onBlur={save}
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
