// 028 real-image check: the pure logic (no fs, no network, no prisma).
// The I/O lives in run-look-check.mjs. Design: .specclaw/changes/028-image-looks/design.md section 9.

export const SLOTS = [
  { slot: 'product-showcase:STORY', key: 'product-showcase', size: 'STORY', postStyle: 'launch' },
  { slot: 'editorial-split:STORY', key: 'editorial-split', size: 'STORY', postStyle: 'announcement' },
  { slot: 'full-bleed-scene:SQUARE', key: 'full-bleed-scene', size: 'SQUARE', postStyle: 'event' },
  { slot: 'full-bleed-scene:PORTRAIT', key: 'full-bleed-scene', size: 'PORTRAIT', postStyle: 'hiring' },
  { slot: 'full-bleed-scene:STORY', key: 'full-bleed-scene', size: 'STORY', postStyle: 'event' },
  { slot: 'spotlight:SQUARE', key: 'spotlight', size: 'SQUARE', postStyle: 'promotion' },
  { slot: 'spotlight:PORTRAIT', key: 'spotlight', size: 'PORTRAIT', postStyle: 'milestone' },
  { slot: 'spotlight:STORY', key: 'spotlight', size: 'STORY', postStyle: 'promotion' },
]

export const MAX_ATTEMPTS_PER_SLOT = 2

// The hard cap on image calls: computed, never typed.
export function capFor(slots) {
  return MAX_ATTEMPTS_PER_SLOT * slots.length
}

// JSONL to entries. A malformed line is an attempt too: it is kept as
// { malformed: true, slot } (slot read from the raw text when it can be) and
// counted in the total, never dropped.
export function parseLedger(text) {
  const entries = []
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    try {
      const v = JSON.parse(line)
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        entries.push(v)
        continue
      }
    } catch {
      // fall through to the malformed entry
    }
    const m = /"slot"\s*:\s*"([^"]+)"/.exec(line)
    entries.push({ malformed: true, slot: m ? m[1] : null })
  }
  return entries
}

export function attemptsFor(entries, slot) {
  return entries.filter((e) => e && e.slot === slot).length
}

export function lastResult(results, slot) {
  let found
  for (const r of results ?? []) if (r && r.slot === slot) found = r
  return found
}

export function slotPassed(result) {
  return result?.styleKept === true && result?.accepted === true
}

export function planNext(entries, results, slot, cap) {
  if (entries.length >= cap) return { ok: false, reason: 'cap' }
  const attempts = attemptsFor(entries, slot)
  if (attempts >= MAX_ATTEMPTS_PER_SLOT) return { ok: false, reason: 'max-attempts' }
  const last = lastResult(results, slot)
  if (slotPassed(last)) return { ok: false, reason: 'already-passed' }
  if (last && last.styleKept === true && (last.accepted === null || last.accepted === undefined)) {
    return { ok: false, reason: 'awaiting-verdict' }
  }
  return { ok: true, attempt: attempts + 1 }
}

function slotStatus(result) {
  if (!result) return 'not-run'
  if (slotPassed(result)) return 'pass'
  if (result.styleKept === true && (result.accepted === null || result.accepted === undefined)) return 'pending'
  return 'fail'
}

// A look passes only when every one of its slots is 'pass' (the last result per slot counts).
export function lookVerdicts(results, slots = SLOTS) {
  const out = {}
  for (const s of slots) {
    const status = slotStatus(lastResult(results, s.slot))
    const entry = (out[s.key] ??= { passed: true, slots: {} })
    entry.slots[s.slot] = status
    if (status !== 'pass') entry.passed = false
  }
  return out
}

export function totalLine(n, cap) {
  return `[look-check] call ${n} of ${cap}`
}

export function checkBase(url) {
  let u
  try {
    u = new URL(String(url))
  } catch {
    return { ok: false, error: '--base is not a valid URL' }
  }
  if (u.protocol !== 'http:') return { ok: false, error: '--base must use http' }
  if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
    return { ok: false, error: '--base must be http://localhost or http://127.0.0.1' }
  }
  return { ok: true }
}

// "spotlight:SQUARE=accept" -> { slot, accepted: true }; null when malformed.
export function parseVerdictArg(s) {
  const m = /^(.+)=(accept|reject)$/.exec(String(s ?? ''))
  if (!m) return null
  return { slot: m[1], accepted: m[2] === 'accept' }
}
