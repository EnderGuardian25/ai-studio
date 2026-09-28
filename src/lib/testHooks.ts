/**
 * Test-only deterministic seams for the E2E suite (see docs/e2e-test-plan.md §3).
 *
 * Each hook is active ONLY when its matching MOCK_* env var is set to "true".
 * When unset (the production default) these helpers are never consulted and the
 * real code paths run unchanged. NEVER set these vars in production.
 *
 *   MOCK_AI         — stub copy provider + design agent (no Anthropic/OpenAI calls)
 *   MOCK_PUPPETEER  — skip Chromium, return a fixed PNG
 *   MOCK_SOCIAL     — skip the Instagram/LinkedIn HTTP calls, return a fake platformId
 *   MOCK_SOCIAL_FAIL — make the mock publishers throw (for FAILED/retry coverage)
 */

import type { ConstrainTarget, InstructionClass } from '@/lib/agent/instructionClasses'
// Type-only — erased at compile time (tsconfig isolatedModules), so this does
// not create a runtime import cycle with refineVerify.ts, which imports this
// module for MOCK_AI + the two seams below.
import type { VerifyResult } from '@/lib/drafts/refineVerify'

export const MOCK_AI = process.env.MOCK_AI === 'true'
export const MOCK_PUPPETEER = process.env.MOCK_PUPPETEER === 'true'
export const MOCK_SOCIAL = process.env.MOCK_SOCIAL === 'true'
export const MOCK_SOCIAL_FAIL = process.env.MOCK_SOCIAL_FAIL === 'true'

/** Deterministic copy text returned by the mock copy provider. */
export const MOCK_COPY_TEXT =
  'Mock copy text for E2E tests — deterministic output from the MOCK_AI seam.'

/**
 * Mock copy that embeds the brief topic. The topic flows into the caption the
 * publishers receive (Draft.copyText), so a test can steer the mock publishers'
 * success/failure per-post by placing a sentinel in the brief topic (see
 * shouldMockPublishFail). Without a sentinel the behaviour is unchanged.
 */
export function buildMockCopy(topic: string): string {
  return `${MOCK_COPY_TEXT} [${topic}]`
}

// Per-caption record so a __FAIL_ONCE__ post fails the first publish attempt and
// succeeds on retry — state lives for the life of the serve process. Backed by
// globalThis (not a plain module-scope `const`): Next.js/Turbopack can give
// different API route bundles their own instance of this module in dev mode
// (each route is compiled somewhat independently), which would silently
// split this Set across the "first attempt" route and the "retry" route and
// break the once-then-succeed contract (observed: retry.test flakiness where
// __FAIL_ONCE__ failed on both the first attempt AND the retry). A
// globalThis-backed singleton survives that split.
const mockFailedOnce: Set<string> = ((globalThis as Record<string, unknown>).__mockFailedOnce ??=
  new Set<string>()) as Set<string>

/**
 * Decide whether a mocked publish should throw. Active only when MOCK_SOCIAL is
 * set (the publishers gate on that). Precedence:
 *   - MOCK_SOCIAL_FAIL (global env)      → always fail (legacy behaviour, kept)
 *   - caption contains "__FAIL_ALWAYS__" → always fail (deterministic FAILED)
 *   - caption contains "__FAIL_ONCE__"   → fail first attempt, succeed after
 *   - otherwise                          → succeed
 * The caption must be unique per post (use a unique brief topic) for __FAIL_ONCE__.
 */
export function shouldMockPublishFail(caption: string): boolean {
  if (MOCK_SOCIAL_FAIL) return true
  if (caption.includes('__FAIL_ALWAYS__')) return true
  if (caption.includes('__FAIL_ONCE__')) {
    if (mockFailedOnce.has(caption)) return false
    mockFailedOnce.add(caption)
    return true
  }
  return false
}

// Per-prompt record so a __FAIL_GEN_ONCE__ generation fails its first attempt
// and succeeds on retry — state for the life of the serve process. Same
// globalThis-backed pattern as mockFailedOnce above, for the same reason: the
// initial generation (assemble-a/b's route) and the retry (drafts/[id]/retry's
// route) are different Next.js route files, which can end up as separate
// Turbopack dev-mode module instances of this file.
const mockGenFailedOnce: Set<string> = ((globalThis as Record<string, unknown>).__mockGenFailedOnce ??=
  new Set<string>()) as Set<string>

/**
 * Decide whether a mocked DESIGN generation should throw. Consulted only inside
 * the MOCK_AI branches of the design agents, so it is inert in production.
 * Sentinels in the brief topic (which flows into the prompt):
 *   - "__FAIL_GEN_ALWAYS__" → always fail (deterministic FAILED)
 *   - "__FAIL_GEN_ONCE__"   → fail first attempt, succeed on retry (F1 retry path)
 * The topic must be unique per draft for __FAIL_GEN_ONCE__ to isolate its state.
 * The scheduled-generation + async-generation retry/FAILED counterpart to
 * shouldMockPublishFail.
 */
export function shouldMockGenerateFail(promptContext: string): boolean {
  if (promptContext.includes('__FAIL_GEN_ALWAYS__')) return true
  if (promptContext.includes('__FAIL_GEN_ONCE__')) {
    if (mockGenFailedOnce.has(promptContext)) return false
    mockGenFailedOnce.add(promptContext)
    return true
  }
  return false
}

/**
 * Deterministic briefing-assistant chat reply (MOCK_AI). Echoes the last user
 * message and always carries a ```briefing block so tests can assert the
 * draft-extraction path end-to-end. When the user message asks to SCHEDULE a
 * series of posts (contains "schedule" or "scheme"), it instead emits a
 * ```schedule block with a small deterministic plan so F4's auto-scheduling
 * path can be asserted end-to-end.
 */
export function buildMockBriefingReply(lastUserMessage: string): string {
  const wantsSchedule = /schedul|scheme/i.test(lastUserMessage)
  if (wantsSchedule) {
    const plan = {
      posts: [
        { topic: 'Mock scheduled post 1', goal: 'awareness', tone: 'professional', daysFromNow: 1, postAction: 'HOLD' },
        { topic: 'Mock scheduled post 2', goal: 'engagement', tone: 'casual', daysFromNow: 3, postAction: 'HOLD' },
      ],
    }
    return [
      `Mock scheduling reply for E2E tests. [${lastUserMessage}]`,
      '',
      '```schedule',
      JSON.stringify(plan, null, 2),
      '```',
    ].join('\n')
  }
  return [
    `Mock briefing assistant reply for E2E tests. [${lastUserMessage}]`,
    '',
    '```briefing',
    `Mock campaign briefing draft based on: ${lastUserMessage}`,
    '```',
  ].join('\n')
}

/** Deterministic "Enhance with AI" briefing rewrite (MOCK_AI). */
export function buildMockBriefingEnhance(content: string): string {
  return `Enhanced: ${content || 'Mock briefing drafted from campaign context.'}`
}

/**
 * Deterministic brand-kit extraction reply (MOCK_AI, F5). Carries a ```brandkit
 * JSON block (voice/tone/style/fonts) so the extraction + apply path can be
 * asserted end-to-end without a live vision call. Colors are injected separately
 * from the (also-mocked) color sampler.
 */
export function buildMockBrandKitReply(lastUserMessage: string): string {
  const suggestion = {
    voice: `Mock brand voice extracted from references. [${lastUserMessage}]`,
    tone: 'confident, modern',
    style: 'Clean, high-contrast, generous whitespace.',
    fonts: ['Inter', 'Playfair Display'],
  }
  return [
    'Mock brand-kit assistant reply for E2E tests.',
    '',
    '```brandkit',
    JSON.stringify(suggestion, null, 2),
    '```',
  ].join('\n')
}

/**
 * Deterministic image→template HTML (MOCK_AI, F6). A self-contained Path A
 * template with SAMPLE content in each slot (headline / body / photo) that the
 * fill agent replaces at generation time — Path A templates use sample text,
 * not mustache tokens (see prompts/pathA.ts).
 */
export function buildMockTemplateHtml(width = 1080, height = 1080): string {
  return `<!DOCTYPE html>
<html><head><style>
body { margin:0; width:${width}px; height:${height}px; background:#0284c7; color:#fff; font-family:Inter,sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px; padding:80px; box-sizing:border-box; text-align:center; }
.photo { width:280px; height:280px; border-radius:24px; background:rgba(255,255,255,0.15); }
h1 { font-size:64px; margin:0; }
p { font-size:32px; margin:0; opacity:0.9; }
</style></head>
<body data-mock-template="true">
  <div class="photo"></div>
  <h1>Your headline here</h1>
  <p>Supporting body copy goes here.</p>
</body></html>`
}

/**
 * Deterministic Claude-token save-time validation (MOCK_AI). The real path
 * spawns a `claude -p` ping with the candidate token, which the E2E env can't
 * do (claude-html mode, no CLI). A token containing "invalid" fails; anything
 * else passes — so tests can drive both the 200 and 422 branches of
 * PUT /api/me/claude-token.
 */
export function mockClaudeTokenValidation(token: string): { ok: boolean; error?: string } {
  if (token.includes('invalid')) {
    return { ok: false, error: 'Token was rejected by Claude (mock validation)' }
  }
  return { ok: true }
}

/** Deterministic 1×1 transparent PNG returned by the mock Puppeteer renderer. */
export const MOCK_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

/**
 * Build deterministic mock design HTML. Echoes the first brand hex colour found
 * in the prompt context so tests can assert the brand kit actually flowed through
 * to the design agent (the colour reaches the agent via the brand-kit system
 * context). Falls back to a neutral colour when none is present.
 */
export function buildMockHtml(promptContext: string, width = 1080, height = 1080): string {
  const hex = promptContext.match(/#[0-9a-fA-F]{6}/)?.[0] ?? '#0f172a'
  return `<!DOCTYPE html>
<html>
<head><style>
body { margin: 0; width: ${width}px; height: ${height}px; background: ${hex}; display: flex; align-items: center; justify-content: center; }
.card { color: #ffffff; font-family: Inter, sans-serif; font-size: 48px; text-align: center; padding: 40px; }
</style></head>
<body><div class="card" data-mock="true">MOCK DESIGN</div></body>
</html>`
}

/**
 * The conflict marker the refine route's parseConflict() expects: a bare JSON
 * object emitted as the agent's text output. The MOCK_AI design agent returns
 * this when the instruction contains the literal "conflict_test", so the AGUI
 * conflict-card flow can be exercised deterministically.
 */
export function buildMockConflict(): string {
  return JSON.stringify({
    conflict: true,
    explanation: 'Mock conflict: the requested change introduces off-brand colours.',
    pendingHtml:
      '<!DOCTYPE html><html><body data-mock-override="true" style="margin:0;width:1080px;height:1080px;background:#ff00ff">OVERRIDDEN MOCK DESIGN</body></html>',
  })
}

/**
 * Deterministic reply of the refine add-verifier (MOCK_AI, change 004 T14).
 * A raw string, not a verdict object, so the mock still runs through the real
 * verdict parser. Always "applied" today; T20 extends this seam with sentinels
 * that force a miss or an unparseable (unavailable) reply.
 */
export function buildMockVerifierReply(instruction: string): string {
  return JSON.stringify({ applied: true, reason: `Mock verifier: applied. [${instruction.slice(0, 80)}]` })
}

/**
 * Deterministic verification-OUTCOME override (MOCK_AI, change 004 T20).
 * Consulted at the very top of refineVerify.verifyRefine(), before any DOM
 * extraction or model call — so it works even though, under MOCK_PUPPETEER,
 * staticDomFacts() cannot resolve `#id`/`.class` fragments or constrain
 * targets (domFacts.ts header) and structural checks would otherwise always
 * miss. Without this seam the retry and twice-failed refine branches (T17)
 * are unreachable in tests.
 *
 * Sentinels in the instruction, checked in this order (first match wins):
 *   - "__VERIFY_UNAVAILABLE__" — unavailable on every attempt. FR-10 requires
 *     the caller to route this exactly like a miss; this seam only produces
 *     the outcome, the routing is T17's.
 *   - "__VERIFY_FAIL_ALWAYS__" — miss on every attempt (the twice-failed
 *     refine path, AC-16/17).
 *   - "__VERIFY_FAIL_ONCE__"   — miss on attempt 1, pass on attempt 2 (the
 *     one-retry-succeeds path, FR-11).
 *   - "__VERIFY_PASS__"       — pass on every attempt (needed because the
 *     mock's structural checks can't be trusted to pass on their own).
 * No sentinel → null → verifyRefine runs its real logic unchanged (including
 * buildMockVerifierReply's own MOCK_AI hook for the `add` class, untouched).
 */
export function mockVerifyOutcome(instruction: string, attempt: 1 | 2): VerifyResult | null {
  if (instruction.includes('__VERIFY_UNAVAILABLE__')) {
    return { kind: 'unavailable', reason: 'mock verifier: forced unavailable (__VERIFY_UNAVAILABLE__ sentinel)' }
  }
  if (instruction.includes('__VERIFY_FAIL_ALWAYS__')) {
    return { kind: 'miss', reasons: ['mock verifier: forced miss on every attempt (__VERIFY_FAIL_ALWAYS__ sentinel)'] }
  }
  if (instruction.includes('__VERIFY_FAIL_ONCE__')) {
    return attempt === 1
      ? { kind: 'miss', reasons: ['mock verifier: forced miss on attempt 1 (__VERIFY_FAIL_ONCE__ sentinel)'] }
      : { kind: 'pass' }
  }
  if (instruction.includes('__VERIFY_PASS__')) {
    return { kind: 'pass' }
  }
  return null
}

// ── T20: deterministic refine-reply seam (change 004 Phase 2) ───────────────

const INLINE_TOKEN_RE = /__INLINE_ASSET_\d+__/
const IMAGE_ATTR_RE = /\bsrc\s*=\s*"([^"]+)"|url\(\s*['"]?([^'")]+)['"]?\s*\)/i
const MOCK_NEW_IMAGE = 'https://mock.invalid/refine-new-image.png'

/** The first `__INLINE_ASSET_n__` token, else the first `src="…"`/`url(…)` reference, in `html`. */
function findImageRef(html: string): string | null {
  const token = INLINE_TOKEN_RE.exec(html)?.[0]
  if (token) return token
  const m = IMAGE_ATTR_RE.exec(html)
  return m ? (m[1] ?? m[2] ?? null) : null
}

/** A short leading phrase of `html`'s visible text (tags/script/style/comments stripped). */
function findTextPhrase(html: string): string | null {
  const text = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return null
  const words = text.split(' ')
  return words.slice(0, Math.min(6, words.length)).join(' ')
}

/** A minimal valid (or, with `closeHtml: false`, deliberately truncated) document. */
function refineDoc(width: number, height: number, bodyInner: string, closeHtml = true): string {
  const open = `<!DOCTYPE html>\n<html>\n<head><style>body{margin:0;width:${width}px;height:${height}px}</style></head>\n<body>${bodyInner}</body>`
  return closeHtml ? `${open}\n</html>` : open
}

/** The fenced JSON header the wire format puts before the document (refineEnvelope.ts). */
function refineHeader(classes: InstructionClass[], supersedes: string[] = [], constrains: ConstrainTarget[] = []): string {
  return ['```json', JSON.stringify({ classes, supersedes, constrains }), '```'].join('\n')
}

/**
 * Deterministic refine-model REPLY (MOCK_AI, change 004 T20). Returns a raw
 * reply string in the real refine envelope wire format (refineEnvelope.ts
 * header + `REFINE_ENVELOPE_EXAMPLE` / `parseRefineEnvelope`) — never a
 * parsed object — so the real parser and `effectiveClasses` run on it
 * unchanged. T17 wires this into the runners' refine-mode MOCK_AI branch;
 * this module only builds the string.
 *
 * Default (no sentinel in the instruction): byte-identical to today's mock
 * design agent, `buildMockHtml(promptContext, width, height)`'s bare
 * document — NO envelope header at all. A bare document parses as no
 * envelope (FR-05), defaulting to the preserving `add` class, so every
 * existing refine E2E keeps passing unchanged.
 *
 * Sentinels (checked in this order; first match wins) are built from a text
 * phrase or an image URL/token taken from `slimHtml` (the current document),
 * because staticDomFacts (MOCK_PUPPETEER) resolves visible-text phrases and
 * image URLs/tokens but never `#id`/`.class` (domFacts.ts header):
 *   - "__REFINE_TRUNCATED__"        — reply has no closing `</html>` (T17's
 *     truncation rule).
 *   - "__REFINE_REDUCE_NOOP__"      — a `remove` whose reply leaves the
 *     current document's text unchanged → structural miss (the reported
 *     "reduce the text" bug, AC-08 regression).
 *   - "__REFINE_REDUCE_REAL__"      — a `remove` whose reply visibly
 *     shortens that text → pass.
 *   - "__REFINE_IMAGE_DUP__"        — a `replace` whose reply keeps the
 *     superseded image AND adds a new one → miss (the reported duplicate-
 *     background bug, AC-09 regression).
 *   - "__REFINE_IMAGE_REPLACE__"    — a `replace` whose reply drops the
 *     superseded image and adds a new one → pass.
 *   - "__REFINE_EMPTY_SUPERSEDES__" — a `replace` with `supersedes: []`
 *     (AC-10 — `effectiveClasses` downgrades this to `add` before
 *     verification).
 *   - "__REFINE_TOKEN_RENAME__"     — renames an `__INLINE_ASSET_n__` token
 *     found in `slimHtml` (AC-07 — `reconcileInlineAssets` sees an unknown
 *     token).
 *   - "__REFINE_MULTI_CLASS__"      — returns more than one class (AC-11):
 *     `replace` (a passing image swap) plus `add`.
 * The combinable modifier "__REFINE_FIX_ON_RETRY__" flips the reduce/image/
 * empty-supersedes/token-rename/truncated sentinels above to their FIXED
 * variant when `attempt` is 2 — the retry-succeeds path (FR-11). It has no
 * effect alone, and no effect on multi-class (which has no broken/fixed pair).
 *
 * Every case degrades deterministically when `slimHtml` doesn't carry what it
 * needs: the reduce cases fall back to `supersedes: []` when there is no
 * visible text, and the image/token cases fall back to a synthetic reference
 * that will not resolve in the current document — either way verification
 * always misses (a downgrade or a fragment not found), never a crash and
 * never a silent pass. T21 arranges a before-document that has one when the
 * passing variant is required.
 *
 * Deterministic: no randomness, no Date.now().
 */
export function buildMockRefineReply(args: {
  slimHtml: string
  instruction: string
  attempt: 1 | 2
  width: number
  height: number
  // Extra context (e.g. the brand-kit system context) for the default
  // reply's hex echo — see buildMockHtml. Optional; omitted → the neutral
  // fallback colour.
  promptContext?: string
}): string {
  const { slimHtml, instruction, attempt, width, height, promptContext } = args
  const fixOnRetry = instruction.includes('__REFINE_FIX_ON_RETRY__') && attempt === 2

  if (instruction.includes('__REFINE_TRUNCATED__')) {
    return `${refineHeader(['add'])}\n${refineDoc(width, height, 'Mock truncated refine reply.', fixOnRetry)}`
  }

  if (instruction.includes('__REFINE_REDUCE_NOOP__') || instruction.includes('__REFINE_REDUCE_REAL__')) {
    const wantsReal = instruction.includes('__REFINE_REDUCE_REAL__') || fixOnRetry
    const phrase = findTextPhrase(slimHtml)
    const supersedes = phrase ? [phrase] : []
    if (!wantsReal) {
      // No-op: echo the current document unchanged — the named passage stays intact.
      return `${refineHeader(['remove'], supersedes)}\n${slimHtml}`
    }
    return `${refineHeader(['remove'], supersedes)}\n${refineDoc(width, height, 'Shortened.')}`
  }

  if (instruction.includes('__REFINE_IMAGE_DUP__') || instruction.includes('__REFINE_IMAGE_REPLACE__')) {
    const wantsClean = instruction.includes('__REFINE_IMAGE_REPLACE__') || fixOnRetry
    const ref = findImageRef(slimHtml) ?? MOCK_NEW_IMAGE // degrade: never resolves in the current document
    const supersedes = [ref]
    const body = wantsClean
      ? `<div style="background-image:url('${MOCK_NEW_IMAGE}')"></div>`
      : `<div style="background-image:url('${ref}')"></div><div style="background-image:url('${MOCK_NEW_IMAGE}')"></div>`
    return `${refineHeader(['replace'], supersedes)}\n${refineDoc(width, height, body)}`
  }

  if (instruction.includes('__REFINE_EMPTY_SUPERSEDES__')) {
    const named = fixOnRetry
    const ref = findImageRef(slimHtml) ?? findTextPhrase(slimHtml) ?? MOCK_NEW_IMAGE
    const supersedes = named ? [ref] : []
    return `${refineHeader(['replace'], supersedes)}\n${refineDoc(width, height, 'Mock empty-supersedes refine reply.')}`
  }

  if (instruction.includes('__REFINE_TOKEN_RENAME__')) {
    const token = INLINE_TOKEN_RE.exec(slimHtml)?.[0]
    if (!token) return buildMockHtml(promptContext ?? '', width, height) // degrade: nothing to rename
    const renamed = fixOnRetry ? token : `${token.slice(0, -2)}_RENAMED__`
    return `${refineHeader(['add'])}\n${slimHtml.replace(token, renamed)}`
  }

  if (instruction.includes('__REFINE_MULTI_CLASS__')) {
    const ref = findImageRef(slimHtml) ?? MOCK_NEW_IMAGE
    const body = `<div style="background-image:url('${MOCK_NEW_IMAGE}')"></div>`
    return `${refineHeader(['replace', 'add'], [ref])}\n${refineDoc(width, height, body)}`
  }

  // Default: byte-identical to today's mock design agent — no envelope header.
  return buildMockHtml(promptContext ?? '', width, height)
}
