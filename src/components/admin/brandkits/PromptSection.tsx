'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'
import { Sparkles, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { fieldClasses, fieldEdge } from '@/components/ui/Input'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { apiFetch } from '@/lib/apiFetch'
import { cn } from '@/lib/utils'
import { COMPACT_FIELD, ICON, SCROLL_FOCUS, SMALL_CAPS } from '@/components/ui/folio'
import type { BrandKitPrompt as Prompt } from '@/lib/api-types'

// ─── Prompt Section ───────────────────────────────────────────────────────────

interface PromptSectionProps {
  kitId: string
  prompts: Prompt[]
  onRefresh: () => void
}

export function PromptSection({ kitId, prompts, onRefresh }: PromptSectionProps) {
  const [draft, setDraft] = useState('')
  const [aiDraft, setAiDraft] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'active' | 'history' | 'new'>('active')
  const descriptionId = React.useId()
  const draftId = React.useId()

  const active = prompts.find(p => p.isActive)

  async function generate() {
    setLoading(true)
    try {
      const data = await apiFetch<{ draft: string }>(`/api/admin/brandkits/${kitId}/prompts/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      setAiDraft(data.draft)
      setDraft(data.draft)
      setView('new')
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setLoading(false) }
  }

  async function improve() {
    setLoading(true)
    try {
      const data = await apiFetch<{ draft: string }>(`/api/admin/brandkits/${kitId}/prompts/improve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      setAiDraft(data.draft)
      setDraft(data.draft)
      setView('new')
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setLoading(false) }
  }

  async function saveVersion() {
    if (!draft.trim()) return
    try {
      await apiFetch(`/api/admin/brandkits/${kitId}/prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      })
      setDraft(''); setAiDraft(''); setView('active')
      onRefresh()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  async function activate(promptId: string) {
    try {
      await apiFetch(`/api/admin/brandkits/${kitId}/prompts/${promptId}/activate`, { method: 'POST' })
      onRefresh()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  return (
    <div className="space-y-4">
      <SegmentedToggle
        options={[
          { value: 'active', label: 'Active' },
          { value: 'history', label: 'History' },
          { value: 'new', label: 'New Version' },
        ]}
        value={view}
        onChange={v => setView(v as 'active' | 'history' | 'new')}
        label="Prompt view"
      />

      {view === 'active' && (
        <div className="space-y-3">
          {active ? (
            <div className="surface whitespace-pre-wrap break-words px-4 py-3 text-ui-sm leading-relaxed text-fg">
              {active.content}
            </div>
          ) : (
            <p className="text-ui-sm text-fg-muted">No active prompt. Generate one below.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {active ? (
              <Button variant="secondary" size="sm" onClick={improve} disabled={loading}>
                <RefreshCw {...ICON} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Improving…' : 'Improve with AI'}
              </Button>
            ) : (
              <div className="flex w-full flex-col gap-1.5">
                <FieldLabel htmlFor={descriptionId}>Brand description</FieldLabel>
                <div className="flex w-full flex-wrap gap-2">
                  <input
                    id={descriptionId}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Describe your brand in a few sentences…"
                    className={`${COMPACT_FIELD} min-w-0 flex-1 basis-56`}
                  />
                  <Button variant="secondary" size="sm" onClick={generate} disabled={loading || !description.trim()}>
                    <Sparkles {...ICON} />
                    {loading ? 'Generating…' : 'Generate'}
                  </Button>
                </div>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={() => { setDraft(''); setView('new') }}>
              Write manually
            </Button>
          </div>
        </div>
      )}

      {view === 'history' && (
        prompts.length === 0 ? (
          <p className="text-ui-sm text-fg-muted">No versions yet.</p>
        ) : (
          // Ruled version rows (§8.13's vocabulary). The list scrolls inside
          // its own box once it is long, so the box is a focusable, labelled
          // region (WCAG 2.1.1, the T7 rule).
          <div
            tabIndex={0}
            role="region"
            aria-label="Prompt history"
            className={`max-h-64 overflow-y-auto border-t border-line-subtle ${SCROLL_FOCUS}`}
          >
            <ul>
              {prompts.map(p => (
                <li key={p.id} className="flex items-start justify-between gap-3 border-b border-line-subtle py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-ui-base font-medium text-fg">v{p.version}</span>
                      {p.isActive && <span className={`${SMALL_CAPS} text-accent`}>active</span>}
                    </div>
                    <p className="mt-0.5 line-clamp-2 break-words text-ui-xs text-fg-muted" title={p.content}>
                      {p.content}
                    </p>
                  </div>
                  {!p.isActive && (
                    <Button variant="ghost" size="sm" onClick={() => activate(p.id)}>Restore</Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      {view === 'new' && (
        <div className="space-y-3">
          {aiDraft && (
            <p className="text-ui-xs text-fg-muted">AI-generated draft — review and edit before saving.</p>
          )}
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor={draftId}>Brand voice prompt</FieldLabel>
            <textarea
              id={draftId}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={8}
              placeholder="Write your brand voice prompt…"
              className={cn(fieldClasses, fieldEdge(), 'resize-none leading-relaxed')}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {/* An inline-form submit: Ink, so the kit's Save stays the view's
                one accent primary (§8.2, 014 FR-08). */}
            <Button variant="ink" size="sm" onClick={saveVersion} disabled={!draft.trim()}>Save as new version</Button>
            <Button variant="ghost" size="sm" onClick={() => { setDraft(''); setAiDraft(''); setView('active') }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}
