'use client'

import React, { useEffect, useId, useRef, useState } from 'react'
import { Send as SendIcon, Loader2, AlertTriangle, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { SectionHead } from '@/components/ui/SectionHead'
import { FOCUS, ICON, SCROLL_FOCUS, SMALL_CAPS } from '@/components/ui/folio'
import { NotAppliedCard } from '@/components/drafts/NotAppliedCard'
import { apiFetch } from '@/lib/apiFetch'
import type { DraftAction, DraftNotApplied } from '@/lib/api-types'

// ─── Types ──────────────────────────────────────────────────────────────────

interface RefineMessage {
  id: string
  instruction: string
  status: 'pending' | 'applied' | 'conflict' | 'not-applied' | 'error'
  detail?: string
}

interface ConflictState {
  conflictId: string
  explanation: string
  instruction: string
}

// POST /api/drafts/[id]/refine — a plain refine is async now (202 {ok:true};
// the result arrives via the parent's draft poll). An Override commits
// already-stored HTML and stays SYNCHRONOUS, returning the committed revision.
type OverrideResponse = { reply: string; revisionId: string; exportUrl: string | null }

// Captured when an async refine is fired; the resolution effect compares the
// polled props against it once pendingAction transitions REFINE → null.
interface PendingResolution {
  msgId: string
  instruction: string
  baselineRevision: number | null
  conflictIdAtSend: string | null
  // Mirrors conflictIdAtSend's trick for the not-applied outcome (T18): a
  // DIFFERENT revisionId than what was live at send means THIS refine is the
  // one that produced it, not a stale outcome left over from before.
  notAppliedRevisionIdAtSend: string | null
}

const SUGGESTIONS = [
  'Make the background darker',
  'Move the headline to top',
  'Increase font size',
]

export interface RefinementPanelProps {
  draftId: string
  /** Polled draft state driving the async-refine lifecycle. */
  pendingAction: DraftAction | null
  pendingActionError: string | null
  conflict: { conflictId: string; explanation: string } | null
  /** FR-14/AC-18: a twice-failed refine — a hard failure, separate from
   *  `pendingActionError` (a crashed run). Cleared server-side by the next
   *  successful action, so it disappears here on the next poll. */
  notApplied: DraftNotApplied | null
  currentRevisionNumber: number | null
  /** Called right after an async action is accepted (202) so the parent can
   *  refetch the draft and start polling `pendingAction`. */
  onActionStarted: () => void
  onRefined: () => void
}

// ─── Refinement panel ─────────────────────────────────────────────────────────

export function RefinementPanel({
  draftId,
  pendingAction,
  pendingActionError,
  conflict,
  notApplied,
  currentRevisionNumber,
  onActionStarted,
  onRefined,
}: RefinementPanelProps) {
  const [messages, setMessages] = useState<RefineMessage[]>([])
  const [input, setInput] = useState('')
  // The prompt is named by the "Refine Design" heading (FR-12 row 27).
  const headingId = useId()
  // True only while a POST is in flight; the background refine itself is
  // tracked via the polled `pendingAction` prop.
  const [running, setRunning] = useState(false)
  // T19 "Use anyway" — synchronous (no model call, no pendingAction poll):
  // true only while its own POST is in flight.
  const [adopting, setAdopting] = useState(false)
  const [conflictCard, setConflictCard] = useState<ConflictState | null>(null)
  const resolutionRef = useRef<PendingResolution | null>(null)
  const prevActionRef = useRef<DraftAction | null>(pendingAction)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // Resolve the pending chat message when the polled pendingAction transitions
  // REFINE → null: a NEW conflict (different id than at send) → conflict card;
  // an action error → error; a moved revision pointer → applied.
  useEffect(() => {
    const prev = prevActionRef.current
    prevActionRef.current = pendingAction
    const res = resolutionRef.current
    if (!res || prev !== 'REFINE' || pendingAction !== null) return
    resolutionRef.current = null
    const setStatus = (status: RefineMessage['status'], detail?: string) =>
      setMessages((msgs) => msgs.map((m) => (m.id === res.msgId ? { ...m, status, detail } : m)))
    if (conflict && conflict.conflictId !== res.conflictIdAtSend) {
      setStatus('conflict', conflict.explanation)
      setConflictCard({
        conflictId: conflict.conflictId,
        explanation: conflict.explanation,
        instruction: res.instruction,
      })
    } else if (notApplied && notApplied.revisionId !== res.notAppliedRevisionIdAtSend) {
      setStatus('not-applied', notApplied.reason)
    } else if (pendingActionError) {
      setStatus('error', pendingActionError)
    } else if (currentRevisionNumber !== res.baselineRevision) {
      setStatus('applied')
      onRefined()
    } else {
      // Completed with no error, no new conflict, no not-applied outcome and
      // no new revision — shouldn't happen, but never leave the message
      // spinning forever.
      setStatus('error', 'The refinement finished without producing a new revision.')
    }
  }, [pendingAction, pendingActionError, conflict, notApplied, currentRevisionNumber, onRefined])

  async function send(instruction: string, overrideConflictId?: string) {
    if (!instruction.trim() && !overrideConflictId) return
    const msgId = crypto.randomUUID()
    setMessages((prev) => [...prev, { id: msgId, instruction, status: 'pending' }])
    setInput('')
    setRunning(true)
    setConflictCard(null)
    try {
      if (overrideConflictId) {
        // Override commits stored HTML synchronously — unchanged contract.
        await apiFetch<OverrideResponse>(`/api/drafts/${draftId}/refine`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruction, overrideConflictId }),
        })
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, status: 'applied' } : m))
        )
        onRefined()
      } else {
        // Async refine: capture the resolution baseline before firing.
        resolutionRef.current = {
          msgId,
          instruction,
          baselineRevision: currentRevisionNumber,
          conflictIdAtSend: conflict?.conflictId ?? null,
          notAppliedRevisionIdAtSend: notApplied?.revisionId ?? null,
        }
        await apiFetch(`/api/drafts/${draftId}/refine`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruction }),
        })
        // Refetch immediately so the parent picks up pendingAction and polls;
        // the message stays 'pending' until the resolution effect fires.
        onActionStarted()
      }
    } catch (e: unknown) {
      resolutionRef.current = null
      const detail = e instanceof Error ? e.message : 'Error'
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, status: 'error', detail } : m))
      )
    } finally {
      setRunning(false)
    }
  }

  // T19 "Use anyway": adopts the retained rejected render as a normal,
  // committed revision (POST .../rejected/[revisionId]/adopt — synchronous,
  // { reply, revisionId, exportUrl }, mirroring inline-edit/Override). No
  // undo-snapshot capture: adopt IS the recovery action here, not a change
  // that itself needs undoing, and there is no separate "before" pointer to
  // capture beyond what Revision History already offers via restore.
  async function handleAdopt() {
    if (!notApplied) return
    setAdopting(true)
    try {
      await apiFetch(`/api/drafts/${draftId}/rejected/${notApplied.revisionId}/adopt`, { method: 'POST' })
      onRefined()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not adopt this render')
    } finally {
      setAdopting(false)
    }
  }

  // Block sending while ANY background action is running (the server would 409
  // anyway), while a refine is still awaiting resolution from the poll, or
  // while an adopt POST is in flight (fix round 1, Minor 3 — adopting is a
  // draft mutation too, so it belongs in the same busy gate as every other
  // action, not a bespoke disabled state of its own).
  const awaitingResolution = messages.some((m) => m.status === 'pending')
  const busy = running || pendingAction !== null || awaitingResolution || adopting

  return (
    <section className="pt-[22px] pb-1.5">
      <SectionHead numeral="ii." title="Refine Design" id={headingId} className="mb-3">
        {messages.length > 0 && (
          <span className="text-fg-muted">
            {messages.length} {messages.length === 1 ? 'request' : 'requests'}
          </span>
        )}
      </SectionHead>

      {/* The refine log (§8.14): ruled rows, newest last. It scrolls inside its
          own box once it is long, so the box is a focusable, labelled region
          (WCAG 2.1.1, the T7 rule). */}
      <div
        ref={listRef}
        className={`mb-4 max-h-72 overflow-y-auto ${SCROLL_FOCUS}`}
        {...(messages.length > 0 ? { role: 'region', 'aria-label': 'Refine requests', tabIndex: 0 } : {})}
      >
        {messages.length === 0 ? (
          <p className="text-ui-sm text-fg-muted">
            Describe a change in natural language and the design agent will apply it.
          </p>
        ) : (
          <ol>
            {messages.map((m, i) => (
              <li
                key={m.id}
                className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 border-b border-line-subtle py-2.5"
              >
                <span aria-hidden className="font-display text-ui-base italic text-fg-muted">
                  № {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="break-words text-ui-base leading-snug text-fg">{m.instruction}</p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-ui-xs">
                    {m.status === 'pending' && (
                      <span className="flex items-center gap-1.5 text-fg-muted">
                        <Loader2 {...ICON} className="animate-spin" aria-hidden /> Applying…
                      </span>
                    )}
                    {m.status === 'applied' && (
                      <span className={`flex items-center gap-1 text-status-published ${SMALL_CAPS}`}>
                        <Check {...ICON} aria-hidden /> Applied
                      </span>
                    )}
                    {m.status === 'conflict' && (
                      <span className={`flex items-center gap-1 text-status-scheduled ${SMALL_CAPS}`}>
                        <AlertTriangle {...ICON} aria-hidden /> Brand conflict
                      </span>
                    )}
                    {m.status === 'not-applied' && (
                      <span className={`flex items-center gap-1 text-status-scheduled ${SMALL_CAPS}`} title={m.detail}>
                        <AlertTriangle {...ICON} aria-hidden /> Not applied
                      </span>
                    )}
                    {m.status === 'error' && (
                      <span className="break-words text-status-failed" title={m.detail}>
                        Failed: {m.detail}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* FR-14/AC-18 hard failure — driven directly by the polled `notApplied`
          prop (not local message state), so it appears and clears exactly
          when the server says so, on the next poll either way. */}
      {notApplied && (
        <NotAppliedCard notApplied={notApplied} onAdopt={handleAdopt} adopting={adopting} disabled={busy} />
      )}

      {conflictCard && (
        <Notice
          tone="warning"
          icon={<AlertTriangle {...ICON} className="mt-0.5 flex-shrink-0" aria-hidden />}
          className="mb-4 animate-fade-in"
        >
          <p className="font-semibold">This change conflicts with the brand kit</p>
          <p className="mt-1 text-ui-xs text-fg">{conflictCard.explanation}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => send(conflictCard.instruction, conflictCard.conflictId)}
              disabled={busy}
            >
              Override
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConflictCard(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </Notice>
      )}

      {/* Suggestions (§8.14): text buttons with a dotted underline. */}
      <div className="mb-3.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-ui-sm">
        <span className="text-fg-muted">Try:</span>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setInput(s)}
            disabled={busy}
            className={`border-b border-dotted border-line text-fg transition-colors duration-fast ease-standard enabled:hover:border-fg disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* The prompt (§8.3, §8.14): a display-italic field with the ink Send
          button attached; the wrapper shows the focus outline. */}
      <form
        className="flex rounded-ui-sm border border-line bg-surface-raised focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus"
        onSubmit={(e) => {
          e.preventDefault()
          if (!busy) send(input)
        }}
      >
        <input
          aria-labelledby={headingId}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          placeholder="e.g. Make the logo larger…"
          className="min-w-0 flex-1 bg-transparent px-3.5 py-2.5 font-display text-ui-base italic text-fg [font-variation-settings:'opsz'_24] placeholder:text-fg-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap border-l border-line bg-fg px-4 font-text text-ui-sm font-semibold text-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
          {running || pendingAction === 'REFINE' ? (
            <Loader2 {...ICON} className="animate-spin" aria-hidden />
          ) : (
            <SendIcon {...ICON} aria-hidden />
          )}
        </button>
      </form>
    </section>
  )
}
