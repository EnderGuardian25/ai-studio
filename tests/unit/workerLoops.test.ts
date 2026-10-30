// 037 FR-03 / AC-12: the worker's loops are one named list. T2 removed the
// generation loop; T4 reduces the set to `retention` alone and updates this.

import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it, expect } from 'vitest'
import { LOOPS } from '@/scheduler/loops'

describe('the worker loops', () => {
  it('are the publish scheduler and retention (no generation loop)', () => {
    expect([...LOOPS]).toEqual(['scheduler', 'retention'])
    expect(LOOPS).not.toContain('generation')
  })

  it('the worker starts exactly the loops in the list', () => {
    const worker = readFileSync(join(process.cwd(), 'src/scheduler/worker.ts'), 'utf8')
    expect(worker).toMatch(/LOOPS\.map\(/)
    expect(worker).not.toMatch(/generationRunner|logTeamsWithoutClaudeToken/)
  })
})
