'use client'

import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Check, FileText, Loader2, Paperclip, Send, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Modal'
import { apiFetch } from '@/lib/apiFetch'
import { ColorEditor } from './ColorEditor'
import { COMPACT_FIELD, FOCUS, ICON, ICON_BUTTON, SCROLL_FOCUS, SMALL_CAPS, TAG } from '@/components/ui/folio'

// F5 — conversational brand-kit extraction from reference images. Mirrors the
// campaign BriefingAssistantPanel: chat grounded on the kit's feedToAI reference
// images, the assistant proposes a brand suggestion, the admin reviews + edits it,
// then applies. Apply writes the VOICE (new active prompt) and the COLOR palette
// (sampled, editable). Font guesses + style are surfaced as read-only suggestions
// — vision font guesses are never auto-committed (they lack real font files).

interface BrandKitSuggestion {
  voice: string
  tone: string
  style: string
  fonts: string[]
  colors: string[]
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  suggestion?: BrandKitSuggestion | null
}

// Assistant source documents & images (BrandKitDocument) — chat grounding only,
// never fed to generation. Mirrors the campaign BriefingAssistantPanel block.
interface BrandKitDocumentMeta {
  id: string
  name: string
  contentType: string
  sizeBytes: number
  truncated: boolean
  createdAt: string
}

const ACCEPT =
  '.pdf,.docx,.txt,.md,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,image/png,image/jpeg'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface BrandKitAssistantPanelProps {
  kitId: string
  open: boolean
  onClose: () => void
  onApplied: () => void
}

export function BrandKitAssistantPanel({ kitId, open, onClose, onApplied }: BrandKitAssistantPanelProps) {
  const endRef = useRef<HTMLDivElement>(null)
  const voiceId = React.useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [docs, setDocs] = useState<BrandKitDocumentMeta[]>([])
  const [uploading, setUploading] = useState(false)
  // The suggestion under review (editable), and which fields to apply.
  const [voice, setVoice] = useState('')
  const [colors, setColors] = useState<string[]>([])
  const [fonts, setFonts] = useState<string[]>([])
  const [style, setStyle] = useState('')
  const [hasSuggestion, setHasSuggestion] = useState(false)
  const [applying, setApplying] = useState(false)

  // Load the kit's source documents when the drawer opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    apiFetch<BrandKitDocumentMeta[]>(`/api/admin/brandkits/${kitId}/documents`)
      .then(list => {
        if (!cancelled) setDocs(list)
      })
      .catch(() => {
        /* the block simply stays empty; uploads will surface real errors */
      })
    return () => {
      cancelled = true
    }
  }, [open, kitId])

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const doc = await apiFetch<BrandKitDocumentMeta>(`/api/admin/brandkits/${kitId}/documents`, {
        method: 'POST',
        body: fd,
      })
      setDocs(prev => [...prev, doc])
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

  async function deleteDoc(doc: BrandKitDocumentMeta) {
    try {
      await apiFetch(`/api/admin/brandkits/${kitId}/documents/${doc.id}`, { method: 'DELETE' })
      setDocs(prev => prev.filter(d => d.id !== doc.id))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  function loadSuggestion(s: BrandKitSuggestion) {
    setVoice(s.voice)
    setColors(s.colors)
    setFonts(s.fonts)
    setStyle([s.tone, s.style].filter(Boolean).join(' — '))
    setHasSuggestion(true)
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const content = input.trim()
    if (!content || pending) return
    const next: ChatMessage[] = [...messages, { role: 'user', content }]
    setMessages(next)
    setInput('')
    setPending(true)
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
    try {
      const result = await apiFetch<{ reply: string; suggestion: BrandKitSuggestion | null }>(
        `/api/admin/brandkits/${kitId}/assistant/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
        },
      )
      setMessages([...next, { role: 'assistant', content: result.reply, suggestion: result.suggestion }])
      if (result.suggestion) loadSuggestion(result.suggestion)
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'The assistant failed to reply')
      setMessages(messages)
      setInput(content)
    } finally {
      setPending(false)
    }
  }

  async function apply() {
    if (!voice.trim() && colors.length === 0) return
    setApplying(true)
    try {
      if (voice.trim()) {
        await apiFetch(`/api/admin/brandkits/${kitId}/prompts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: voice.trim() }),
        })
      }
      if (colors.length > 0) {
        await apiFetch(`/api/admin/brandkits/${kitId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ colors }),
        })
      }
      toast.success('Applied brand voice and colors to the kit.')
      setHasSuggestion(false)
      onApplied()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to apply the suggestion')
    } finally {
      setApplying(false)
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Extract brand from references">
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
              Hand in brand guidelines, past posts, or your logo (PDF, DOCX, TXT, MD, PNG, JPG —
              max 10MB each). They ground this chat only — never the post generator.
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
              Add references above (brand guidelines, past posts, your logo) — or upload
              images in the Artifacts section marked <span className="font-medium text-fg">feed to AI</span> —
              then ask me to extract the brand voice and style. I&apos;ll propose a voice,
              palette, and font guesses you can review and apply.
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
                </li>
              ))}
            </ol>
          )}
          {pending && (
            <div className="mt-3 flex items-center gap-2 text-ui-sm text-fg-muted">
              <Loader2 {...ICON} className="animate-spin" aria-hidden />
              Studying the references — this can take up to a minute…
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Suggestion review + apply. It scrolls inside its own box, so it is
            a focusable, labelled region (the T7 rule). The proposed palette is
            kit data: its swatches show the sampled colours as they are. */}
        {hasSuggestion && (
          <div
            tabIndex={0}
            role="region"
            aria-label="Proposed brand"
            className={`max-h-[22rem] flex-shrink-0 space-y-3 overflow-y-auto border-t-2 border-fg bg-surface px-5 py-4 ${SCROLL_FOCUS}`}
          >
            <div className="flex items-center gap-2">
              <Sparkles {...ICON} aria-hidden className="flex-shrink-0 text-accent" />
              <p className={`${SMALL_CAPS} text-fg-muted`}>
                Proposed brand — review &amp; edit, then apply
              </p>
            </div>

            <div>
              <label htmlFor={voiceId} className={`${SMALL_CAPS} text-fg-muted`}>Brand voice</label>
              <textarea
                id={voiceId}
                value={voice}
                onChange={e => setVoice(e.target.value)}
                rows={4}
                className={`${COMPACT_FIELD} mt-1.5 w-full resize-y leading-relaxed`}
              />
            </div>

            <div>
              <p className={`${SMALL_CAPS} text-fg-muted`}>
                Color palette (sampled — replaces the current palette)
              </p>
              <div className="mt-1.5">
                <ColorEditor colors={colors} onChange={setColors} />
              </div>
            </div>

            {fonts.length > 0 && (
              <div>
                <p className={`${SMALL_CAPS} text-fg-muted`}>
                  Font guesses (not applied — add manually with a font file if correct)
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {fonts.map(f => (
                    <span key={f} className={TAG}>
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {style && (
              <p className="break-words text-ui-xs text-fg-muted">
                <span className="font-semibold text-fg">Style:</span> {style}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={apply} disabled={applying || (!voice.trim() && colors.length === 0)}>
                {applying ? <Loader2 {...ICON} className="animate-spin" /> : <Check {...ICON} />}
                Apply voice + colors
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setHasSuggestion(false)} disabled={applying}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {/* The prompt (§8.3, §8.14): a display-italic field with the ink Send
            button attached; the wrapper shows the focus outline. */}
        <form onSubmit={send} className="flex-shrink-0 border-t border-line-subtle px-5 py-4">
          <div className="flex rounded-ui-sm border border-line bg-surface-raised focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="e.g. Extract the brand voice and style from these references"
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
