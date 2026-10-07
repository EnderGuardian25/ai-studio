'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { ImageIcon, Trash2, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { StatusChip } from '@/components/ui/StatusChip'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import type { AspectRatio } from '@prisma/client'
import { aspectClassFor } from '@/lib/aspectRatio'
import { channelLabel } from '@/lib/channels'

interface PostSummary {
  id: string
  channel: string
  status: string
  scheduledAt: string | null
  publishedAt: string | null
}

interface PostCardDraft {
  id: string
  exportUrl: string | null
  status: string
  createdAt: string
  brief: { topic: string; channels: string[]; aspectRatio?: AspectRatio }
  posts: PostSummary[]
  brandKitName: string | null
}

interface PostCardProps {
  draft: PostCardDraft
  isTeamAdmin: boolean
  onPublish: (draftId: string, exportUrl: string) => void
  onViewHistory: (draftId: string, posts: PostSummary[]) => void
  // Admin-only hard delete (button hidden when omitted).
  onDelete?: (draftId: string) => void
}

type ChipStatus = 'draft' | 'exported' | 'scheduled' | 'published' | 'failed'

// The expand button sits on the post image, which can be any colour, so it
// uses fixed ink-on-paper values that read in both themes (DESIGN_SYSTEM.md
// §8.12): 30 × 30, inset 10 px. Shown on hover or keyboard focus, as before.
const EXPAND_BUTTON =
  'absolute top-2.5 right-2.5 inline-flex h-[30px] w-[30px] items-center justify-center rounded-ui-sm border border-[#211c18] bg-[#fffefb] text-[#211c18] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-fast ease-standard focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus' // ui-exception: drawn on the post image, fixed ink-on-paper per DESIGN_SYSTEM.md §8.12

function deriveStatus(draft: PostCardDraft): ChipStatus {
  if (draft.posts.length === 0) {
    return draft.status === 'EXPORTED' ? 'exported' : 'draft'
  }
  // Most recent post is first (ordered desc)
  const latest = draft.posts[0]
  const s = latest.status.toLowerCase()
  if (s === 'published') return 'published'
  if (s === 'scheduled' || s === 'pending') return 'scheduled'
  if (s === 'failed') return 'failed'
  return 'draft'
}

export function PostCard({ draft, isTeamAdmin, onPublish, onViewHistory, onDelete }: PostCardProps) {
  const chipStatus = deriveStatus(draft)
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className="flex flex-col min-w-0">
      {/* The thumbnail, framed like a contact-sheet frame (DESIGN_SYSTEM.md
          §8.12): a 1 px --line-subtle outline 3 px out (--line on hover), no
          box, no rounding. The post image itself is shown as rendered — no
          filter, tint, crop change or hover scale. */}
      <Link
        href={`/drafts/${draft.id}`}
        className={`relative ${aspectClassFor(draft.brief.aspectRatio)} w-full block group overflow-hidden bg-surface outline outline-1 outline-offset-[3px] outline-line-subtle hover:outline-line transition-[outline-color] duration-fast ease-standard focus-visible:outline-2 focus-visible:outline-focus`}
      >
        {draft.exportUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- MinIO signed URL, not a next/image source */}
            <img
              src={draft.exportUrl}
              alt={draft.brief.topic}
              loading="lazy"
              className="w-full h-full object-cover"
            />
            {/* Expand-to-full-screen — the tile itself still navigates to the draft. */}
            <button
              aria-label={`View ${draft.brief.topic} full screen`}
              title="View full screen"
              className={EXPAND_BUTTON}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setShowPreview(true)
              }}
            >
              <Maximize2 size={15} strokeWidth={1.4} />
            </button>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon size={36} strokeWidth={1.4} className="text-fg-muted opacity-40" />
          </div>
        )}
      </Link>

      {/* Title, then a muted meta line with the status on the right */}
      <div className="flex flex-col gap-1.5 pt-4">
        <p
          className="font-display text-ui-lg font-medium leading-snug text-fg line-clamp-2"
          title={draft.brief.topic}
        >
          {draft.brief.topic}
        </p>

        <div className="flex items-center justify-between gap-3">
          <p
            className="min-w-0 truncate text-ui-xs text-fg-muted"
            title={[
              draft.brief.channels.map((ch) => channelLabel(ch)).join(', '),
              draft.brandKitName,
            ]
              .filter(Boolean)
              .join(' · ')}
          >
            {draft.brief.channels.map((ch) => channelLabel(ch)).join(', ')}
            {draft.brandKitName && (
              <>
                <span aria-hidden="true"> · </span>
                {draft.brandKitName}
              </>
            )}
          </p>
          <StatusChip status={chipStatus} className="flex-shrink-0" />
        </div>

        {/* Actions. The floating Create post button is the view's one
            primary (§8.2), so Publish is Outline here and History is Text. */}
        <div className="flex items-center gap-2 pt-2">
          {isTeamAdmin && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onPublish(draft.id, draft.exportUrl ?? '')}
              disabled={!draft.exportUrl}
            >
              Publish
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewHistory(draft.id, draft.posts)}
          >
            History
          </Button>
          {isTeamAdmin && onDelete && (
            <button
              type="button"
              aria-label={`Delete ${draft.brief.topic}`}
              title="Delete post"
              className="ml-auto inline-flex h-[30px] w-[30px] items-center justify-center rounded-ui-md text-fg-muted transition-colors duration-fast ease-standard hover:text-status-failed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              onClick={() => onDelete(draft.id)}
            >
              <Trash2 size={15} strokeWidth={1.4} />
            </button>
          )}
        </div>
      </div>

      {draft.exportUrl && (
        <ImageLightbox
          open={showPreview}
          onClose={() => setShowPreview(false)}
          src={draft.exportUrl}
          topic={draft.brief.topic}
          aspectRatio={draft.brief.aspectRatio}
        />
      )}
    </div>
  )
}
