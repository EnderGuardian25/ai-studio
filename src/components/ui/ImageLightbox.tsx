'use client'

import React, { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { AspectRatio } from '@prisma/client'
import { dimensionsLabel } from '@/lib/aspectRatio'
import { Button } from '@/components/ui/Button'

// Full-screen lightbox for an exported post image. Radix Dialog gives us the
// focus trap, Escape-to-close, and click-outside. Folio treatment
// (DESIGN_SYSTEM.md §8.11): a 0.8 scrim with no blur, the image fitted to the
// viewport and shown as rendered (never restyled), and opaque .surface-overlay
// chrome — the close button and a caption bar with the topic, dimensions and
// Download.

interface ImageLightboxProps {
  open: boolean
  onClose: () => void
  src: string
  topic: string
  aspectRatio?: AspectRatio | null
}

function downloadFilename(topic: string, ratio: AspectRatio | null | undefined): string {
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'post'}-${dimensionsLabel(ratio).replace('×', 'x')}.png`
}

export function ImageLightbox({ open, onClose, src, topic, aspectRatio }: ImageLightboxProps) {
  const [downloading, setDownloading] = useState(false)

  // The export lives on MinIO (another origin), so a plain <a download> would
  // navigate instead of saving — fetch to a blob and save that instead.
  async function download() {
    setDownloading(true)
    try {
      const res = await fetch(src)
      if (!res.ok) throw new Error(`Download failed (${res.status})`)
      const blobUrl = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = downloadFilename(topic, aspectRatio)
      a.click()
      URL.revokeObjectURL(blobUrl)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim/80 data-[state=open]:animate-fade-in" />
        <Dialog.Content
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 sm:p-8 focus:outline-none animate-drop"
          // Clicking the empty space around the image closes, like the overlay.
          onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
          <Dialog.Title className="sr-only">{topic} — full-screen preview</Dialog.Title>

          <Dialog.Close asChild>
            <button
              aria-label="Close preview"
              className="surface-overlay absolute top-4 right-4 p-2 text-fg-muted hover:text-fg transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <X size={20} />
            </button>
          </Dialog.Close>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={topic}
            className="max-w-full max-h-[calc(100dvh-8rem)] object-contain"
          />

          {/* Caption bar */}
          <div className="surface-overlay mt-4 flex items-center gap-3 px-4 py-2 max-w-full font-text">
            <p className="text-ui-sm text-fg truncate">
              {topic}
              <span className="ml-2 text-ui-xs tabular-nums text-fg-muted">
                {dimensionsLabel(aspectRatio)}
              </span>
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={download}
              disabled={downloading}
              className="flex-shrink-0"
            >
              {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              Download
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
