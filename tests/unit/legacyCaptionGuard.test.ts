import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// AC-08 (012 FR-03, FR-10): `Draft.legacyCaptionText` (@map("copyText")) is
// read-only. Nothing under src/ may write it: new drafts leave it null, and the
// caption store is its only reader. Every .ts/.tsx file under src/ is scanned.
//
// The read forms are an allowlist, so a new write form fails by default:
//   - `legacyCaptionText: true`            a Prisma select;
//   - `legacyCaptionText: { not: null }`   the backfill's where filter;
//   - `legacyCaptionText?: …` / `: string` a type annotation;
//   - `x.legacyCaptionText`                a property read (not `=`);
//   - `const { legacyCaptionText } = x`    a destructuring read.
// Flagged: any other object-literal key or shorthand property (a `data:`
// object of a create, update or upsert), an assignment, and any raw SQL that
// names the "copyText" column. Comment lines are skipped.

const SRC = resolve(process.cwd(), 'src')

const ALLOWED_VALUE = /^(?:true\b|\{\s*not\s*:\s*null\s*\}|string\b)/

function legacyWrites(source: string): string[] {
  const hits: string[] = []
  source.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
    const at = (what: string) => hits.push(`${i + 1}: ${what}: ${t}`)

    if (/"copyText"/.test(line)) at('raw SQL on the legacy column')

    for (const m of line.matchAll(/\blegacyCaptionText\b/g)) {
      const before = line.slice(0, m.index)
      const after = line.slice(m.index + m[0].length)
      if (/^\s*\?:/.test(after)) continue // optional type annotation
      const key = /^\s*:(?!:)\s*/.exec(after)
      if (key) {
        if (!ALLOWED_VALUE.test(after.slice(key[0].length))) at('object-literal key')
        continue
      }
      if (/\.\s*$/.test(before) || /\[\s*['"`]$/.test(before)) {
        // A property access: a write only when it is assigned.
        if (/^\s*(?:['"`]\s*\])?\s*(?:[-+*/%&|^]|\?\?|&&|\|\|)?=(?!=)/.test(after)) at('assignment')
        continue
      }
      if (/[{,]\s*$/.test(before) && /^\s*[,}]/.test(after)) {
        if (/^[^{}]*\}\s*=(?!=)/.test(after)) continue // destructuring read
        at('shorthand property')
      }
    }
  })
  return hits
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(p)
    return /\.tsx?$/.test(e.name) ? [p] : []
  })
}

describe('legacyCaptionText is read-only under src/ (AC-08)', () => {
  it('no source file writes it', () => {
    const offenders = sourceFiles(SRC).flatMap((f) =>
      legacyWrites(readFileSync(f, 'utf8')).map((h) => `${relative(process.cwd(), f)}:${h}`),
    )
    expect(offenders).toEqual([])
  })

  it('self-test: flags every write form', () => {
    for (const sample of [
      `await prisma.draft.create({ data: { briefId, legacyCaptionText: text } })`,
      `await prisma.draft.update({ where: { id }, data: { legacyCaptionText: null } })`,
      `db.draft.upsert({ where: { id }, create: { legacyCaptionText: '' }, update: {} })`,
      `const data = { status, legacyCaptionText }`,
      `const data = { legacyCaptionText, status }`,
      `draft.legacyCaptionText = 'x'`,
      `draft['legacyCaptionText'] = 'x'`,
      `draft.legacyCaptionText ??= ''`,
      'await db.$executeRaw`UPDATE "Draft" SET "copyText" = ${t}`',
    ]) {
      expect(legacyWrites(sample), sample).toHaveLength(1)
    }
  })

  it('self-test: passes every read form', () => {
    for (const sample of [
      `select: { status: true, legacyCaptionText: true },`,
      `where: { captionMigration: null, legacyCaptionText: { not: null } },`,
      `legacyText: draft.legacyCaptionText,`,
      `await migrateDraft(d.id, d.legacyCaptionText!, db)`,
      `if (draft.legacyCaptionText === null) return`,
      `const { legacyCaptionText } = draft`,
      `interface Row { legacyCaptionText: string | null; other?: number }`,
      `type Row = { legacyCaptionText?: string }`,
      `// a comment: data: { legacyCaptionText: x }`,
    ]) {
      expect(legacyWrites(sample), sample).toEqual([])
    }
  })
})
