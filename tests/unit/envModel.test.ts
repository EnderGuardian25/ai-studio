import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseCliModelEnv } from '@/lib/env'

// 008 FR-04 / AC-04, the parse half (the once-per-process boot line is T4's).
// CLAUDE_CLI_MODEL accepts a catalogue key in any case or a current apiId, and
// is now the system default — not a global override. Anything else fails the
// load with one message naming every accepted value.

const message = (got: string) =>
  `CLAUDE_CLI_MODEL must be one of haiku, sonnet, opus, claude-haiku-4-5, claude-sonnet-5-5, claude-opus-5-5 (got "${got}"). It is now the system default, not a global override.`

describe('parseCliModelEnv', () => {
  it.each([
    ['sonnet', 'SONNET'],
    ['OPUS', 'OPUS'],
    ['Haiku', 'HAIKU'],
    ['claude-haiku-4-5', 'HAIKU'],
    ['claude-sonnet-5-5', 'SONNET'],
    ['CLAUDE-OPUS-5-5', 'OPUS'],
    ['  sonnet  ', 'SONNET'],
  ])('%j parses to %s', (raw, key) => {
    expect(parseCliModelEnv(raw)).toBe(key)
  })

  it.each([undefined, '', '   '])('%j (unset or blank) is undefined', (raw) => {
    expect(parseCliModelEnv(raw)).toBeUndefined()
  })

  it.each([
    'default', // used to omit --model and run the account default
    'claude-sonnet-4-6', // a retired ID (previousApiIds) is not accepted
    'claude-haiku-4-5-20251001',
    'gpt-4o',
    'sonnet; rm -rf /',
    'fable',
  ])('%j throws with the FR-04 message', (raw) => {
    expect(() => parseCliModelEnv(raw)).toThrow(new Error(message(raw)))
  })
})

describe('env.ts load', () => {
  const saved = { model: process.env.CLAUDE_CLI_MODEL, phase: process.env.NEXT_PHASE }

  afterEach(() => {
    for (const [name, value] of [
      ['CLAUDE_CLI_MODEL', saved.model],
      ['NEXT_PHASE', saved.phase],
    ] as const) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    vi.resetModules()
  })

  it('exposes a valid value as its ModelKey', async () => {
    process.env.CLAUDE_CLI_MODEL = 'claude-opus-5-5'
    vi.resetModules()
    const { env } = await import('@/lib/env')
    expect(env.CLAUDE_CLI_MODEL).toBe('OPUS')
  })

  it('an invalid value fails the load, outside `next build`', async () => {
    process.env.CLAUDE_CLI_MODEL = 'default'
    delete process.env.NEXT_PHASE
    vi.resetModules()
    await expect(import('@/lib/env')).rejects.toThrow(message('default'))
  })

  it('`next build` does not fail on it (the value reads as unset)', async () => {
    process.env.CLAUDE_CLI_MODEL = 'default'
    process.env.NEXT_PHASE = 'phase-production-build'
    vi.resetModules()
    const { env } = await import('@/lib/env')
    expect(env.CLAUDE_CLI_MODEL).toBeUndefined()
  })
})
