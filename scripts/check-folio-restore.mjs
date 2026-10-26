#!/usr/bin/env node
// Change 032 FR-12: checks that every restored UI file equals its 9f829456
// (Folio) content after the fixed import map (design.md section 3.1), plus the
// kept additions listed below. Also checks the four FR-11 files byte for byte
// and that public/BistecStudioLogo.png is gone.
//
//   node scripts/check-folio-restore.mjs          check, exit 1 on any difference
//   node scripts/check-folio-restore.mjs --write  write the T5 files from 9f829456
//
// A plain script, not a unit test: CI checks out with depth 1 and has no
// 9f829456. T6 flips T6_DONE to true once its pages and screens are restored.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const BASE = '9f829456'
const T6_DONE = false

// FR-11: byte-identical to BASE.
const BYTE_IDENTICAL = ['src/app/globals.css', 'src/app/layout.tsx', 'tailwind.config.ts', 'src/components/Logo.tsx']

// design.md section 3.1: the import map. Applied line by line; the specifier is
// the only thing that changes. `team/folio` lines are per-file (see SPECIAL).
const MAP = [
  ["from '@/components/ui/folio'", "from '@/components/ui/atoms'"],
  ["from '@/components/campaigns/folio'", "from '@/components/campaigns/classes'"],
  ["from '@/components/admin/brandkits/folio'", "from '@/components/admin/brandkits/classes'"],
]
// `./folio` means a different module per directory.
const LOCAL = {
  'src/components/ui/': "from './atoms'",
  'src/components/admin/brandkits/': "from './classes'",
  'src/components/team/': "from '@/components/ui/atoms'",
}

// Exact rewritten lines for the `@/components/team/folio` imports.
const SPECIAL = {
  "import { BLOCK, GateNotice, ROW } from '@/components/team/folio'": [
    "import { GateNotice } from '@/components/ui/GateNotice'",
    "import { BLOCK, ROW } from '@/components/ui/atoms'",
  ],
  "import { BLOCK } from '@/components/team/folio'": ["import { BLOCK } from '@/components/ui/atoms'"],
}

// Kept additions: [BASE line, replacement lines]. Each is a deliberate
// difference from BASE, with the reason.
const KEPT = {
  // Panel: post-021 callers pass `bezel` (the Graphite double-bezel card). Folio has
  // one card class, so the prop is accepted and ignored (callers: admin/teams,
  // admin/users, brief, campaigns, dashboard, insights, projects pages).
  'src/components/ui/Panel.tsx': [
    ['  className?: string', ['  className?: string', '  /** Kept addition (032): accepted for post-021 callers; Folio has one card class. */', '  bezel?: boolean']],
    [
      'export function Panel({ className, children, ...props }: PanelProps) {',
      ['export function Panel({ className, children, bezel: _bezel, ...props }: PanelProps) {'],
    ],
  ],
  // SectionHead: post-021 callers (brandkits/KitDetail) pass `card` (the card-head
  // size on an h3). Folio's h3 is the sub-head, so the prop is accepted and ignored.
  'src/components/ui/SectionHead.tsx': [
    ['  level?: 2 | 3', ['  level?: 2 | 3', '  /** Kept addition (032): accepted for post-021 callers; Folio has no card-head style. */', '  card?: boolean']],
    ['  level = 2,', ['  level = 2,', '  card: _card,']],
  ],
  // The GateNotice module is its own file now (021), re-exported from the barrel.
  'src/components/ui/index.ts': [["export * from './folio'", ["export { GateNotice } from './GateNotice'", "export * from './atoms'"]]],
}

const PAGES = [
  'src/app/(app)/admin/teams/page.tsx',
  'src/app/(app)/choose-team/page.tsx',
  'src/app/(app)/projects/[id]/page.tsx',
  'src/app/(app)/settings/page.tsx',
  'src/app/(auth)/login/page.tsx',
]
const SCREENS = [
  'src/components/admin/brandkits/ColorEditor.tsx',
  'src/components/brief/CampaignRow.tsx',
  'src/components/brief/ReviewRow.tsx',
  'src/components/brief/StepHead.tsx',
  'src/components/brief/Stepper.tsx',
  'src/components/brief/TemplateCard.tsx',
  'src/components/dashboard/NoTeamNotice.tsx',
  'src/components/drafts/NotAppliedCard.tsx',
  'src/components/layout/TeamSwitcher.tsx',
  'src/components/library/PostCard.tsx',
  'src/components/library/PublishHistoryDrawer.tsx',
  'src/components/providers/ToastProvider.tsx',
  'src/components/settings/ChangePasswordCard.tsx',
  'src/components/settings/ClaudeTokenCard.tsx',
  'src/components/settings/ClaudeTokenPrompt.tsx',
  'src/components/team/ApiKeysCard.tsx',
  'src/components/team/ModelsCard.tsx',
  'src/components/theme/ThemeToggle.tsx',
]
const PRIMITIVES = [
  'Button', 'FieldLabel', 'ImageLightbox', 'Input', 'Modal', 'Notice', 'PageHead', 'Panel',
  'QueryError', 'SectionHead', 'SegmentedToggle', 'Select', 'StatusChip',
].map((n) => `src/components/ui/${n}.tsx`)

const ENTRIES = [
  ...[...PRIMITIVES, 'src/components/ui/index.ts', 'src/components/brief/cardCls.ts'].map((path) => ({ path, task: 'T5' })),
  // The login page moved to T5: the restored Logo takes `size`, so its old
  // `height` prop would leave tsc red until T6.
  ...[...PAGES, ...SCREENS].map((path) => ({ path, task: path.includes('(auth)/login') ? 'T5' : 'T6' })),
]

const git = (...args) => execFileSync('git', args, { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 })
const baseOf = (path) => git('show', `${BASE}:${path}`)

function expected(path) {
  const dir = Object.keys(LOCAL).find((d) => path.startsWith(d))
  const kept = KEPT[path] ?? []
  const out = []
  for (const line of baseOf(path).toString('utf8').split('\n')) {
    const k = kept.find(([from]) => from === line)
    if (k) {
      out.push(...k[1])
      continue
    }
    if (SPECIAL[line]) {
      out.push(...SPECIAL[line])
      continue
    }
    let next = line
    for (const [from, to] of MAP) next = next.split(from).join(to)
    if (dir && next.includes("from './folio'")) next = next.split("from './folio'").join(LOCAL[dir])
    out.push(next)
  }
  return out.join('\n')
}

function diff(a, b) {
  const x = a.split('\n')
  const y = b.split('\n')
  const lines = []
  for (let i = 0; i < Math.max(x.length, y.length) && lines.length < 40; i++) {
    if (x[i] !== y[i]) lines.push(`  line ${i + 1}\n    expected: ${x[i] ?? '(none)'}\n    actual:   ${y[i] ?? '(none)'}`)
  }
  return lines.join('\n')
}

if (process.argv.includes('--write')) {
  for (const { path, task } of ENTRIES) {
    if (task === 'T5' || process.argv.includes('--all')) writeFileSync(path, expected(path))
  }
  console.log('written')
  process.exit(0)
}

let failed = 0
for (const path of BYTE_IDENTICAL) {
  if (!existsSync(path) || !baseOf(path).equals(readFileSync(path))) {
    failed++
    console.log(`FAIL ${path}: not byte-identical to ${BASE}`)
  } else console.log(`ok   ${path} (byte-identical)`)
}
if (existsSync('public/BistecStudioLogo.png')) {
  failed++
  console.log('FAIL public/BistecStudioLogo.png still exists')
} else console.log('ok   public/BistecStudioLogo.png absent')

for (const { path, task } of ENTRIES) {
  const want = expected(path)
  const have = existsSync(path) ? readFileSync(path, 'utf8') : null
  if (have === want) {
    console.log(`ok   ${path}`)
    continue
  }
  if (task === 'T6' && !T6_DONE) {
    console.log(`pending (T6) ${path}`)
    continue
  }
  failed++
  console.log(`FAIL ${path}\n${have === null ? '  missing' : diff(want, have)}`)
}
console.log(failed ? `\n${failed} difference(s)` : '\nall restored files match')
process.exit(failed ? 1 : 0)
