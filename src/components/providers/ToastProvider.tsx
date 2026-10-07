'use client'

import React from 'react'
import { Toaster } from 'sonner'

// App-wide toast outlet. Fire toasts anywhere on the client via
// `import { toast } from 'sonner'`.
//
// Folio toasts (DESIGN_SYSTEM.md §8.8): Sonner runs `unstyled`, so its own
// theme colours never fight the tokens, and each part takes token classes.
// The tokens switch with `.dark` on <html>, so no theme prop is passed: Sonner
// keeps its default "light", which also keeps its dark-only close-button rule
// (not gated on `unstyled`) from repainting the button.
export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      // Lift the stack clear of the floating Create post button (56px tall,
      // 24px from the bottom edge) with a 16px gap. Sonner goes full-width at
      // <=600px, so the mobile offset needs the same bottom clearance.
      offset={{ bottom: 96, right: 24 }}
      mobileOffset={{ bottom: 96 }}
      closeButton
      style={{ '--width': '340px' } as React.CSSProperties}
      toastOptions={{
        unstyled: true,
        classNames: {
          // Opaque overlay surface at radius-md (DESIGN_SYSTEM.md §4.1).
          toast:
            'surface-overlay rounded-ui-md w-full flex items-start gap-3 py-3.5 pl-4 pr-10 font-text text-ui-sm text-fg',
          icon: 'flex-shrink-0 mt-0.5',
          content: 'flex flex-col gap-0.5 min-w-0',
          title: 'font-display text-ui-lg font-medium leading-snug text-fg',
          description: 'text-ui-sm text-fg-muted',
          closeButton: [
            'absolute top-2.5 right-2.5 p-1 rounded-ui-sm text-fg-muted hover:text-fg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
          ].join(' '),
          success: '[&_[data-icon]]:text-status-published',
          error: '[&_[data-icon]]:text-status-failed',
          warning: '[&_[data-icon]]:text-status-scheduled',
          info: '[&_[data-icon]]:text-fg-muted',
        },
      }}
    />
  )
}
