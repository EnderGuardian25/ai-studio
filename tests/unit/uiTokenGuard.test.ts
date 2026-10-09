import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// AC-14 (011 FR-13): the Frozen Light layer stays gone. Every .ts/.tsx/.css
// file under src/ is checked against the three patterns of 011 design.md §7
// (legacy light-*/dark-* colour utilities, the glass utilities, raw Tailwind
// palette colours) plus the removed GlassInput/GlassPanel names. A line that
// carries `ui-exception:` is skipped, which covers both `// ui-exception: …`
// and the JSX form `{/* ui-exception: … */}` (DESIGN_SYSTEM.md §11).
//
// 014 FR-11 adds four tokens to that guard, matched as whole class tokens:
// glow-blob, animate-scale-in, font-inter and the legacy primary colour family
// (text-primary, hover:bg-primary-light, text-primary/50, …).
//
// 014 FR-05: the shared Folio atoms and page primitives are defined once, in
// src/components/ui/. Any other file under src/ that declares one of their
// names, or spells out the small-caps tracking literally, is a new copy and
// fails here (014 design.md §5). A copy has no legitimate exception, so
// `ui-exception:` does not apply to this guard.

const ROOT = process.cwd()
const SRC = resolve(ROOT, 'src')

// 014 FR-11: a whole class token starts at the start of the line or after one
// of \s " ' ` { ( : (so a variant such as `hover:text-primary` is caught), and
// ends at the end of the line or before one of \s " ' ` } ) ] / (so an
// opacity such as `text-primary/50` is caught) or , . ; : — the punctuation
// that follows a token in a comment, since comments are scanned like code
// (the old Modal comment read "NOT animate-scale-in: the keyframes …").
// `my-glow-blob-x`, `xtext-primary` and `animate-scale-in-out` are other
// tokens and pass.
const START = String.raw`(?:^|(?<=[\s"'\`{(:!]))`
const END = String.raw`(?=$|[\s"'\`})\]/,.;:])`

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
  // 014 FR-11, matched as whole class tokens (design.md §5).
  ['glow blob', new RegExp(`${START}glow-blob${END}`)],
  ['scale-in animation', new RegExp(`${START}animate-scale-in${END}`)],
  ['Inter font', new RegExp(`${START}font-inter${END}`)],
  [
    'legacy primary colour',
    new RegExp(
      `${START}(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|placeholder|decoration|shadow)-primary(?:-[a-z]+)*${END}`
    ),
  ],
]

const SHARED_NAME =
  /^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:const|let|function)\s+(FOCUS|SCROLL_FOCUS|SMALL_CAPS|EYEBROW|FIELD_LABEL|PAGE_TITLE|PAGE_LEAD|SECTION_HEAD|SECTION_NUMERAL|SUB_HEAD|KIT_TITLE|STEP_HEAD|STEP_NUMERAL|STEP_LEAD|GROUP_HEAD|ASIDE_HEAD|NOTICE|WARN_NOTICE|ICON|ICON_SM|ICON_BUTTON|TEXT_LINK|TAG|TABLE_HEAD_ROW|COMPACT_FIELD|PageHead|PageTitle|SectionHead|SectionHeader|Notice|FieldLabel|StatusWord)\b/
const SMALL_CAPS_LITERAL = /tracking-\[0\.14em\]/
const UI_DIR = 'src/components/ui/'

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

// FR-05. `file` is the repo-relative path with forward slashes.
function findSharedCopies(file: string, text: string): string[] {
  if (file.startsWith(UI_DIR)) return []
  const hits: string[] = []
  text.split(/\r?\n/).forEach((line, i) => {
    const name = line.match(SHARED_NAME)
    if (name) hits.push(`${file}:${i + 1}: ${name[1]} (shared name outside ${UI_DIR})`)
    const caps = line.match(SMALL_CAPS_LITERAL)
    if (caps) hits.push(`${file}:${i + 1}: ${caps[0]} (small-caps literal outside ${UI_DIR})`)
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

  // 014 AC-10: each FR-11 token is flagged as a whole class token, wherever a
  // variant or an opacity puts it, and only there.
  it.each([
    ['<div className="glow-blob" />', 'glow-blob'],
    ["cn('animate-scale-in', open && 'block')", 'animate-scale-in'],
    // The Modal comment before 014 T12: comments are scanned, punctuation ends a token.
    ['// animate-modal-in, NOT animate-scale-in: the keyframes must carry', 'animate-scale-in'],
    ['<p className="md:animate-scale-in">', 'animate-scale-in'],
    ['<p className="font-inter text-fg">', 'font-inter'],
    ['<p className="text-primary">', 'text-primary'],
    ['<a className="text-fg hover:text-primary">', 'text-primary'],
    ['<span className="text-primary/50">', 'text-primary'],
    ['<div className={`bg-primary-light ${x}`}>', 'bg-primary-light'],
    ['<svg className="[&_path]:fill-primary">', 'fill-primary'],
  ])('flags %s', (line, token) => {
    const hits = findViolations('sample.tsx', line)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toContain(`: ${token} (`)
  })

  it.each([
    '<Button variant="primary">',
    '<div className="my-glow-blob-x" />',
    '<p className="xtext-primary">',
    '<p className="animate-scale-in-out font-interface">',
    '<p className="text-fg">Primary text</p>',
    '// animate-modal-in, not the old scale-in keyframe: the keyframes must carry',
    '<div className="text-primary" /> // ui-exception: self-test',
  ])('passes %s', (line) => {
    expect(findViolations('sample.tsx', line)).toEqual([])
  })
})

describe('Shared-name guard (014 FR-05, AC-02)', () => {
  const files = sourceFiles(SRC)

  it('finds no copy of a shared atom, primitive or the small-caps literal outside src/components/ui/', () => {
    const hits = files.flatMap((f) =>
      findSharedCopies(relative(ROOT, f).split('\\').join('/'), readFileSync(f, 'utf8'))
    )
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('flags each pattern outside ui, ignores ui-exception, and passes the same lines inside ui', () => {
    const sample = [
      "export const EYEBROW = 'x'", // 1
      'const FOCUS =', // 2
      'export function SectionHead({ title }: Props) {', // 3
      '  function StatusWord() {', // 4
      '<span className="uppercase tracking-[0.14em]">', // 5
      "export const EYEBROW = 'x' // ui-exception: not honoured by this guard", // 6
      "const SHELL_ICON_BUTTON = 'x'", // 7: a different name
      'const ICON_SIZE = 15', // 8: a longer name
      "import { EYEBROW, SectionHead } from '@/components/ui/folio'", // 9: a use, not a copy
      '<span className={`${EYEBROW} mb-3`}>', // 10
      '<th className="tracking-[0.1em]">', // 11: another tracking value
    ].join('\n')
    const lines = (hits: string[]) => hits.map((h) => h.split(':')[1])
    expect(lines(findSharedCopies('src/components/team/folio.tsx', sample))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ])
    expect(findSharedCopies('src/components/ui/folio.ts', sample)).toEqual([])
  })
})
