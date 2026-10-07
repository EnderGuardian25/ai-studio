import type { Config } from 'tailwindcss'

// A semantic colour token from globals.css (an R G B triplet), with Tailwind's
// opacity modifier slot.
const tok = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ─── Frozen Light design tokens ───
        'light-background':    '#f1f5f9',
        'light-surface':       '#ffffff',
        'light-surface-hover': '#f8fafc',
        'light-border':        '#cbd5e1',
        'light-text':          '#0f172a',
        'light-text-muted':    '#475569',

        'dark-background':    '#020617',
        'dark-surface':       '#0f172a',
        'dark-surface-hover': '#1e293b',
        'dark-border':        '#1e293b',
        'dark-text':          '#f8fafc',
        'dark-text-muted':    '#94a3b8',

        primary:        '#0284c7',
        'primary-light': '#7dd3fc',
        'primary-hover': '#0369a1',
        'primary-active':'#075985',

        // ─── Folio semantic colours (change 011, DESIGN_SYSTEM.md §3.4) ───
        // Each is an R G B triplet var from globals.css, switched by .dark, so
        // one class serves both themes and opacity modifiers work (bg-scrim/50).
        canvas: tok('canvas'),
        surface: { DEFAULT: tok('surface-1'), raised: tok('surface-2') },
        fg: { DEFAULT: tok('fg'), muted: tok('fg-muted') },
        line: { DEFAULT: tok('line'), subtle: tok('line-subtle') },
        accent: { DEFAULT: tok('accent'), fg: tok('accent-fg') },
        focus: tok('focus'),
        scrim: tok('scrim'),

        // Status tokens — single source of truth for post-status colors
        // (StatusChip consumes these). Now on the --status-* vars, which carry
        // their own light and dark values; `dark` maps to the same var so
        // StatusChip's dark: classes keep compiling until it migrates (T5).
        'status-draft':      { DEFAULT: tok('status-draft'), dark: tok('status-draft') },
        'status-exported':   { DEFAULT: tok('status-exported'), dark: tok('status-exported') },
        'status-scheduled':  { DEFAULT: tok('status-scheduled'), dark: tok('status-scheduled') },
        'status-published':  { DEFAULT: tok('status-published'), dark: tok('status-published') },
        'status-failed':     { DEFAULT: tok('status-failed'), dark: tok('status-failed') },
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        raised: 'var(--shadow-raised)',
        overlay: 'var(--shadow-overlay)',
      },
      fontFamily: {
        // `sans` stays Inter until the cleanup (T13), so unmigrated screens
        // render unchanged; migrated code opts in with font-text / font-display.
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
        display: ['var(--font-display)'],
        text: ['var(--font-sans)'],
      },
      // Folio sizes and radii under ui-* keys: Tailwind's own sm/base/xl/2xl
      // (type) and md/lg (radius) differ from Folio's, and redefining them
      // would restyle unmigrated screens. Spacing needs nothing (Folio's steps
      // equal Tailwind's).
      fontSize: {
        'ui-2xs': 'var(--text-2xs)',
        'ui-xs': 'var(--text-xs)',
        'ui-sm': 'var(--text-sm)',
        'ui-base': 'var(--text-base)',
        'ui-lg': 'var(--text-lg)',
        'ui-xl': 'var(--text-xl)',
        'ui-2xl': 'var(--text-2xl)',
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
        full: '9999px',
        'ui-sm': 'var(--radius-sm)',
        'ui-md': 'var(--radius-md)',
        'ui-lg': 'var(--radius-lg)',
        'ui-pill': 'var(--radius-pill)',
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        exit: 'var(--ease-exit)',
      },
      spacing: {
        'appbar': '4rem',   // 64px
        'sidebar': '16rem', // 256px
      },
      maxWidth: {
        canvas: '1440px',
      },
    },
  },
  plugins: [],
}

export default config
