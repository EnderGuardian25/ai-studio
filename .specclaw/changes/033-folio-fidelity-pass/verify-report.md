# Verify report: 033 Folio fidelity pass

**Change:** 033-folio-fidelity-pass
**HEAD:** `bbf99c51` (= `origin/v2`)
**Date:** 2026-10-27

**Verdict:** PASS

All 17 acceptance criteria are MET. AC-17 rests on the user's approval as recorded by the orchestrator (the user's own action, not reproducible by this agent). Notes on the flaky local E2E and the still-running CI run are below.

## Acceptance criteria

| AC    | Status | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-01 | MET    | `node scripts/check-ui-invariants.mjs` exit 0 ("ok: no unpermitted attribute difference"; unused-permit warnings only). `tests/unit/uiInvariants.test.ts` passes (3 guard files, 86 tests). Failing cases exist at lines 47 (dropped `data-testid`), 52 (changed `aria-label`), 58 (removed `onClick`), 63 (added `role`), 68 (permit cites unknown row), 86 (permit on a non-approved row). Passing cases at 105 (element moved between two files) and 111 (permitted removal).                                                                                                                                                                                                                                                                                   |
| AC-02 | MET    | `--coverage` exit 0: "47 of 47 audit-set files have a row".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| AC-03 | MET    | `scripts/capture-ui.mjs` has a `states` pass (brief-steps, kit-detail-script-fonts, kit-assistant-drawer, briefing-drawer, rule-review-panel, insights, notices). `ui-captures/033/` holds 126 PNGs: every state has 4 files (light/dark x 1440/375), including `brief-step1..4`, `kit-detail`, both drawers (+ reply/proposal), `rule-review-panel`, `insights`, and `draft-notice-{facts-flagged,headline-stale,headline-unconfirmed,image-style-fallback}`; `index.md` lists them.                                                                                                                                                                                                                                                                              |
| AC-04 | MET    | `git grep -n 'className="hidden"' -- src/components/layout/AppShell.tsx` returns 0 lines. A-039 closed `6317a4e0`. `shell-sidebar-open` capture exists (text-only nav stated in T11 index).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| AC-05 | MET    | `tests/e2e/surfaces.test.ts:1002` and `:1142` have `toHaveText('Send')` directly after the two `getByRole('button', { name: 'Send' })` checks. `aria-label="Send"` present at `BrandKitAssistantPanel.tsx:506` and `BriefingAssistantPanel.tsx:505`; `git diff c45ed3dc HEAD -- src` shows no change to any `aria-label="Send"` line.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| AC-06 | MET    | `drafts/[id]/page.tsx:92` `CROP` is byte-identical to `9f829456` line 68; the four spans (486-489) carry the same class strings as `9f829456` 320-323 (placement moved into the Preview section). A-001 closed `6317a4e0`; no `hidden sm:block` left on them (T7's A-005 plate `p-10` at every width removed T3's below-`sm` hiding). Draft captures exist in both themes. Crop marks are small at downscaled view (T3 report admits only one corner clearly seen); the source equality is the primary evidence.                                                                                                                                                                                                                                                   |
| AC-07 | MET    | `audit.md`: 72 rows, every row has a class and a status (class counts: look 26, behaviour 9, ambiguous 3, none 34 at T4). Behaviour rows cite changes (e.g. A-013 cites 026 spec lines); ambiguous rows A-002, A-003, A-025 state their question and cite sources. T4 review F1 (A-061) was fixed (moved to look).                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| AC-08 | MET    | W1 gate green (`reports/T5.md`); T5 push; CI run 40513095569 on the T5 push: success. `origin/v2` equalled the W1 tip at that push.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| AC-09 | MET    | `git log` order: `9d10ceb8` "T5 - the user approves audit.md (2026-10-27)" precedes `56ea0b6e` (T6, first W2 commit). `audit.md` header: "Approved by the user: 2026-10-27", rulings A-002 (a), A-003 (a), A-025 (a); statuses now A-002 `behaviour`, A-003 `closed 2d433d35`, A-025 `behaviour`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| AC-10 | MET    | `git diff --stat c45ed3dc HEAD -- src/components/ui/ src/components/atoms.ts` is empty (T6 added nothing). `uiTokenGuard.test.ts` passes. DESIGN_SYSTEM.md §8.18 unchanged by additions (nothing to name).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| AC-11 | MET    | Status counts: closed 27 (`6317a4e0` x4, `2d433d35` x12, `6bad9e55` x5, `c7cd6c9c` x5, `4edf0394` x1), behaviour 11, none 34 (`—`). Zero rows `approved`/`open`/`proposed`. All five SHAs resolve to real commits (`git cat-file -t` = commit). No `cut` rows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| AC-12 | MET    | The 12 components (audit G1 to G4 sections): CompositionNotice, FactsCheckNotice, HeadlineImageNotice (§8.20/8.21), PostStylePicker (§8.22; the image look picker is in SizeDesignStep, §8.23), ScriptFontPicker (§8.25), RuleReviewPanel (§8.24), CaptionRouteCard (§8.26), insights page, InsightSection, DataTable, RateBar, sections.tsx (§8.27). Each has a capture (list above). DESIGN_SYSTEM.md §8.20-§8.27 name files/dirs and primitives (`Notice`, `SectionHead`, `BLOCK`, `TABLE_HEAD_ROW`, `SMALL_CAPS`, `EYEBROW`). `grep rounded-full\|rounded-ui` over the new components finds only `RateBar` (the named 64x6 track, §8.27) and an unrelated `ApiKeysCard` code box (not one of the 12). The "Beta" mark is a box-less small-caps word per §8.21. |
| AC-13 | MET    | `check-ui-invariants.mjs` exit 0 at HEAD. Permits consumed are on closed rows. Unused-permit warnings (A-039, A-041, A-056, A-065) are the check's cross-file netting artefact (see notes); T7/T9/T10 reviews verified per-file counts match the row permits.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| AC-14 | MET    | `git diff --name-only c45ed3dc HEAD -- src/lib src/app/api src/providers src/scheduler src/mcp src/scripts prisma` outputs 0 lines. `node scripts/check-folio-restore.mjs` -> "all restored files match".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| AC-15 | MET    | `git diff c45ed3dc HEAD -- tests/e2e` changes exactly two added lines (the `toHaveText('Send')` assertions, T3) and deletes no `test(`. No test adapted in W2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| AC-16 | MET    | Local final gate (`reports/T11.md`): tsc 0, lint 0 errors/7 warnings, unit 4609, render 154, test:upgrade ALL PASS, restore + invariants + coverage exit 0, build exit 0, E2E 597 passed + 1 flaky / 3 skipped / 0 failed. `docs/ui-reference/screen-light.png` and `screen-dark.png` changed in `5bba64d8`. `origin/v2` = HEAD = `bbf99c51`. CI run 40529119545 on `5bba64d8`: success, E2E "598 passed / 3 skipped", render 154, unit 4609 (confirmed in the run log). Judged as below.                                                                                                                                                                                                                                                                          |
| AC-17 | MET    | `reports/T11.md` line 35: "the user approved the final captures ... on 2026-10-27". That edit is uncommitted in the working tree and the approval is a user action recorded by the orchestrator; I could not independently observe it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## NFR-03 judgement (flaky local E2E)

NFR-03's floor is at least 598 passed / 3 skipped / 0 failed. The local run was 597 passed + 1 flaky (TC-AP-09, `apiRequestContext.get: read ECONNRESET` on `GET /api/test/analytics-events`; passed on retry), which by itself reads 597 + 1. I judged it satisfied on the strength of CI run 40529119545: the same `src` tree (`git diff --stat 5bba64d8 bbf99c51` touches only `.specclaw/` docs and reports), a clean 598 passed / 3 skipped with no failed or flaky, run in `next dev` as the plan intends. The flake is infrastructure: W2 changed no route, seam or test (NFR-01 diff empty; `tests/e2e` unchanged since T3), and 032's gate had the same shape. CI run 40533199662 on `bbf99c51` was still `in_progress` (12m20s) when I last looked; it is a docs-only commit and I did not wait on it. This verdict does not depend on it.

## NFR-01 to NFR-06

- NFR-01: MET. The NFR-01 diff is empty at HEAD (0 files).
- NFR-02: MET. Every state was captured in light and dark at 1440 and 375 (126 PNGs). The axe E2E suite passed in CI (598) and locally.
- NFR-03: MET (judged above). Other rows: tsc/lint (0 errors, 7 warnings = baseline)/unit 4609 (>=4581)/render 154 (>=154)/upgrade/restore/invariants/coverage/build all pass at the final gate and again at `bbf99c51` (specclaw collect logs: lint, build, unit).
- NFR-04: Not independently checked here (cost target, party-po); work stayed in the planned 11 tasks with no extra waves.
- NFR-05: MET. One task at a time, implementer + `specclaw:code-reviewer` for T1-T4, T7-T10, tsc/lint/unit by the orchestrator, commits straight to `v2`, pushes in T5 and T11 with CI checked after each.
- NFR-06: MET. `uiWordingGuard.test.ts` passes (86 tests across the three guards); text changed only for the Send word (FR-04) and rows citing it; A-025 kept "New post" by ruling.

## Per-task review verdicts

- T1 - WARN (resolved; permit-cell and status-match findings fixed in "Review fixes" of `reports/T1.md`)
- T2 - WARN (resolved; reference-shot determinism noted, other items style)
- T3 - NOTE (crop marks hid below `sm`; later superseded by A-005 plate `p-10` at all widths)
- T4 - WARN (resolved; A-061 moved to look in the orchestrator follow-up)
- T5 - orchestrator task, no implementer review (W1 gate, scan, push, checkpoint)
- T6 - orchestrator task, no implementer review (no primitives needed)
- T7 - NOTE
- T8 - NOTE
- T9 - NOTE
- T10 - NOTE
- T11 - orchestrator task, no implementer review (final gate, screenshots, docs, push)

## Known limits and notes

- **The invariant check nets each key over the whole scope,** so a removal permit in one file cannot match while another file adds the same key. It prints "unused permit" warnings for A-039, A-041, A-056, A-065 and exits 0. Per-file counts were checked by the T7, T9 and T10 reviews. The same netting means a dropped attribute in one file can be masked by an equal addition in another; this is the design (elements may move between files) and is bounded by the permits.
- **A-053 (briefing plan-row select) and A-060 (font listbox hints)** are not visible in any capture (the capture script has no state for them). They are covered by E2E (`briefing-upgrade`, `post-fonts`), which passed in CI.
- **The crop marks at 375 px** were not clearly legible in the agent's downscaled view (T3 report); source equality with `9f829456` is the evidence for AC-06.
- **W1 push-scan slip:** `reports/pre-push-scan.md` records that the W1 push did not pause to read the one scan hit (`COOLIFY_API_TOKEN`, a name inside the scan's own pattern, not a value). It was reviewed right after, found harmless, and the W2 push waited for the scan output.
- AC-17's record in `reports/T11.md` and `timeline.jsonl`, and the `logs/` directory, are uncommitted in the working tree at the time of this report.
- `design.md` §2.1 group headings: the T1 review found G2 (17) and G4 (7) disagreeing with the lists (16 and 8). They were corrected in the T1 commit `82f7b042`, and the total of 47 always matched.

## CI on the final tip

CI run 40533199662 on `bbf99c51` (`origin/v2`) completed after the agent's pass: **success** in 23m2s, with E2E 598 passed / 3 skipped / 0 failed / 0 flaky (orchestrator, from `gh run view 40533199662 --log`). Every commit since then is a docs or report commit.

## Verification

Command: `git diff --name-only c45ed3dc HEAD -- src/lib src/app/api src/providers src/scheduler src/mcp src/scripts prisma | wc -l`
Exit: 0
Output (tail):

```
0
```

Command: `git grep -n 'className="hidden"' -- src/components/layout/AppShell.tsx | wc -l`
Exit: 0
Output (tail):

```
0
```

Command: `git diff c45ed3dc HEAD -- tests/e2e | grep -E '^-.*\btest\(' | wc -l`
Exit: 0
Output (tail):

```
0
```

Command: `git diff --stat c45ed3dc HEAD -- src/components/ui/ src/components/atoms.ts`
Exit: 0
Output (tail):

```
(empty)
```

Command: `node scripts/check-ui-invariants.mjs`
Exit: 0
Output (tail):

```
warning: unused permit: A-065 +src/app/(app)/team/page.tsx:...ICON_SM
warning: unused permit: A-065 +src/app/(app)/team/page.tsx:aria-hidden=true
ok: no unpermitted attribute difference
```

Command: `node scripts/check-ui-invariants.mjs --coverage`
Exit: 0
Output (tail):

```
ui invariants: c45ed3dc (98 files) vs working tree (98 files); 72 audit rows
coverage: 47 of 47 audit-set files have a row
```

Command: `node scripts/check-folio-restore.mjs`
Exit: 0
Output (tail):

```
all restored files match
```

Command: `npx vitest run tests/unit/uiInvariants.test.ts tests/unit/uiTokenGuard.test.ts tests/unit/uiWordingGuard.test.ts`
Exit: 0
Output (tail):

```
 Test Files  3 passed (3)
      Tests  86 passed (86)
```

Command: `gh run view 40529119545 --log | grep -E "[0-9]+ (passed|skipped)"`
Exit: 0
Output (tail):

```
Tests 4609 passed (4609)   [unit]
3 skipped                  [e2e]
598 passed (22.2m)         [e2e]
Tests 154 passed (154)     [render]
```

Command: `git rev-parse origin/v2 HEAD`
Exit: 0
Output (tail):

```
bbf99c515c31d6fc23a8cf9befc83c96529d03a5
bbf99c515c31d6fc23a8cf9befc83c96529d03a5
```

Command: `gh run list --branch v2 --limit 1`
Exit: 0
Output (tail):

```
in_progress  specclaw(033-folio-fidelity-pass): record the T11 CI run ...  E2E (security-fix regression gate)  v2  push  40533199662  12m20s
```
