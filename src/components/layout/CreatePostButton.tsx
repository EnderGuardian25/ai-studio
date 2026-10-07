import Link from 'next/link'
import { Plus } from 'lucide-react'

// Floating "Create post" shortcut, fixed bottom-right on every (app) page
// except /brief (AppShell decides). A plain link, so it always starts a fresh
// brief — resuming an unfinished one stays on the dashboard's Recent Drafts.
//
// Folio (DESIGN_SYSTEM.md §8.9, §7.2): an --accent fill with --accent-fg text
// (6.83:1 light, 7.74:1 dark), 48 px tall, 28 px from the right and bottom,
// with the hard --shadow-overlay. Opaque: a solid fill, no alpha, no
// backdrop-filter. It lifts 1 px on hover and presses into its shadow; under
// reduced motion it does not move.
// z-30 keeps it under the header (z-40), the mobile sidebar overlay and
// modals (z-50), and Sonner's toaster, whose offset in ToastProvider stacks
// toasts 16 px above it.
// Icon + label from md up; icon only (48 × 48) below md, where `title` gives
// the tooltip (set at every width — a title can't be breakpoint-scoped).
// aria-label keeps the accessible name identical at both widths.
export function CreatePostButton() {
  return (
    <Link
      href="/brief"
      aria-label="Create post"
      title="Create post"
      data-testid="create-post-fab"
      className="
        fixed bottom-7 right-7 z-30
        inline-flex items-center justify-center gap-2.5 h-12 w-12 md:w-auto md:px-[22px] rounded-ui-md
        bg-accent text-accent-fg font-text text-ui-base font-semibold
        shadow-overlay
        transition-[transform,box-shadow] duration-fast ease-standard
        hover:-translate-x-px hover:-translate-y-px
        active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_0_rgb(0_0_0/0.2)]
        motion-reduce:hover:transform-none motion-reduce:active:transform-none
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus
      "
    >
      <Plus size={20} strokeWidth={1.8} aria-hidden="true" />
      <span className="hidden md:inline">Create post</span>
    </Link>
  )
}
