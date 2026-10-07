'use client'

import React from 'react'
import { Sparkles, Check } from 'lucide-react'
import { Select } from '@/components/ui/Select'
import type { AspectRatio } from '@prisma/client'
import { ASPECT_LABELS } from '@/lib/aspectRatio'
import type { Campaign, TemplateSummary } from '@/lib/api-types'
import { ASPECT_OPTIONS, SOURCE_LABEL } from './constants'
import type { DesignMode, ResolvedKit } from './types'
import { cardCls } from './cardCls'
import { FieldLabel } from './FieldLabel'
import { StepHead } from './StepHead'
import { TemplateCard } from './TemplateCard'

// ─── Step 1 — Size & Design ──────────────────────────────────────────────────

interface SizeDesignStepProps {
  aspectRatio: AspectRatio
  setAspectRatio: (v: AspectRatio) => void
  campaignId: string
  resolvedKit: ResolvedKit | null
  selectedCampaign: Campaign | null
  brandKitId: string
  setBrandKitId: (id: string) => void
  brandKitOptions: { value: string; label: string }[]
  designMode: DesignMode
  setDesignMode: (m: DesignMode) => void
  templateId: string
  setTemplateId: (id: string) => void
  referenceTemplateId: string
  setReferenceTemplateId: (id: string) => void
  visibleTemplates: TemplateSummary[]
}

// One field group per section, ruled apart (DESIGN_SYSTEM.md §6).
const SECTION = 'py-6 border-t border-line-subtle'
const EMPTY = 'surface px-4 py-3 text-ui-sm text-fg-muted'

export function SizeDesignStep({
  aspectRatio,
  setAspectRatio,
  campaignId,
  resolvedKit,
  selectedCampaign,
  brandKitId,
  setBrandKitId,
  brandKitOptions,
  designMode,
  setDesignMode,
  templateId,
  setTemplateId,
  referenceTemplateId,
  setReferenceTemplateId,
  visibleTemplates,
}: SizeDesignStepProps) {
  return (
    <div>
      <StepHead index={1} title={<>Size &amp; Design</>}>
        Choose the post size, which brand kit to use, and how the design is generated.
        You&apos;ll pick where to publish (Instagram / LinkedIn) at publish time.
      </StepHead>

      {/* Post size */}
      <div className={SECTION}>
        <FieldLabel>Post Size</FieldLabel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {ASPECT_OPTIONS.map(({ value, icon: Icon, sub }) => {
            const selected = aspectRatio === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setAspectRatio(value)}
                aria-pressed={selected}
                className={cardCls(selected, 'flex items-center gap-3 p-4')}
              >
                <Icon size={20} strokeWidth={1.4} className={selected ? 'text-fg' : 'text-fg-muted'} />
                <span className="min-w-0">
                  <span className="block font-display text-ui-lg font-medium leading-tight text-fg">
                    {ASPECT_LABELS[value]}
                  </span>
                  <span className="block text-ui-xs text-fg-muted">{sub} px</span>
                </span>
                {selected && <Check size={15} strokeWidth={1.4} className="ml-auto text-accent flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Brand kit */}
      <div className={SECTION}>
        <FieldLabel>Brand Kit</FieldLabel>
        <Select
          options={brandKitOptions}
          value={brandKitId}
          onChange={e => setBrandKitId(e.target.value)}
        />
        <p className="mt-2 text-ui-xs text-fg-muted">
          {campaignId && resolvedKit && brandKitId === resolvedKit.id
            ? `Defaulted from “${selectedCampaign?.name ?? 'campaign'}” (${SOURCE_LABEL[resolvedKit.source] ?? resolvedKit.source}). Override here if needed.`
            : 'Templates below are filtered to the selected brand kit.'}
        </p>
        {brandKitId === '' && (
          <p className="text-ui-xs text-status-failed mt-1">Select a brand kit to continue.</p>
        )}
      </div>

      {/* Path */}
      <div className={SECTION}>
        <FieldLabel>Generation Path</FieldLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setDesignMode('TEMPLATE')
              setReferenceTemplateId('')
            }}
            aria-pressed={designMode === 'TEMPLATE'}
            className={cardCls(designMode === 'TEMPLATE', 'p-4')}
          >
            <div className="font-display text-ui-lg font-medium leading-tight text-fg mb-1.5">
              Path A — Template
            </div>
            <div className="text-ui-xs text-fg-muted">
              Claude fills a pre-built HTML/CSS brand template. Consistent, on-brand output.
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              setDesignMode('GENERATE')
              setTemplateId('')
            }}
            aria-pressed={designMode === 'GENERATE'}
            className={cardCls(designMode === 'GENERATE', 'p-4')}
          >
            <div className="font-display text-ui-lg font-medium leading-tight text-fg mb-1.5">
              Path B — Freeform
            </div>
            <div className="text-ui-xs text-fg-muted">
              Claude designs a new HTML/CSS layout from scratch. Maximum creative flexibility.
            </div>
          </button>
        </div>
      </div>

      {/* Template picker — Path A */}
      {designMode === 'TEMPLATE' && (
        <div className={SECTION}>
          <FieldLabel>Template</FieldLabel>
          {!brandKitId ? (
            <div className={EMPTY}>
              Select a brand kit above to see its templates.
            </div>
          ) : visibleTemplates.length === 0 ? (
            <div className={EMPTY}>
              This brand kit has no {ASPECT_LABELS[aspectRatio]} templates. Add one under Admin → Brand Kits, change the size or kit, or switch to Path B.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {visibleTemplates.map(t => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  selected={templateId === t.id}
                  onSelect={() => setTemplateId(t.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reference template — Path B (optional) */}
      {designMode === 'GENERATE' && (
        <div className={SECTION}>
          <FieldLabel>
            Style Reference Template <span className="normal-case tracking-normal font-normal">(optional)</span>
          </FieldLabel>
          <p className="text-ui-xs text-fg-muted mb-3">
            Claude uses this for visual inspiration only — it won&apos;t copy the layout exactly.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setReferenceTemplateId('')}
              aria-pressed={referenceTemplateId === ''}
              className={cardCls(referenceTemplateId === '', 'flex items-center gap-3 p-3')}
            >
              <span className="w-8 h-8 rounded-ui-sm border border-line-subtle bg-surface flex items-center justify-center flex-shrink-0">
                <Sparkles size={15} strokeWidth={1.4} className="text-fg-muted" />
              </span>
              <span className="text-ui-sm font-semibold text-fg">No reference</span>
            </button>
            {visibleTemplates.map(t => (
              <TemplateCard
                key={t.id}
                template={t}
                selected={referenceTemplateId === t.id}
                onSelect={() => setReferenceTemplateId(t.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
