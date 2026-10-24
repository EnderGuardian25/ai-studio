import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import * as lc from '../../scripts/look-check/lookCheck.mjs'
import {
  SLOTS, capFor, parseLedger, attemptsFor, lastResult, slotPassed, planNext,
  totalLine, checkBase, parseVerdictArg,
} from '../../scripts/look-check/lookCheck.mjs'

type Verdicts = Record<string, { passed: boolean; slots: Record<string, string> }>
const verdicts = (r: unknown[]) => lc.lookVerdicts(r) as Verdicts
const cap = capFor(SLOTS)
const S = 'spotlight:SQUARE'
const line = (slot: string, attempt = 1) => JSON.stringify({ at: 't', runId: 'r', slot, attempt })
const res = (slot: string, over: Record<string, unknown> = {}) => ({
  slot, styleKept: true, accepted: null, error: null, ...over,
})

describe('look-check runner logic (AC-15)', () => {
  it('has 8 slots and a computed cap of 16', () => {
    expect(SLOTS).toHaveLength(8)
    expect(cap).toBe(16)
    expect(capFor([1, 2, 3])).toBe(6)
  })

  it('counts a ledger line with no result as an attempt', () => {
    const entries = parseLedger(line(S) + '\n')
    expect(attemptsFor(entries, S)).toBe(1)
    expect(planNext(entries, [], S, cap)).toEqual({ ok: true, attempt: 2 })
  })

  it('counts a result with error once (ledger line plus result is one attempt)', () => {
    const entries = parseLedger(line(S) + '\n')
    const results = [res(S, { styleKept: false, error: 'timeout' })]
    expect(attemptsFor(entries, S)).toBe(1)
    expect(planNext(entries, results, S, cap)).toEqual({ ok: true, attempt: 2 })
  })

  it('counts a malformed ledger line as an attempt and never drops it', () => {
    const entries = parseLedger(line('a:SQUARE') + '\n{"slot":"spotlight:SQUARE", broken\nnot json at all\n')
    expect(entries).toHaveLength(3)
    expect(attemptsFor(entries, S)).toBe(1)
    expect(entries.filter((e: { malformed?: boolean }) => e.malformed)).toHaveLength(2)
  })

  it('refuses at the cap, whichever slot', () => {
    const text = Array.from({ length: cap }, (_, i) => line(SLOTS[i % 8].slot)).join('\n')
    expect(planNext(parseLedger(text), [], 'spotlight:STORY', cap)).toEqual({ ok: false, reason: 'cap' })
  })

  it('refuses a third attempt on a slot', () => {
    const entries = parseLedger([line(S, 1), line(S, 2)].join('\n'))
    const results = [res(S, { styleKept: false })]
    expect(planNext(entries, results, S, cap)).toEqual({ ok: false, reason: 'max-attempts' })
  })

  it('refuses a re-run of a passed slot', () => {
    const entries = parseLedger(line(S))
    expect(planNext(entries, [res(S, { accepted: true })], S, cap)).toEqual({ ok: false, reason: 'already-passed' })
  })

  it('refuses a re-run of a slot with no verdict yet', () => {
    const entries = parseLedger(line(S))
    expect(planNext(entries, [res(S)], S, cap)).toEqual({ ok: false, reason: 'awaiting-verdict' })
  })

  it('allows one re-run of a failed slot (fallback, or rejected)', () => {
    const entries = parseLedger(line(S))
    expect(planNext(entries, [res(S, { styleKept: false })], S, cap)).toEqual({ ok: true, attempt: 2 })
    expect(planNext(entries, [res(S, { accepted: false })], S, cap)).toEqual({ ok: true, attempt: 2 })
  })

  it('allows a first run with an empty ledger', () => {
    expect(planNext([], [], S, cap)).toEqual({ ok: true, attempt: 1 })
  })

  it('prints the running total', () => {
    expect(totalLine(3, 16)).toBe('[look-check] call 3 of 16')
  })

  it('guards the base URL', () => {
    expect(checkBase('http://localhost:3002').ok).toBe(true)
    expect(checkBase('http://127.0.0.1:3002').ok).toBe(true)
    expect(checkBase('https://localhost:3002').ok).toBe(false)
    expect(checkBase('http://studio.bistecglobal.com').ok).toBe(false)
    expect(checkBase('http://localhost.evil.com').ok).toBe(false)
    expect(checkBase('not a url').ok).toBe(false)
    expect(checkBase(undefined).ok).toBe(false)
  })

  it('parses the --verdict argument', () => {
    expect(parseVerdictArg('spotlight:SQUARE=accept')).toEqual({ slot: S, accepted: true })
    expect(parseVerdictArg('spotlight:SQUARE=reject')).toEqual({ slot: S, accepted: false })
    expect(parseVerdictArg('spotlight:SQUARE=maybe')).toBeNull()
    expect(parseVerdictArg('spotlight:SQUARE')).toBeNull()
  })

  it('finds the last result per slot', () => {
    const r = [res(S, { attempt: 1 }), res('x', {}), res(S, { attempt: 2 })]
    expect(lastResult(r, S)).toMatchObject({ attempt: 2 })
    expect(lastResult(r, 'none')).toBeUndefined()
  })

  it('keeps the pure module free of fs, network and prisma imports', () => {
    const src = readFileSync('scripts/look-check/lookCheck.mjs', 'utf8').replace(/^\s*\/\/.*$/gm, '')
    expect(src).not.toMatch(/\bimport\b/)
    expect(src).not.toMatch(/fetch\(|prisma|node:fs/)
  })

  it('has no credentials in the runner source and appends the ledger before the request', () => {
    const src = readFileSync('scripts/look-check/run-look-check.mjs', 'utf8')
    expect(src).not.toMatch(/BistecStudio2026|adminBTG/)
    expect(src.indexOf('appendFileSync(ledgerPath')).toBeGreaterThan(-1)
    expect(src.indexOf('appendFileSync(ledgerPath')).toBeLessThan(src.indexOf('await generate('))
  })
})

describe('look-check pass rule (AC-16)', () => {
  const all = (key: string, over: Record<string, unknown> = {}) =>
    SLOTS.filter((s: { key: string }) => s.key === key).map((s: { slot: string }) => res(s.slot, { accepted: true, ...over }))

  it('passes a look only when every slot kept its style and is accepted', () => {
    const v = verdicts(all('spotlight'))
    expect(v.spotlight.passed).toBe(true)
    expect(Object.values(v.spotlight.slots)).toEqual(['pass', 'pass', 'pass'])
  })

  it('fails a look with a pending verdict', () => {
    const r = all('spotlight')
    r[1] = res('spotlight:PORTRAIT')
    const v = verdicts(r)
    expect(v.spotlight.passed).toBe(false)
    expect(v.spotlight.slots['spotlight:PORTRAIT']).toBe('pending')
  })

  it('fails a look with a fallback, a rejection or a slot not run', () => {
    const r = all('spotlight')
    r[0] = res('spotlight:SQUARE', { styleKept: false, accepted: true })
    expect(verdicts(r).spotlight.slots['spotlight:SQUARE']).toBe('fail')
    r[0] = res('spotlight:SQUARE', { accepted: false })
    expect(verdicts(r).spotlight.passed).toBe(false)
    expect(verdicts(r.slice(1)).spotlight.slots['spotlight:SQUARE']).toBe('not-run')
  })

  it('counts only the last result per slot (a failed re-run fails, a good re-run passes)', () => {
    const base = all('spotlight')
    const failedRerun = [...base, res('spotlight:SQUARE', { error: 'timeout', styleKept: false })]
    expect(verdicts(failedRerun).spotlight.passed).toBe(false)
    const goodRerun = [res('spotlight:SQUARE', { styleKept: false }), ...base]
    expect(verdicts(goodRerun).spotlight.passed).toBe(true)
  })

  it('judges each look on its own slots', () => {
    const v = verdicts(all('spotlight'))
    expect(v['full-bleed-scene'].passed).toBe(false)
    expect(slotPassed(res(S, { accepted: true }))).toBe(true)
    expect(slotPassed(res(S))).toBe(false)
  })
})
