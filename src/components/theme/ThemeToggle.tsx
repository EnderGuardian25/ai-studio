'use client'

import { useTheme } from './ThemeProvider'

// Folio segmented theme toggle (DESIGN_SYSTEM.md §8.4, the study's header
// toggle): two buttons, "Light" and "Dark", in a group named "Theme", the
// current one in ink. Each button's name is its visible text (WCAG 2.5.3) and
// `aria-pressed` carries the state. The ink highlight keys on the `.dark`
// class (themeInitScript sets it before paint), not on React state, so it is
// right from the first frame; `aria-pressed` follows React state, which the
// provider settles in its mount effect.
export function ThemeToggle() {
  const { theme, toggle } = useTheme()

  const segment = `
    inline-flex items-center px-2.5 py-1.5 transition-colors duration-fast ease-standard
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus
  `

  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex overflow-hidden rounded-ui-md border border-line font-text text-ui-xs font-semibold"
    >
      <button
        type="button"
        aria-pressed={theme === 'light'}
        onClick={() => theme !== 'light' && toggle()}
        className={`${segment} bg-fg text-canvas dark:bg-transparent dark:text-fg-muted dark:hover:text-fg`}
      >
        Light
      </button>
      <button
        type="button"
        aria-pressed={theme === 'dark'}
        onClick={() => theme !== 'dark' && toggle()}
        className={`${segment} text-fg-muted hover:text-fg dark:bg-fg dark:text-canvas`}
      >
        Dark
      </button>
    </div>
  )
}
