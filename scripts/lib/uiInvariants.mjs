// Change 033 FR-01, design section 5: the pure core of the behaviour-invariant
// check. No fs and no git here; scripts/check-ui-invariants.mjs does both.
//
// Citation rule for permits (decided by the orchestrator): every permit carries
// the `rowId` of the audit.md row whose Permits cell holds it. `parsePermits`
// also returns `rows` (Map of row ID to Status) and `duplicates` (row IDs seen
// more than once). `judge(diff, permits, rows, duplicates)` fails a permit whose
// rowId is not a valid `A-NNN` ID or is absent from `rows`, fails a permit on a
// row whose Status is not `approved` or `closed ...`, and fails on any
// duplicated row ID. A permit on a bad row consumes nothing, so the diff it was
// meant to cover fails too. A permit's file must be one of the files the removed
// (or added) key came from. Unused permits are warnings.
//
// Permits cell format: each token is one markdown code span holding
// `-<file>:<attr>=<value>` or `+<file>:<attr>=<value>`. A value that contains a
// backtick (a template literal) uses a double-backtick span with one space of
// padding: `` -f.tsx:id=`x-${i}` ``. A literal pipe in any cell is written \|
// (markdown's escape), e.g. `-f.tsx:href=a \|\| b` for href={a || b}. A cell that is not an em dash and
// holds no code span is malformed and fails. Status is `approved` exactly or
// `closed <sha>`.
import ts from 'typescript'

// design.md section 2.1, `src/` prefix restored, brace groups expanded.
const dir = (base, names, ext) => names.map((n) => `${base}/${n}.${ext}`)
export const AUDIT_SET = [
  // G1 Draft page
  'src/app/(app)/drafts/[id]/page.tsx',
  ...dir(
    'src/components/drafts',
    [
      'BackgroundNotice',
      'CaptionPanel',
      'CaptionPanels',
      'ElementEditPanel',
      'GeneratedWith',
      'HeadlinePanel',
      'InlineEditModal',
      'RefinementPanel',
    ],
    'tsx',
  ),
  'src/components/library/PublishDialog.tsx',
  // G2 Create flow, shell
  'src/app/(app)/page.tsx',
  'src/app/(app)/brief/page.tsx',
  'src/app/(app)/library/page.tsx',
  ...dir(
    'src/components/brief',
    ['CampaignStep', 'ContentStep', 'ImagesStep', 'ReviewStep', 'SizeDesignStep'],
    'tsx',
  ),
  ...dir('src/components/brief', ['constants', 'useBriefWizard'], 'ts'),
  'src/components/dashboard/RecentDraftsCard.tsx',
  ...dir('src/components/layout', ['AppShell', 'CreatePostButton'], 'tsx'),
  ...dir('src/components/ui', ['ModelPicker', 'PageHead', 'FieldLabel'], 'tsx'),
  // G3 Campaigns, kits
  'src/app/(app)/campaigns/page.tsx',
  'src/app/(app)/campaigns/[id]/page.tsx',
  'src/app/(app)/projects/page.tsx',
  'src/app/(app)/admin/brandkits/page.tsx',
  ...dir(
    'src/components/campaigns',
    [
      'BriefingAssistantPanel',
      'CampaignBriefingSection',
      'QueueEntryModal',
      'ScheduledQueueSection',
    ],
    'tsx',
  ),
  ...dir(
    'src/components/admin/brandkits',
    ['AddKitModal', 'BrandKitAssistantPanel', 'FontEditor', 'KitDetail', 'PromptSection'],
    'tsx',
  ),
  // G4 Team, settings, admin
  'src/app/(app)/team/page.tsx',
  'src/app/(app)/admin/layout.tsx',
  'src/app/(app)/admin/users/page.tsx',
  ...dir('src/components/settings', ['ClaudeConnectGuide', 'OpenAiKeyCard'], 'tsx'),
  'src/components/team/TeamClaudeTokenCard.tsx',
  ...dir('src/components/ui', ['Notice', 'StatusChip'], 'tsx'),
]

const WATCHED = /^(aria-.+|data-testid|role|id|htmlFor|type|name|href|on[A-Z].*)$/
const squash = (s) => s.replace(/\s+/g, ' ').trim()

/** Entries `{ key: 'attr=value', file }` for each watched JSX attribute. */
export function collectAttrs(source, file) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out = []
  const visit = (node) => {
    if (ts.isJsxSpreadAttribute(node)) {
      out.push({ key: `...${squash(node.expression.getText(sf))}`, file })
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sf)
      if (WATCHED.test(name)) {
        const init = node.initializer
        let value = 'true'
        if (init && ts.isStringLiteral(init)) value = squash(init.text)
        else if (init && ts.isJsxExpression(init) && init.expression) {
          const e = init.expression
          value =
            ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)
              ? squash(e.text)
              : squash(e.getText(sf))
        }
        out.push({ key: `${name}=${value}`, file })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

const tally = (entries) => {
  const m = new Map()
  for (const { key, file } of entries) {
    const t = m.get(key) ?? { count: 0, files: new Set() }
    t.count++
    t.files.add(file)
    m.set(key, t)
  }
  return m
}

/** Multiset diff by key. `added`/`removed`: Map key -> { count, files }. */
export function diffAttrs(base, head) {
  const b = tally(base)
  const h = tally(head)
  const added = new Map()
  const removed = new Map()
  for (const key of new Set([...b.keys(), ...h.keys()])) {
    const nb = b.get(key)?.count ?? 0
    const nh = h.get(key)?.count ?? 0
    if (nh > nb) added.set(key, { count: nh - nb, files: [...h.get(key).files].sort() })
    if (nb > nh) removed.set(key, { count: nb - nh, files: [...b.get(key).files].sort() })
  }
  return { added, removed }
}

const cells = (line) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'))
const unwrap = (c) => c.replace(/^`+|`+$/g, '').trim()

/** Parse the family tables of audit.md (ID, File, Element, Class, Reference, Fix, Permits, Status). */
export function parsePermits(auditMd) {
  const permits = []
  const rows = new Map()
  const duplicates = []
  const files = new Set()
  let inTable = false
  for (const line of auditMd.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) {
      inTable = false
      continue
    }
    const c = cells(line)
    if (c[0].toLowerCase() === 'id') {
      inTable = true
      continue
    }
    if (!inTable || /^:?-+:?$/.test(c[0]) || c[0] === '') continue
    const id = unwrap(c[0])
    const file = unwrap(c[1] ?? '')
    const status = unwrap(c[7] ?? '')
    if (rows.has(id)) duplicates.push(id)
    else rows.set(id, status)
    if (file) files.add(file)
    const cell = (c[6] ?? '').trim()
    if (cell && cell !== '—' && cell !== '-') {
      const spans = [...cell.matchAll(/(`+)([^]*?[^`])\1(?!`)/g)].map((m) =>
        m[2].replace(/^ (.*) $/s, '$1').trim(),
      )
      if (spans.length === 0) permits.push({ rowId: id, sign: '?', file: '', key: cell, status })
      for (const tok of spans) {
        const m = /^([+-])([^\s:]+):(.+)$/s.exec(tok)
        if (m) permits.push({ rowId: id, sign: m[1], file: m[2], key: squash(m[3]), status })
        else permits.push({ rowId: id, sign: '?', file: '', key: tok, status })
      }
    }
  }
  return { permits, rows, duplicates, files }
}

/** Judge a diff against the permits. Returns { ok, failures, warnings }. */
export function judge(diff, permits, rows = new Map(), duplicates = []) {
  const failures = []
  const warnings = []
  const left = { '+': new Map(), '-': new Map() }
  for (const [k, v] of diff.added) left['+'].set(k, { ...v })
  for (const [k, v] of diff.removed) left['-'].set(k, { ...v })
  for (const id of duplicates) failures.push(`duplicate row ID ${id}`)
  for (const p of permits) {
    const tag = `${p.rowId} ${p.sign}${p.file}:${p.key}`
    if (!/^A-\d{3,}$/.test(p.rowId)) {
      failures.push(`permit cites an invalid row ID: ${tag}`)
      continue
    }
    if (!rows.has(p.rowId)) {
      failures.push(`permit cites an unknown row: ${tag}`)
      continue
    }
    if (p.sign === '?') {
      failures.push(`malformed permit on ${p.rowId}: ${p.key}`)
      continue
    }
    const status = rows.get(p.rowId)
    if (!/^(approved|closed \S+)$/.test(status)) {
      failures.push(
        `permit on a row that is not approved or closed (${status || 'no status'}): ${tag}`,
      )
      continue
    }
    const slot = left[p.sign].get(p.key)
    if (slot && slot.count > 0 && slot.files.includes(p.file)) slot.count--
    else warnings.push(`unused permit: ${tag}`)
  }
  for (const sign of ['-', '+']) {
    for (const [key, v] of left[sign]) {
      if (v.count > 0)
        failures.push(
          `${sign === '-' ? 'removed' : 'added'} x${v.count}: ${key}  (${v.files.join(', ')})`,
        )
    }
  }
  return { ok: failures.length === 0, failures, warnings }
}
