'use client'

import { Type } from 'lucide-react'
import type { HeadlineImage } from '@/lib/api-types'
import { headlineNoticeText } from '@/lib/renderedText/noticeText'
import { Notice } from '@/components/ui/Notice'
import { Button } from '@/components/ui/Button'
import { ICON } from '@/components/ui/atoms'

export interface HeadlineImageNoticeProps {
  image: HeadlineImage
  canEditInline: boolean
  canRegenerate: boolean
  disabled: boolean
  onEditInline: () => void
  onRegenerateDesign: () => void
}

// 030 FR-13: the image does not show the current headline. Amber and
// `role="status"`, like CompositionNotice: a heads-up, never a blocker. The text
// comes only from `headlineNoticeText`; nothing renders for fresh or unknown.
export function HeadlineImageNotice({
  image,
  canEditInline,
  canRegenerate,
  disabled,
  onEditInline,
  onRegenerateDesign,
}: HeadlineImageNoticeProps) {
  const text = headlineNoticeText(image)
  if (!text) return null
  return (
    <Notice
      tone="warning"
      role="status"
      data-testid="headline-image-notice"
      data-state={image.state}
      data-reason={image.reason ?? undefined}
      icon={<Type {...ICON} className="mt-0.5 flex-shrink-0" aria-hidden="true" />}
      className="mt-4"
    >
      <p className="font-semibold">Headline</p>
      <p className="mt-1 text-ui-xs text-fg">{text.headline}</p>
      {text.reasonLine && <p className="mt-1 text-ui-xs text-fg">{text.reasonLine}</p>}
      {text.scheduledLine && (
        <p data-testid="headline-scheduled-line" className="mt-1 text-ui-xs text-fg">
          {text.scheduledLine}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={onEditInline} disabled={disabled || !canEditInline}>
          Edit inline
        </Button>
        {canRegenerate && (
          <Button variant="secondary" size="sm" onClick={onRegenerateDesign} disabled={disabled}>
            Regenerate design
          </Button>
        )}
      </div>
    </Notice>
  )
}
