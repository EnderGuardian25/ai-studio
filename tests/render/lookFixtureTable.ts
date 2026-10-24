// The look fixture table (change 028 T3, spec FR-08). Pure data: no renderer
// import, so a unit test can read it. The 36 rows are written out, not
// generated from the dataset, so a size added to the dataset without rows fails
// fixtureCompletenessProblems.
import type { AspectRatio } from '@prisma/client'
import type { ArchetypeMap } from '@/lib/designData'

export type FixtureKind = 'pass' | 'busy' | 'contrast'
export type Backdrop = 'dark' | 'light'

// The backdrop each look is meant to have behind its text. A literal, never
// derived from the contract's textTone, so the tone agreement test means something.
export const INTENDED_BACKDROP: Record<string, Backdrop> = {
  'product-showcase': 'dark',
  'editorial-split': 'dark',
  'full-bleed-scene': 'dark',
  spotlight: 'dark',
}

export interface FixtureSpec {
  id: string // key@version:size
  key: string
  version: number
  size: AspectRatio
  kind: FixtureKind
}

export function fixtureId(key: string, version: number, size: AspectRatio): string {
  return `${key}@${version}:${size}`
}

const row = (key: string, version: number, size: AspectRatio, kind: FixtureKind): FixtureSpec => ({
  id: fixtureId(key, version, size),
  key,
  version,
  size,
  kind,
})

export const LOOK_FIXTURES: readonly FixtureSpec[] = [
  row('product-showcase', 2, 'SQUARE', 'pass'),
  row('product-showcase', 2, 'SQUARE', 'busy'),
  row('product-showcase', 2, 'SQUARE', 'contrast'),
  row('product-showcase', 2, 'PORTRAIT', 'pass'),
  row('product-showcase', 2, 'PORTRAIT', 'busy'),
  row('product-showcase', 2, 'PORTRAIT', 'contrast'),
  row('product-showcase', 2, 'STORY', 'pass'),
  row('product-showcase', 2, 'STORY', 'busy'),
  row('product-showcase', 2, 'STORY', 'contrast'),
  row('editorial-split', 2, 'SQUARE', 'pass'),
  row('editorial-split', 2, 'SQUARE', 'busy'),
  row('editorial-split', 2, 'SQUARE', 'contrast'),
  row('editorial-split', 2, 'PORTRAIT', 'pass'),
  row('editorial-split', 2, 'PORTRAIT', 'busy'),
  row('editorial-split', 2, 'PORTRAIT', 'contrast'),
  row('editorial-split', 2, 'STORY', 'pass'),
  row('editorial-split', 2, 'STORY', 'busy'),
  row('editorial-split', 2, 'STORY', 'contrast'),
  row('full-bleed-scene', 1, 'SQUARE', 'pass'),
  row('full-bleed-scene', 1, 'SQUARE', 'busy'),
  row('full-bleed-scene', 1, 'SQUARE', 'contrast'),
  row('full-bleed-scene', 1, 'PORTRAIT', 'pass'),
  row('full-bleed-scene', 1, 'PORTRAIT', 'busy'),
  row('full-bleed-scene', 1, 'PORTRAIT', 'contrast'),
  row('full-bleed-scene', 1, 'STORY', 'pass'),
  row('full-bleed-scene', 1, 'STORY', 'busy'),
  row('full-bleed-scene', 1, 'STORY', 'contrast'),
  row('spotlight', 1, 'SQUARE', 'pass'),
  row('spotlight', 1, 'SQUARE', 'busy'),
  row('spotlight', 1, 'SQUARE', 'contrast'),
  row('spotlight', 1, 'PORTRAIT', 'pass'),
  row('spotlight', 1, 'PORTRAIT', 'busy'),
  row('spotlight', 1, 'PORTRAIT', 'contrast'),
  row('spotlight', 1, 'STORY', 'pass'),
  row('spotlight', 1, 'STORY', 'busy'),
  row('spotlight', 1, 'STORY', 'contrast'),
]

const KINDS: readonly FixtureKind[] = ['pass', 'busy', 'contrast']

// Problems between the dataset's current contracts and the table: a missing or
// extra (key, current version, size, kind) row, or a duplicate.
export function fixtureCompletenessProblems(source: ArchetypeMap, table: readonly FixtureSpec[]): string[] {
  const problems: string[] = []
  const want = new Set<string>()
  for (const a of Object.values(source)) {
    const sizes = Object.keys(a.versions[a.current]?.sizes ?? {}) as AspectRatio[]
    for (const size of sizes) {
      for (const kind of KINDS) want.add(`${fixtureId(a.key, a.current, size)}#${kind}`)
    }
  }
  const have = new Map<string, number>()
  for (const f of table) {
    const k = `${f.id}#${f.kind}`
    have.set(k, (have.get(k) ?? 0) + 1)
  }
  for (const k of want) if (!have.has(k)) problems.push(`missing fixture ${k}`)
  for (const [k, n] of have) {
    if (!want.has(k)) problems.push(`extra fixture ${k}`)
    if (n > 1) problems.push(`duplicate fixture ${k}`)
  }
  return problems
}
