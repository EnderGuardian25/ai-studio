'use client'

import React, { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Loader2, Paperclip, Send, Trash2, ArrowUp, ArrowDown, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Modal'
import { apiFetch } from '@/lib/apiFetch'
import { CHANNEL_VALUES } from '@/lib/channels'
import { COMPACT_FIELD, FOCUS, ICON, ICON_BUTTON, SCROLL_FOCUS, SMALL_CAPS } from '@/components/campaigns/folio'

// Shape the model proposes inside a ```schedule block (see briefingAssistant.ts).
interface SchedulePlanItem {
  topic: string
  goal: string
  tone: string
  daysFromNow: number
  postAction: 'HOLD' | 'SCHEDULE_PUBLISH' | 'PUBLISH_NOW'
}

// An editable row in the plan the admin reviews before approving. generateAt is
// a datetime-local string ("YYYY-MM-DDTHH:mm") for the native picker.
interface PlanRow {
  topic: string
  goal: string
  tone: string
  postAction: 'HOLD' | 'SCHEDULE_PUBLISH' | 'PUBLISH_NOW'
  generateAt: string
}

// datetime-local value N days from now at 09:00 local.
function localDateTimeInDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(9, 0, 0, 0)
  // Adjust for the local timezone offset so toISOString slicing keeps local time.
  const tzOffsetMs = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16)
}

// AI briefing assistant: hand in source documents, converse until the model
// converges on a briefing draft, then Apply drops it into the briefing editor
// (saving still goes through the normal versioned flow). The conversation is
// ephemeral — the transcript lives in component state and is sent whole to the
// stateless chat route each turn.

interface CampaignDocumentMeta {
  id: string
  name: string
  contentType: string
  sizeBytes: number
  truncated: boolean
  createdAt: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  briefingDraft?: string | null
  schedulePlan?: SchedulePlanItem[] | null
}

interface BriefingAssistantPanelProps {
  campaignId: string
  open: boolean
  onClose: () => void
  onApply: (text: string) => void
}

const ACCEPT =
  '.pdf,.docx,.txt,.md,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,image/png,image/jpeg'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function BriefingAssistantPanel({ campaignId, open, onClose, onApply }: BriefingAssistantPanelProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [uploading, setUploading] = useState(false)
  // The plan the admin is currently reviewing (from the latest ```schedule block).
  const [plan, setPlan] = useState<PlanRow[] | null>(null)
  const [scheduling, setScheduling] = useState(false)

  const { data: docs = [] } = useQuery({
    queryKey: ['campaigns', campaignId, 'documents'],
    queryFn: () => apiFetch<CampaignDocumentMeta[]>(`/api/campaigns/${campaignId}/documents`),
    enabled: open,
  })

  function invalidateDocs() {
    return queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'documents'] })
  }

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const doc = await apiFetch<CampaignDocumentMeta>(`/api/campaigns/${campaignId}/documents`, {
        method: 'POST',
        body: fd,
      })
      await invalidateDocs()
      toast.success(
        doc.truncated
          ? `${file.name} uploaded — the text was long and was truncated for the AI context.`
          : `${file.name} uploaded`,
      )
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function deleteDoc(doc: CampaignDocumentMeta) {
    try {
      await apiFetch(`/api/campaigns/${campaignId}/documents/${doc.id}`, { method: 'DELETE' })
      await invalidateDocs()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const content = input.trim()
    if (!content || pending) return

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content }]
    setMessages(nextMessages)
    setInput('')
    setPending(true)
    // Let the new message render before scrolling to it.
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
    try {
      const result = await apiFetch<{
        reply: string
        briefingDraft: string | null
        schedulePlan: SchedulePlanItem[] | null
      }>(
        `/api/campaigns/${campaignId}/briefing/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
          }),
        },
      )
      setMessages([
        ...nextMessages,
        { role: 'assistant', content: result.reply, briefingDraft: result.briefingDraft, schedulePlan: result.schedulePlan },
      ])
      // A fresh plan supersedes any prior one under review.
      if (result.schedulePlan?.length) {
        setPlan(
          result.schedulePlan.map(p => ({
            topic: p.topic,
            goal: p.goal,
            tone: p.tone,
            postAction: p.postAction,
            generateAt: localDateTimeInDays(p.daysFromNow),
          })),
        )
      }
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'The assistant failed to reply')
      // Roll the failed turn back so it can be resent.
      setMessages(messages)
      setInput(content)
    } finally {
      setPending(false)
    }
  }

  function updateRow(i: number, patch: Partial<PlanRow>) {
    setPlan(prev => (prev ? prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) : prev))
  }
  function removeRow(i: number) {
    setPlan(prev => {
      const next = prev ? prev.filter((_, idx) => idx !== i) : prev
      return next && next.length ? next : null
    })
  }
  function moveRow(i: number, dir: -1 | 1) {
    setPlan(prev => {
      if (!prev) return prev
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  async function scheduleAll() {
    if (!plan || plan.length === 0) return
    // Channels, size, and design path default here; the AI plan only carries
    // topic/goal/tone/date/action. Path B (GENERATE) needs no template, so it's
    // the safe default — per-entry channel/size edits happen in the queue table.
    const entries = plan.map(r => ({
      topic: r.topic.trim(),
      goal: r.goal.trim() || 'awareness',
      tone: r.tone.trim() || 'professional',
      channels: CHANNEL_VALUES,
      aspectRatio: 'SQUARE' as const,
      designMode: 'GENERATE' as const,
      generateAt: new Date(r.generateAt).toISOString(),
      postAction: r.postAction,
    }))
    setScheduling(true)
    try {
      const res = await apiFetch<{ count: number }>(`/api/campaigns/${campaignId}/queue/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      })
      await queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'queue'] })
      toast.success(`Scheduled ${res.count} post${res.count === 1 ? '' : 's'} for generation.`)
      setPlan(null)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to schedule the plan')
    } finally {
      setScheduling(false)
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Draft briefing with AI">
      <div className="flex h-full flex-col">
        {/* Documents */}
        <div className="space-y-2 border-b border-line-subtle px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className={`${SMALL_CAPS} text-fg-muted`}>
              Source documents &amp; images ({docs.length}/5)
            </p>
            <Button
              variant="ghost"
              size="sm"
              disabled={uploading || docs.length >= 5}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 {...ICON} className="animate-spin" /> : <Paperclip {...ICON} />}
              {uploading ? 'Uploading…' : 'Add document'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) void uploadFile(file)
              }}
            />
          </div>
          {docs.length === 0 ? (
            <p className="text-ui-xs text-fg-muted">
              Hand in strategy decks or one-pagers (PDF, DOCX, TXT, MD — max 10MB each). The
              assistant grounds the briefing in them.
            </p>
          ) : (
            <ul className="border-t border-line-subtle">
              {docs.map(doc => (
                <li key={doc.id} className="flex items-center gap-2 border-b border-line-subtle py-1 text-ui-sm text-fg">
                  <FileText {...ICON} aria-hidden className="flex-shrink-0 text-fg-muted" />
                  <span className="min-w-0 flex-1 truncate" title={doc.name}>{doc.name}</span>
                  <span className="whitespace-nowrap text-ui-xs text-fg-muted">
                    {formatSize(doc.sizeBytes)}
                    {doc.truncated && ' · truncated'}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete ${doc.name}`}
                    onClick={() => deleteDoc(doc)}
                    className={`${ICON_BUTTON} hover:text-status-failed ${FOCUS}`}
                  >
                    <Trash2 {...ICON} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* The conversation (§8.14's log vocabulary): ruled rows, newest last.
            It scrolls inside its own box, so once it has turns the box is a
            focusable, labelled region (WCAG 2.1.1, the T7 rule). */}
        <div
          className={`flex-1 overflow-y-auto px-5 py-4 ${SCROLL_FOCUS}`}
          {...(messages.length > 0 ? { role: 'region', 'aria-label': 'Conversation', tabIndex: 0 } : {})}
        >
          {messages.length === 0 && (
            <p className="text-ui-sm text-fg-muted">
              Describe the campaign — goal, audience, timing — and the assistant will interview
              you and converge on a briefing draft. Each draft it proposes can be applied to the
              editor.
            </p>
          )}
          {messages.length > 0 && (
            <ol className="border-t border-line-subtle">
              {messages.map((m, i) => (
                <li key={i} className="border-b border-line-subtle py-3">
                  <p className={`${SMALL_CAPS} mb-1 text-fg-muted`}>
                    {m.role === 'user' ? 'You' : 'Assistant'}
                  </p>
                  <p
                    className={
                      m.role === 'user'
                        ? "whitespace-pre-wrap break-words font-display text-ui-base italic leading-snug text-fg [font-variation-settings:'opsz'_24]"
                        : 'whitespace-pre-wrap break-words text-ui-sm leading-relaxed text-fg'
                    }
                  >
                    {m.content}
                  </p>
                  {m.briefingDraft && (
                    <div className="mt-2.5">
                      <Button variant="secondary" size="sm" onClick={() => onApply(m.briefingDraft!)}>
                        Apply this draft to the editor
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
          {pending && (
            <div className="mt-3 flex items-center gap-2 text-ui-sm text-fg-muted">
              <Loader2 {...ICON} className="animate-spin" aria-hidden />
              Thinking — this can take up to a minute…
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Schedule plan review (F4) */}
        {plan && (
          <div
            tabIndex={0}
            role="region"
            aria-label="Proposed schedule"
            className={`max-h-72 flex-shrink-0 overflow-y-auto border-t-2 border-fg bg-surface px-5 py-4 ${SCROLL_FOCUS}`}
          >
            <div className="mb-2 flex items-center gap-2">
              <CalendarClock {...ICON} aria-hidden className="flex-shrink-0 text-fg-muted" />
              <p className={`${SMALL_CAPS} text-fg-muted`}>
                Proposed schedule ({plan.length}) — review, edit, then schedule
              </p>
            </div>
            <ul className="border-t border-line-subtle">
              {plan.map((row, i) => (
                <li key={i} className="space-y-2 border-b border-line-subtle py-2.5">
                  <div className="flex items-center gap-1">
                    <input
                      value={row.topic}
                      onChange={e => updateRow(i, { topic: e.target.value })}
                      placeholder="Post topic"
                      className={`${COMPACT_FIELD} min-w-0 flex-1`}
                    />
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={i === 0}
                      onClick={() => moveRow(i, -1)}
                      className={`${ICON_BUTTON} enabled:hover:text-fg ${FOCUS}`}
                    >
                      <ArrowUp {...ICON} />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={i === plan.length - 1}
                      onClick={() => moveRow(i, 1)}
                      className={`${ICON_BUTTON} enabled:hover:text-fg ${FOCUS}`}
                    >
                      <ArrowDown {...ICON} />
                    </button>
                    <button
                      type="button"
                      aria-label="Remove post"
                      onClick={() => removeRow(i)}
                      className={`${ICON_BUTTON} hover:text-status-failed ${FOCUS}`}
                    >
                      <Trash2 {...ICON} />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <input
                      type="datetime-local"
                      aria-label="Generate at"
                      value={row.generateAt}
                      onChange={e => updateRow(i, { generateAt: e.target.value })}
                      className={`${COMPACT_FIELD} max-w-full`}
                    />
                    <span className="break-words text-ui-2xs text-fg-muted">
                      {row.goal} · {row.tone} · {row.postAction === 'HOLD' ? 'hold for review' : row.postAction.toLowerCase()}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={scheduleAll} disabled={scheduling}>
                {scheduling ? <Loader2 {...ICON} className="animate-spin" /> : <CalendarClock {...ICON} />}
                Schedule {plan.length} post{plan.length === 1 ? '' : 's'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPlan(null)} disabled={scheduling}>
                Discard
              </Button>
            </div>
            <p className="mt-2 text-ui-2xs text-fg-muted">
              Posts generate as HOLD drafts for review by default. Channels (both feeds) and size
              can be adjusted per entry in the queue after scheduling.
            </p>
          </div>
        )}

        {/* The prompt (§8.3, §8.14): a display-italic field with the ink Send
            button attached; the wrapper shows the focus outline. */}
        <form onSubmit={send} className="flex-shrink-0 border-t border-line-subtle px-5 py-4">
          <div className="flex rounded-ui-sm border border-line bg-surface-raised focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Tell the assistant about this campaign…"
              className="min-w-0 flex-1 bg-transparent px-3.5 py-2.5 font-display text-ui-base italic text-fg [font-variation-settings:'opsz'_24] placeholder:text-fg-muted focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || pending}
              aria-label="Send"
              className="inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap border-l border-line bg-fg px-4 font-text text-ui-sm font-semibold text-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
              {pending ? <Loader2 {...ICON} className="animate-spin" aria-hidden /> : <Send {...ICON} aria-hidden />}
            </button>
          </div>
        </form>
      </div>
    </Drawer>
  )
}
