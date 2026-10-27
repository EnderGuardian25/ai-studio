#!/usr/bin/env node
// Change 033 FR-01: compares the behaviour-bearing JSX attributes (aria-*,
// data-testid, role, id, htmlFor, type, name, href, on[A-Z]*) of every .tsx file
// under src/app and src/components with their c45ed3dc content, over the whole
// scope (a move between files passes). A difference passes only when a row of
// audit.md permits it. The head side is the WORKING TREE, so uncommitted edits
// are checked.
//
//   node scripts/check-ui-invariants.mjs             check, exit 1 on any unpermitted difference
//   node scripts/check-ui-invariants.mjs --coverage  exit 1 when an audit-set file has no audit.md row
//
// A change-scoped script, not part of test:unit or CI: its baseline is specific
// to this change. Pure core: scripts/lib/uiInvariants.mjs.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { AUDIT_SET, collectAttrs, diffAttrs, judge, parsePermits } from './lib/uiInvariants.mjs'

const BASE = 'c45ed3dc'
const SCOPE = ['src/app', 'src/components']
const AUDIT = '.specclaw/changes/033-folio-fidelity-pass/audit.md'
const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = `${d}/${e.name}`
    return e.isDirectory() ? walk(p) : [p]
  })

const baseFiles = git('ls-tree', '-r', '--name-only', BASE, ...SCOPE)
  .split('\n')
  .filter((f) => f.endsWith('.tsx'))
const headFiles = SCOPE.flatMap((d) => (existsSync(d) ? walk(d) : [])).filter((f) =>
  f.endsWith('.tsx'),
)

const base = baseFiles.flatMap((f) => collectAttrs(git('show', `${BASE}:${f}`), f))
const head = headFiles.flatMap((f) => collectAttrs(readFileSync(f, 'utf8'), f))

const audit = existsSync(AUDIT) ? readFileSync(AUDIT, 'utf8') : ''
const { permits, rows, duplicates, files } = parsePermits(audit)

console.log(
  `ui invariants: ${BASE} (${baseFiles.length} files) vs working tree (${headFiles.length} files); ${rows.size} audit rows`,
)
let failed = false

if (process.argv.includes('--coverage')) {
  const missing = AUDIT_SET.filter((f) => !files.has(f))
  for (const f of missing) console.log(`no audit row: ${f}`)
  console.log(
    `coverage: ${AUDIT_SET.length - missing.length} of ${AUDIT_SET.length} audit-set files have a row`,
  )
  failed = missing.length > 0
} else {
  const { ok, failures, warnings } = judge(diffAttrs(base, head), permits, rows, duplicates)
  for (const w of warnings) console.log(`warning: ${w}`)
  for (const f of failures) console.log(`FAIL: ${f}`)
  console.log(ok ? 'ok: no unpermitted attribute difference' : `${failures.length} failure(s)`)
  failed = !ok
}
process.exit(failed ? 1 : 0)
