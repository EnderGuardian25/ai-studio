'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { apiFetch } from '@/lib/apiFetch'
import { fieldClasses, fieldEdge, inputClasses } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { EYEBROW, SCROLL_FOCUS, SMALL_CAPS } from '@/components/ui/folio'
import { StepHead } from './StepHead'
import { GOAL_OPTIONS, TONE_OPTIONS } from './constants'

// ─── Step 2 — Content ────────────────────────────────────────────────────────

interface ContentStepProps {
  topic: string
  setTopic: (v: string) => void
  prompt: string
  setPrompt: (v: string) => void
  goal: string
  setGoal: (v: string) => void
  tone: string
  setTone: (v: string) => void
  // Context for the AI enhance call — matches generation-time grounding.
  campaignId: string
  brandKitId: string
}

export function ContentStep({ topic, setTopic, prompt, setPrompt, goal, setGoal, tone, setTone, campaignId, brandKitId }: ContentStepProps) {
  const [enhancing, setEnhancing] = useState(false)
  // The Topic and Brief labels name their fields (014 FR-12 rows 4, 5).
  const topicId = React.useId()
  const briefId = React.useId()
  // Before/after review: the AI rewrite only reaches the brief on Accept.
  const [enhanceResult, setEnhanceResult] = useState<{ original: string; draft: string } | null>(null)

  async function enhance() {
    setEnhancing(true)
    try {
      const { draft } = await apiFetch<{ draft: string }>('/api/briefs/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          content: prompt,
          goal,
          tone,
          campaignId: campaignId || undefined,
          brandKitId: brandKitId || undefined,
        }),
      })
      setEnhanceResult({ original: prompt, draft })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Enhance failed')
    } finally {
      setEnhancing(false)
    }
  }

  return (
    <div>
      <StepHead index={2} title={<>Brief &amp; Copy Direction</>}>
        Give the post a short topic, tell Claude what it&apos;s about, then pick a goal and tone.
      </StepHead>

      <FieldLabel htmlFor={topicId} className="mb-2.5">Topic</FieldLabel>
      <input
        id={topicId}
        type="text"
        value={topic}
        onChange={e => setTopic(e.target.value)}
        placeholder="e.g. Q3 product launch"
        maxLength={120}
        autoFocus
        className={cn(inputClasses, fieldEdge())}
      />
      <div className="mt-2 mb-6 text-ui-xs text-fg-muted">
        A short title — it names this post in the library.
      </div>

      {/* While the AI suggestion is up there is no textarea, so nothing to point at. */}
      <FieldLabel htmlFor={enhanceResult ? undefined : briefId} className="mb-2.5">Brief</FieldLabel>
      {enhanceResult ? (
        <div className="space-y-4 mb-6">
          {enhanceResult.original.trim() && (
            <div>
              <p className={`${EYEBROW} mb-1.5`}>Before</p>
              {/* A scroll container: focusable and labelled so the keyboard can scroll it. */}
              <div
                tabIndex={0}
                role="region"
                aria-label="Before"
                className={`surface px-4 py-3 text-ui-sm text-fg-muted whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto ${SCROLL_FOCUS}`}
              >
                {enhanceResult.original}
              </div>
            </div>
          )}
          <div>
            <p className={`${SMALL_CAPS} text-accent mb-1.5`}>AI suggestion</p>
            <div
              tabIndex={0}
              role="region"
              aria-label="AI suggestion"
              className={`rounded-ui-sm border border-fg bg-surface-raised px-4 py-3 text-ui-sm text-fg whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto ${SCROLL_FOCUS}`}
            >
              {enhanceResult.draft}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => { setPrompt(enhanceResult.draft); setEnhanceResult(null) }}>
              Accept suggestion
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEnhanceResult(null)}>
              Discard
            </Button>
          </div>
        </div>
      ) : (
        <>
          <textarea
            id={briefId}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="e.g. Announce our Q3 product launch with excitement. Highlight that it saves the marketing team hours on post creation. Include a CTA to try it."
            rows={6}
            className={cn(fieldClasses, fieldEdge(), 'resize-none leading-relaxed')}
          />
          <div className="mt-2 flex items-start justify-between gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={enhance}
              disabled={enhancing || (!topic.trim() && !prompt.trim())}
            >
              <Sparkles size={15} strokeWidth={1.4} /> {enhancing ? 'Enhancing…' : 'Enhance with AI'}
            </Button>
            <div className="text-right text-ui-xs text-fg-muted pt-1.5">
              {prompt.length} chars{prompt.trim().length > 0 && prompt.trim().length <= 10 ? ' — add a little more detail' : ''}
            </div>
          </div>
          <div className="mt-2 mb-6 text-ui-xs text-fg-muted">
            {enhancing
              ? 'Rewriting with the brand voice and campaign context — this can take up to a minute.'
              : 'Rewrites the brief with AI, grounded in the brand voice and campaign briefing. Works from just the topic too.'}
          </div>
        </>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 border-t border-line-subtle">
        <Select label="Goal" options={GOAL_OPTIONS} value={goal} onChange={e => setGoal(e.target.value)} />
        <Select label="Tone" options={TONE_OPTIONS} value={tone} onChange={e => setTone(e.target.value)} />
      </div>
    </div>
  )
}
