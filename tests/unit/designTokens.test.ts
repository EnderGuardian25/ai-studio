import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import tailwindConfig from '../../tailwind.config'

// AC-07 (011 FR-06/FR-07): the Folio semantic tokens live in globals.css, per
// theme where they vary, and tailwind.config.ts exposes every semantic colour
// as rgb(var(--…) / <alpha-value>). The Frozen Light tokens stay until the
// cleanup (T13), and Tailwind's default type and radius steps are not
// redefined before then (AC-08: unmigrated screens render unchanged).

const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')

// Custom properties of the top-level `:root { … }` or `.dark { … }` blocks
// (not `.dark .glass` and the like), across every such block.
function blockVars(selector: ':root' | '.dark'): Record<string, string> {
  const vars: Record<string, string> = {}
  const sel = selector === ':root' ? ':root' : '\\.dark'
  for (const [, body] of css.matchAll(new RegExp(`(?:^|\\n)${sel}\\s*\\{([^}]*)\\}`, 'g'))) {
    for (const [, name, value] of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      vars[name] = value.trim()
    }
  }
  return vars
}

const ROOT = blockVars(':root')
const DARK = blockVars('.dark')

// Theme-dependent: declared in both blocks (DESIGN_SYSTEM.md §3).
const COLOR_TOKENS = [
  'canvas',
  'surface-1',
  'surface-2',
  'fg',
  'fg-muted',
  'line',
  'line-subtle',
  'accent',
  'accent-fg',
  'focus',
  'status-draft',
  'status-exported',
  'status-scheduled',
  'status-published',
  'status-failed',
  'scrim',
]
const SHADOW_TOKENS = ['shadow-panel', 'shadow-raised', 'shadow-overlay']

// Theme-independent: declared once, on :root.
const ROOT_ONLY_TOKENS = [
  'radius-sm',
  'radius-md',
  'radius-lg',
  'radius-pill',
  'dur-fast',
  'dur-base',
  'dur-slow',
  'ease-standard',
  'ease-exit',
  'text-2xs',
  'text-xs',
  'text-sm',
  'text-base',
  'text-lg',
  'text-xl',
  'text-2xl',
  'space-1',
  'space-2',
  'space-3',
  'space-4',
  'space-6',
  'space-8',
  'space-12',
]

const TRIPLET = /^\d{1,3} \d{1,3} \d{1,3}$/

type Tree = Record<string, unknown>
const extend = (tailwindConfig.theme?.extend ?? {}) as Record<string, Tree>
const colors = extend.colors as Record<string, string | Record<string, string>>

const varOf = (value: string) => value.match(/^rgb\(var\(--([\w-]+)\) \/ <alpha-value>\)$/)?.[1]

describe('semantic tokens in globals.css (AC-07)', () => {
  it.each([...COLOR_TOKENS, ...SHADOW_TOKENS])('--%s is in :root and .dark', (name) => {
    expect(ROOT[name], `:root --${name}`).toBeTruthy()
    expect(DARK[name], `.dark --${name}`).toBeTruthy()
  })

  it.each(COLOR_TOKENS)('--%s is an R G B triplet in both themes', (name) => {
    expect(ROOT[name]).toMatch(TRIPLET)
    expect(DARK[name]).toMatch(TRIPLET)
  })

  it.each(ROOT_ONLY_TOKENS)('--%s is declared once, on :root', (name) => {
    expect(ROOT[name], `:root --${name}`).toBeTruthy()
    expect(DARK[name], `.dark must not redefine --${name}`).toBeUndefined()
  })

  it('leaves the font variables to next/font (not literal in :root)', () => {
    // A literal "Fraunces" would miss next/font's generated family name and
    // fall through to Georgia (DESIGN_SYSTEM.md §3.1 note).
    for (const name of ['font-display', 'font-sans', 'font-mono']) {
      expect(ROOT[name]).toBeUndefined()
    }
  })

  it('keeps the Frozen Light vars until the cleanup (FR-07)', () => {
    for (const name of ['background', 'surface', 'surface-hover', 'border', 'text', 'text-muted']) {
      expect(ROOT[name]).toMatch(/^#[0-9a-f]{6}$/i)
      expect(DARK[name]).toMatch(/^#[0-9a-f]{6}$/i)
    }
    for (const name of ['primary', 'primary-light', 'primary-hover', 'primary-active']) {
      expect(ROOT[name]).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('has a reduced-motion block that shortens, not removes, animations (NFR-03)', () => {
    // The block runs from its @media line to the next top-level closing brace,
    // so CSS appended after it can't break this test.
    const block = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1]
    expect(block).toBeTruthy()
    expect(block).toMatch(/animation-duration:\s*1ms !important/)
    expect(block).toMatch(/transition-duration:\s*1ms !important/)
    // Loading indicators keep moving, slowly, instead of freezing on one cycle.
    for (const cls of ['animate-spin', 'animate-pulse']) {
      expect(block).toMatch(
        new RegExp(`\\.${cls} \\{[^}]*animation-iteration-count:\\s*infinite !important`)
      )
    }
    // Removing the animation would drop modalIn's final frame, which carries
    // the modal's translate(-50%,-50%) centring.
    expect(block).not.toMatch(/animation(-name)?:\s*none/)
    expect(css).toMatch(/@keyframes modalIn[\s\S]*translate\(-50%, -50%\)/)
  })
})

describe('tailwind.config.ts semantic mapping (AC-07)', () => {
  const SEMANTIC: Record<string, string> = {
    canvas: 'canvas',
    'surface.DEFAULT': 'surface-1',
    'surface.raised': 'surface-2',
    'fg.DEFAULT': 'fg',
    'fg.muted': 'fg-muted',
    'line.DEFAULT': 'line',
    'line.subtle': 'line-subtle',
    'accent.DEFAULT': 'accent',
    'accent.fg': 'accent-fg',
    focus: 'focus',
    scrim: 'scrim',
  }
  for (const s of ['draft', 'exported', 'scheduled', 'published', 'failed']) {
    // Both keys on the one var, so StatusChip's dark: classes still compile.
    SEMANTIC[`status-${s}.DEFAULT`] = `status-${s}`
    SEMANTIC[`status-${s}.dark`] = `status-${s}`
  }

  it.each(Object.entries(SEMANTIC))('colors.%s → rgb(var(--%s) / <alpha-value>)', (path, token) => {
    const [key, sub] = path.split('.')
    const entry = colors[key]
    const value = sub ? (entry as Record<string, string>)[sub] : entry
    expect(typeof value).toBe('string')
    expect(varOf(value as string)).toBe(token)
  })

  it('maps every colour token in globals.css', () => {
    const mapped = new Set(Object.values(SEMANTIC))
    expect(COLOR_TOKENS.filter((t) => !mapped.has(t))).toEqual([])
  })

  it('points the non-colour scales at :root vars', () => {
    const refs: Record<string, Record<string, string>> = {
      boxShadow: { panel: 'shadow-panel', raised: 'shadow-raised', overlay: 'shadow-overlay' },
      transitionDuration: { fast: 'dur-fast', base: 'dur-base', slow: 'dur-slow' },
      transitionTimingFunction: { standard: 'ease-standard', exit: 'ease-exit' },
      borderRadius: {
        'ui-sm': 'radius-sm',
        'ui-md': 'radius-md',
        'ui-lg': 'radius-lg',
        'ui-pill': 'radius-pill',
      },
      fontSize: {
        'ui-2xs': 'text-2xs',
        'ui-xs': 'text-xs',
        'ui-sm': 'text-sm',
        'ui-base': 'text-base',
        'ui-lg': 'text-lg',
        'ui-xl': 'text-xl',
        'ui-2xl': 'text-2xl',
      },
    }
    for (const [scale, keys] of Object.entries(refs)) {
      for (const [key, token] of Object.entries(keys)) {
        expect(extend[scale]?.[key], `${scale}.${key}`).toBe(`var(--${token})`)
        expect(ROOT[token], `--${token}`).toBeTruthy()
      }
    }
  })

  it('wires the next/font families', () => {
    const fonts = extend.fontFamily as Record<string, string[]>
    expect(fonts.display[0]).toBe('var(--font-display)')
    expect(fonts.text[0]).toBe('var(--font-sans)')
    expect(fonts.mono[0]).toBe('var(--font-mono)')
    // The default sans stays Inter until the cleanup (T13).
    expect(fonts.sans[0]).toBe('var(--font-inter)')
  })

  it('does not redefine Tailwind default type and radius steps before the cleanup', () => {
    for (const key of ['xs', 'sm', 'base', 'lg', 'xl', '2xl']) {
      expect(extend.fontSize?.[key], `fontSize.${key}`).toBeUndefined()
    }
    for (const key of ['DEFAULT', 'sm', 'md', 'lg']) {
      expect(extend.borderRadius?.[key], `borderRadius.${key}`).toBeUndefined()
    }
  })

  it('keeps the Frozen Light colours verbatim (FR-07)', () => {
    expect(colors).toMatchObject({
      'light-background': '#f1f5f9',
      'light-surface': '#ffffff',
      'light-surface-hover': '#f8fafc',
      'light-border': '#cbd5e1',
      'light-text': '#0f172a',
      'light-text-muted': '#475569',
      'dark-background': '#020617',
      'dark-surface': '#0f172a',
      'dark-surface-hover': '#1e293b',
      'dark-border': '#1e293b',
      'dark-text': '#f8fafc',
      'dark-text-muted': '#94a3b8',
      primary: '#0284c7',
      'primary-light': '#7dd3fc',
      'primary-hover': '#0369a1',
      'primary-active': '#075985',
    })
  })
})
