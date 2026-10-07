'use client'

import React from 'react'
import { Loader2 } from 'lucide-react'
import type { AspectRatio } from '@prisma/client'
import { ASPECT_LABELS, dimensionsLabel } from '@/lib/aspectRatio'
import type { Campaign, TemplateSummary, BrandKitSummary } from '@/lib/api-types'
import type { DesignMode, UploadedImage } from './types'
import { ReviewRow, type ReviewRowProps } from './ReviewRow'
import { NOTICE } from './cardCls'
import { StepHead } from './StepHead'

// ─── Step 4 — Review ─────────────────────────────────────────────────────────

interface ReviewStepProps {
  selectedCampaign: Campaign | null
  selectedBrandKit: BrandKitSummary | null
  aspectRatio: AspectRatio
  designMode: DesignMode
  selectedTemplate: TemplateSummary | null
  selectedRefTemplate: TemplateSummary | null
  goal: string
  tone: string
  images: UploadedImage[]
  topic: string
  prompt: string
  providersLoaded: boolean
  copyProviderReady: boolean
  error: string | null
  submitting: boolean
}

export function ReviewStep({
  selectedCampaign,
  selectedBrandKit,
  aspectRatio,
  designMode,
  selectedTemplate,
  selectedRefTemplate,
  goal,
  tone,
  images,
  topic,
  prompt,
  providersLoaded,
  copyProviderReady,
  error,
  submitting,
}: ReviewStepProps) {
  // The summary is a plain list of rows: a new field (008's model selection,
  // for one) is one more entry, in the order it should read.
  const rows: ReviewRowProps[] = [
    { label: 'Topic', value: topic || '—' },
    { label: 'Campaign', value: selectedCampaign?.name ?? 'Uncategorized' },
    { label: 'Brand kit', value: selectedBrandKit?.name ?? '—' },
    { label: 'Size', value: `${ASPECT_LABELS[aspectRatio]} · ${dimensionsLabel(aspectRatio)} px` },
    { label: 'Path', value: `Path ${designMode === 'TEMPLATE' ? 'A — Template fill' : 'B — Freeform design'}` },
    {
      label: 'Template',
      value:
        designMode === 'TEMPLATE'
          ? selectedTemplate?.name ?? 'None'
          : selectedRefTemplate
            ? `Style ref: ${selectedRefTemplate.name}`
            : 'None',
    },
    { label: 'Goal', value: goal, capitalize: true },
    { label: 'Tone', value: tone, capitalize: true },
    {
      label: 'Images',
      value:
        images.length > 0
          ? `${images.length} image${images.length > 1 ? 's' : ''} (${images.filter(i => i.intent === 'embed').length} embed, ${images.filter(i => i.intent === 'reference').length} reference)`
          : 'None',
    },
    { label: 'Prompt', value: prompt || '—' },
  ]

  return (
    <div>
      <StepHead index={4} title={<>Review &amp; Generate</>}>
        Check your brief before sending it to Claude.
      </StepHead>

      {/* Ruled rows, opened by the 2 px --fg rule (DESIGN_SYSTEM.md §8.15) */}
      <dl className="border-t-2 border-fg">
        {rows.map(row => (
          <ReviewRow key={row.label} {...row} />
        ))}
      </dl>

      {providersLoaded && !copyProviderReady && (
        <div className={`${NOTICE} mt-6 bg-status-scheduled/10 text-status-scheduled`}>
          No copy provider is configured, and the server is not in CLI mode. An admin must add a
          COPY provider in AI Providers before generating.
        </div>
      )}

      {error && (
        <div className={`${NOTICE} mt-6 bg-status-failed/10 text-status-failed`}>
          {error}
        </div>
      )}

      {submitting && (
        <div className={`${NOTICE} mt-6 bg-status-exported/10 text-status-exported flex items-center gap-2`}>
          <Loader2 size={15} strokeWidth={1.4} className="animate-spin" /> Generating your post — this can take up to a minute…
        </div>
      )}
    </div>
  )
}
