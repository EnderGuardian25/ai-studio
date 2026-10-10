# Learnings: brief-draft-recovery

Build learnings, spec gaps, and patterns discovered.

**Categories:** spec_gap | design_gap | pattern | best_practice | agent_issue

---

## [L1] design_gap — Files src/lib/brief/briefDraftPayload.ts (client-safe sch...

**When:** 2026-07-13 13:08 UTC
**Category:** design_gap
**Priority:** low
**Status:** pending

### Detail

Files src/lib/brief/briefDraftPayload.ts (client-safe schema split) and src/components/ui/StatusChip.tsx (unfinished variant) were modified but not declared in tasks

### Action

Declare shared-UI/type files when a task adds a new visual status or a client/server module split

---

## [L2] pattern — Unauthenticated API asserts must use maxRedirects:0 — the...

**When:** 2026-07-13 13:08 UTC
**Category:** pattern
**Priority:** low
**Status:** pending

### Detail

Unauthenticated API asserts must use maxRedirects:0 — the auth proxy redirects /api/* to /login before withAuth can 401 (same as TC-AUTH-07)

### Action

Reuse the TC-AUTH-07 redirect assertion pattern for new routes

---

## [L3] design_gap — T1 declared src/lib/agent/pathB.ts but the data-URI filte...

**When:** 2026-07-17 09:36 UTC
**Category:** design_gap
**Priority:** medium
**Status:** pending

### Detail

T1 declared src/lib/agent/pathB.ts but the data-URI filter belongs in prompts/pathB.ts (the single join-point, unit-testable without DB) — file declaration was one layer off

### Action

When declaring files for prompt-level guards, point at the prompt builder, not the orchestrator

---

## [L4] design_gap — Converting sync routes to 202 broke existing E2E suites (...

**When:** 2026-07-17 09:36 UTC
**Category:** design_gap
**Priority:** medium
**Status:** pending

### Detail

Converting sync routes to 202 broke existing E2E suites (agui-refinement, TC-REG-H7a) not listed in task files — contract-change blast radius on tests was underdeclared

### Action

When a task changes an API contract, enumerate every test suite asserting the old contract in the task's file list

---

## [L5] best_practice — .env.test lost BISTEC_API_KEYS during the MinIO credentia...

**When:** 2026-07-17 09:36 UTC
**Category:** best_practice
**Priority:** low
**Status:** pending

### Detail

.env.test lost BISTEC_API_KEYS during the MinIO credential rotation, silently skipping 3 ACP-auth E2E cases

### Action

After rotating credentials in .env, diff .env.test against the CI workflow env to catch dropped keys

---

## [L6] design_gap — Files modified outside task declarations: briefs/route.ts...

**When:** 2026-10-02 02:54 UTC
**Category:** design_gap
**Priority:** low
**Status:** pending

### Detail

Files modified outside task declarations: briefs/route.ts + providers/available/route.ts (T1-review items carried to T3), claudeAuth.ts + .env.example (T4-review follow-ups in T6), designAgent.ts (T7 aspect threading), tests/e2e/path-a.test.ts (TC-GEN-05 stub lived there), team-image-default.test.ts (T3 suite), docs/e2e-test-plan.md (catalog). All controller-ruled.

### Action

When a review carries items forward, add the files to the receiving task's Files list in tasks.md at the same time

---

## [L7] spec_gap — Spec edge case 'base64 images count against the 600k prom...

**When:** 2026-10-02 02:54 UTC
**Category:** spec_gap
**Priority:** medium
**Status:** pending

### Detail

Spec edge case 'base64 images count against the 600k prompt guard' caused a regression: ordinary 1-2 MB reference images were refused in CLI vision. Images cost by pixels, not base64 length.

### Action

Size guards for multimodal payloads: text-only char limit + separate per-image and total byte caps; test with a realistic image size

---

## [L8] best_practice — Auth-failure classification must never read model-written...

**When:** 2026-10-02 02:54 UTC
**Category:** best_practice
**Priority:** high
**Status:** pending

### Detail

Auth-failure classification must never read model-written text: in stream-json mode the no-result branch fed assistant text into isClaudeAuthFailure and coerced exit 0 to null, so a '401' in a reply (e.g. a phone number on a reference image) would mark a good personal token INVALID. Fixed by classifying on structured api_error_status (401, or 403 + CLI-written 'OAuth token revoked' text) only.

### Action

Any classifier that changes account state must read only CLI/system-authored fields; add regression cases with hostile model text

---

## [L9] agent_issue — Two controller rulings were wrong and caught only by the ...

**When:** 2026-10-02 02:54 UTC
**Category:** agent_issue
**Priority:** medium
**Status:** pending

### Detail

Two controller rulings were wrong and caught only by the next review: FR-02/FR-03 default rules applied to COPY (CLI-mode copy could switch providers); refine 'resolves first' rippled into writers/tests. Reviews after each fix round paid for themselves.

### Action

Scope every behavioural ruling to the slot/path it was written for, and ask the reviewer to check rulings for ripple effects

---

## [L10] best_practice — Anthropic now recommends the native installer (irm https:...

**When:** 2026-10-02 02:54 UTC
**Category:** best_practice
**Priority:** low
**Status:** pending

### Detail

Anthropic now recommends the native installer (irm https://claude.ai/install.ps1 | iex; curl -fsSL https://claude.ai/install.sh | bash) over winget; winget-cli#6200 is still open with no workaround.

### Action

Verify install commands against the vendor's current page at build time rather than trusting the proposal

---

## [L11] best_practice — AC-16 needed a real OAuth token, so T6 sat in_progress fo...

**When:** 2026-10-06 15:50 UTC
**Category:** best_practice
**Priority:** medium
**Status:** pending

### Detail

AC-16 needed a real OAuth token, so T6 sat in_progress for days; the auto-mode classifier also blocks Claude from writing a token to an env file and running docker with it

### Action

Plan secret-gated ACs as explicit operator steps with a ready-to-paste '! ...' command that writes a temp env file, runs the check and deletes it

---

## [L12] design_gap — T5 needed AppShell.tsx (sidebar class) to meet its own AC...

**When:** 2026-10-07 15:40 UTC
**Category:** design_gap
**Priority:** low
**Status:** pending

### Detail

T5 needed AppShell.tsx (sidebar class) to meet its own AC-09: the sidebar used in-flow .glass-panel, which the source fix deliberately left translucent

### Action

When an AC covers a surface, check which class that surface uses before assigning the file list

---

## [L13] pattern — Screen tasks each copied the Folio class strings into a l...

**When:** 2026-10-08 00:39 UTC
**Category:** pattern
**Priority:** medium
**Status:** pending

### Detail

Screen tasks each copied the Folio class strings into a local folio.ts (8 copies) to stay inside their file lists

### Action

Plan a shared heading/section primitive in the token-foundation wave of future UI changes, not in cleanup

---

## [L14] design_gap — FR-12 (freeze accessible names and roles) prevented fixin...

**When:** 2026-10-08 00:39 UTC
**Category:** design_gap
**Priority:** medium
**Status:** pending

### Detail

FR-12 (freeze accessible names and roles) prevented fixing real a11y naming gaps found during the restyle (placeholder-named inputs, unnamed tablists, login h1)

### Action

Pair a 'preserve names' rule with an explicit naming-fix task, or allow additive labels only where tests are updated

---

## [L15] pattern — sr-only (absolutely positioned) cells inside an overflow-...

**When:** 2026-10-08 00:39 UTC
**Category:** pattern
**Priority:** high
**Status:** pending

### Detail

sr-only (absolutely positioned) cells inside an overflow-x-auto container widen the page unless the container is relative (found in T10, recurred in T12)

### Action

Default scroll containers to relative; the AC-12 375px no-horizontal-scroll check catches it

---

## [L16] design_gap — File .gitignore modified but not declared in any task: sp...

**When:** 2026-10-09 17:20 UTC
**Category:** design_gap
**Priority:** low
**Status:** pending

### Detail

File .gitignore modified but not declared in any task: specclaw-build setup's .lock/meta.json was swept into the plan commit, so .specclaw/changes/*/.lock/ was added to .gitignore (4b04e6cb)

### Action

Ignore .lock/ dirs from specclaw init onward

---

## [L17] best_practice — Enable Actions BEFORE pushing: a push made while Actions ...

**When:** 2026-10-09 17:20 UTC
**Category:** best_practice
**Priority:** medium
**Status:** pending

### Detail

Enable Actions BEFORE pushing: a push made while Actions are disabled triggers no run

### Action

Order: gh api enable, then git push

---

## [L18] design_gap — T10: COMPACT_FIELD also styled a textarea (BrandKitAssist...

**When:** 2026-10-09 22:15 UTC
**Category:** design_gap
**Priority:** low
**Status:** pending

### Detail

T10: COMPACT_FIELD also styled a textarea (BrandKitAssistantPanel 'Brand voice'), which the spec missed; split into COMPACT_FIELD (h-control-sm) + COMPACT_TEXTAREA

### Action

When a shared class gains a fixed height, grep every consumer for <textarea>

---

## [L19] agent_issue — A finished gate agent restarted a detached :3001 next dev...

**When:** 2026-10-10 22:48 UTC
**Category:** agent_issue
**Priority:** medium
**Status:** pending

### Detail

A finished gate agent restarted a detached :3001 next dev minutes later (after its background task died), which collided with the next gate's clean server

### Action

Gate agents must not restart servers after hand-back; the next gate checks for exactly one :3001 listener before E2E

---
