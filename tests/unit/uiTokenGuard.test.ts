import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// AC-14 (011 FR-13): the Frozen Light layer stays gone. Every .ts/.tsx/.css
// file under src/ is checked against the three patterns of 011 design.md §7
// (legacy light-*/dark-* colour utilities, the glass utilities, raw Tailwind
// palette colours) plus the removed GlassInput/GlassPanel names. A line that
// carries `ui-exception:` is skipped, which covers both `// ui-exception: …`
// and the JSX form `{/* ui-exception: … */}` (DESIGN_SYSTEM.md §11).

const ROOT = process.cwd()
const SRC = resolve(ROOT, 'src')

const PATTERNS: Array<[string, RegExp]> = [
  [
    'legacy light-/dark- colour utility',
    /(bg|text|border|ring|from|to|via|fill|stroke|divide|outline|placeholder)-(light|dark)-[a-z-]+/,
  ],
  ['glass utility', /\bglass(-panel|-popover|-input)?\b/],
  [
    'raw palette colour',
    /(bg|text|border|ring|fill|stroke)-(slate|gray|zinc|neutral|stone|sky|blue|red|green|amber|emerald|violet|purple|indigo|rose|orange|yellow|teal|cyan|lime|pink|fuchsia)-\d{2,3}/,
  ],
  ['removed Glass primitive', /GlassInput|GlassPanel/],
]

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx|css)$/.test(entry.name) ? [path] : []
  })
}

function findViolations(file: string, text: string): string[] {
  const hits: string[] = []
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.includes('ui-exception:')) return
    for (const [label, re] of PATTERNS) {
      const m = line.match(re)
      if (m) hits.push(`${file}:${i + 1}: ${m[0]} (${label})`)
    }
  })
  return hits
}

describe('UI token guard (AC-14)', () => {
  const files = sourceFiles(SRC)

  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(100)
    expect(files.some((f) => f.endsWith('globals.css'))).toBe(true)
  })

  it('finds no legacy colour utility, glass class, raw palette colour or Glass primitive in src/', () => {
    const hits = files.flatMap((f) =>
      findViolations(relative(ROOT, f).split('\\').join('/'), readFileSync(f, 'utf8'))
    )
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('flags each pattern, and honours ui-exception in both comment forms', () => {
    const sample = [
      '<div className="bg-light-surface">', // 1
      '<div className="glass-panel">', // 2
      '<p className="text-slate-500">', // 3
      "import { GlassInput } from '@/components/ui'", // 4
      '<div className="bg-white" /> // ui-exception: post frame', // 5
      '<p>{/* ui-exception: swatch */}<span className="text-sky-500" /></p>', // 6
      '<div className="bg-surface text-fg">', // 7
    ].join('\n')
    const hits = findViolations('sample.tsx', sample)
    expect(hits.map((h) => h.split(':')[1])).toEqual(['1', '2', '3', '4'])
  })
})
