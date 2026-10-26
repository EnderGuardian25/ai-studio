// 031 FR-18 / NFR-09: the catalogue is read by server code only; the browser uses GET /api/fonts.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const files = readdirSync(join(ROOT, 'src'), { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name))
  .map((d) => relative(ROOT, join(d.parentPath, d.name)).split(sep).join('/'))

describe('font catalogue boundary', () => {
  it('no client file imports the catalogue module or its JSON', () => {
    const bad = files.filter((f) => {
      const s = readFileSync(join(ROOT, f), 'utf8')
      if (!/^\s*['"]use client['"]/m.test(s)) return false
      return /lib\/fonts\/catalogue/.test(s)
    })
    expect(bad).toEqual([])
  })
  it('the client-safe index does not re-export the catalogue', () => {
    const idx = readFileSync(join(ROOT, 'src/lib/fonts/index.ts'), 'utf8')
    expect(idx.replace(/\/\/[^\n]*/g, '')).not.toMatch(/catalogue/)
  })
})
