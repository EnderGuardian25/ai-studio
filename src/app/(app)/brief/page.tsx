'use client'

import React from 'react'
import { ChevronLeft, ChevronRight, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { STEPS } from '@/components/brief/constants'
import { Stepper } from '@/components/brief/Stepper'
import { CampaignStep } from '@/components/brief/CampaignStep'
import { SizeDesignStep } from '@/components/brief/SizeDesignStep'
import { ContentStep } from '@/components/brief/ContentStep'
import { ImagesStep } from '@/components/brief/ImagesStep'
import { ReviewStep } from '@/components/brief/ReviewStep'
import { useBriefWizard } from '@/components/brief/useBriefWizard'

// ---------------------------------------------------------------------------
// Page — thin composition around useBriefWizard; each step lives in
// src/components/brief/.
// ---------------------------------------------------------------------------

// Folio page head (DESIGN_SYSTEM.md §5.2, §6), as on the dashboard and library.
const EYEBROW = 'text-ui-2xs font-semibold uppercase tracking-[0.14em] text-fg-muted'
const PAGE_TITLE =
  "mt-2 font-display font-normal text-ui-xl md:text-ui-2xl leading-[1.04] tracking-[-0.025em] [font-variation-settings:'opsz'_144]"

export default function NewBriefPage() {
  const wizard = useBriefWizard()
  const { step, setStep, submitting } = wizard

  return (
    <div className="max-w-3xl">
      <div className="mb-10">
        <div className={EYEBROW}>Create</div>
        <h1 className={PAGE_TITLE}>New Brief</h1>
        <p className="mt-3 text-ui-sm text-fg-muted">
          Describe what you want to create and we&apos;ll generate an on-brand social post.
        </p>
      </div>

      <Stepper step={step} onJump={setStep} />

      {step === 0 && (
        <CampaignStep
          campaignId={wizard.campaignId}
          kitLoading={wizard.kitLoading}
          resolvedKit={wizard.resolvedKit}
          projectsWithCampaigns={wizard.projectsWithCampaigns}
          standaloneCampaigns={wizard.standaloneCampaigns}
          onSelectCampaign={wizard.selectCampaign}
          onClearCampaign={wizard.clearCampaign}
        />
      )}

      {step === 1 && (
        <SizeDesignStep
          aspectRatio={wizard.aspectRatio}
          setAspectRatio={wizard.setAspectRatio}
          campaignId={wizard.campaignId}
          resolvedKit={wizard.resolvedKit}
          selectedCampaign={wizard.selectedCampaign}
          brandKitId={wizard.brandKitId}
          setBrandKitId={wizard.setBrandKitId}
          brandKitOptions={wizard.brandKitOptions}
          designMode={wizard.designMode}
          setDesignMode={wizard.setDesignMode}
          templateId={wizard.templateId}
          setTemplateId={wizard.setTemplateId}
          referenceTemplateId={wizard.referenceTemplateId}
          setReferenceTemplateId={wizard.setReferenceTemplateId}
          visibleTemplates={wizard.visibleTemplates}
        />
      )}

      {step === 2 && (
        <ContentStep
          topic={wizard.topic}
          setTopic={wizard.setTopic}
          prompt={wizard.prompt}
          setPrompt={wizard.setPrompt}
          goal={wizard.goal}
          setGoal={wizard.setGoal}
          tone={wizard.tone}
          setTone={wizard.setTone}
          campaignId={wizard.campaignId}
          brandKitId={wizard.brandKitId}
        />
      )}

      {step === 3 && (
        <ImagesStep
          images={wizard.images}
          uploading={wizard.uploading}
          fileInputRef={wizard.fileInputRef}
          onFilesPicked={wizard.onFilesPicked}
          removeImage={wizard.removeImage}
          toggleIntent={wizard.toggleIntent}
        />
      )}

      {step === 4 && (
        <ReviewStep
          selectedCampaign={wizard.selectedCampaign}
          selectedBrandKit={wizard.selectedBrandKit}
          aspectRatio={wizard.aspectRatio}
          designMode={wizard.designMode}
          selectedTemplate={wizard.selectedTemplate}
          selectedRefTemplate={wizard.selectedRefTemplate}
          goal={wizard.goal}
          tone={wizard.tone}
          images={wizard.images}
          topic={wizard.topic}
          prompt={wizard.prompt}
          providersLoaded={wizard.providersLoaded}
          copyProviderReady={wizard.copyProviderReady}
          error={wizard.error}
          submitting={submitting}
        />
      )}

      {/* ============================ Navigation ======================== */}
      {/* The action bar sits under a 2 px --fg rule; Continue / Generate Post is
          the view's one primary (the floating Create post button is hidden here). */}
      <div className="flex items-center justify-between gap-3 mt-10 pt-4 border-t-2 border-fg">
        <Button variant="ghost" onClick={() => setStep(s => s - 1)} disabled={step === 0 || submitting}>
          <ChevronLeft size={15} strokeWidth={1.4} /> Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep(s => s + 1)} disabled={!wizard.stepValid(step)}>
            Continue <ChevronRight size={15} strokeWidth={1.4} />
          </Button>
        ) : (
          <Button onClick={wizard.handleGenerate} disabled={submitting || !wizard.copyProviderReady}>
            {submitting ? <><Loader2 size={15} strokeWidth={1.4} className="animate-spin" /> Generating…</> : <><Sparkles size={15} strokeWidth={1.4} /> Generate Post</>}
          </Button>
        )}
      </div>
    </div>
  )
}
