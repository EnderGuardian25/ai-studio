# Verify Report: 028-image-looks

**Verified:** 2026-10-25 · **Model:** Sonnet · **HEAD:** `b3ca405` (code at `1639b1e`; T1 to T6, final fixes)
**Verdict:** PASS (19/19 ACs; AC-20 and AC-21 deferred on OP-028, excluded from the count)

I read spec.md's ACs, the T1 to T6 and final-fixes reports, and the reviews. I re-ran the focused unit set (10 files, 460/460 pass: lookDataset, lookCheck, lookFixtureCompleteness, heroSeams, compositionNotice, heroPrompts, refinePrompt, designData, postStylesResolve, uiTokenGuard) and the NFR-01 and hard-rule git checks. E2E, build, render and `test:upgrade` figures are the orchestrator's; I did not run them.

## Gates

| Gate                | Result                                                       |
| ------------------- | ------------------------------------------------------------ |
| tsc                 | clean                                                        |
| lint                | 0 errors / 7 warnings (baseline 7)                           |
| unit                | 3894/3894 (155 files; floor 3737)                            |
| render              | 84/84 (floor 83)                                             |
| build               | pass                                                         |
| `test:upgrade`      | ALL PASS                                                     |
| full clean mock E2E | 529 passed / 3 skipped / 0 failed / 0 flaky (floor 517 + AF) |
| CI                  | green on `v2` at `1639b1e` (run 40128829845)                 |

## Acceptance Criteria

- ✅ **AC-01 dataset.** `lookDataset.test.ts` and `designData.test.ts` (in the 460): four active looks, `current` 2, 2, 1, 1, v2 SQUARE and PORTRAIT deep-equal v1, v1 hashes unchanged, a hash per (key, version), no `variantOf` shipped. Spotlight's PORTRAIT subject was tuned before release (final fix I-1, hash updated, spec row noted).
- ✅ **AC-02 validation.** `lookDataset.test.ts`: real dataset gives `[]`, one fixture per FR-03 rule, a valid `-light` variant passes. The module-load assertion is now a behavioural test (mocked bad record key throws under test, resolves in production).
- ✅ **AC-03 key rule.** `composition.ts:8` header "THE LOOK KEY RULE"; committed key-list subset, post-style defaults naming dataset keys or classic, retired-classic (explicit and post-style default), `IMAGE_STYLES` omits a retired look while `contractAt` and `styleLabel` resolve it (final fix I-3).
- ✅ **AC-04 resolver.** `postStylesResolve.test.ts`: the `it.each` over 6 surfaces x 4 looks x 3 sizes (final fix I-2), Launch and Announcement at STORY, unattended `unattended-classic`, Path A `path-a-classic`, SQUARE-only fixture gives `size-classic`.
- ✅ **AC-05 STORY literals.** `styleAfterSizeChange` and resume cases in `postStylesWizard.test.ts`; T2 report's grep lists no leftover STORY literal; final review re-checked. `git grep STORY -- src` shows only kept lines.
- ✅ **AC-06 prompts.** `heroPrompts.test.ts` goldens for the 8 new contracts (Spotlight names headline and CTA-and-logo bands), v1 and classic goldens unchanged.
- ✅ **AC-07 fixtures discriminate.** `npm run test:render` 84/84 (47 + 36 + 1 guard); T3 measured pass sd about 0.018 against busy 0.49, contrast pass fraction 0.000.
- ✅ **AC-08 completeness and tone.** `lookFixtureCompleteness.test.ts` (4 cases) against a literal backdrop table; an added-size fixture fails the check.
- ✅ **AC-09 mock layout box.** `heroSeams.test.ts` every-(key, version, size) case and the Spotlight two-sample case.
- ✅ **AC-10 pipeline, mock.** E2E §AF TC-LOOK-01 to 06 pass (inside the 529). Deviation judged: the "one image call, also on fallback" case lives in `heroSeams.test.ts`, not `background.test.ts`, because `background.test.ts` has no hero harness (T1 report). Substance met: it is the same `background.ts` step, exercised for pass and fallback; the E2E fallback cases (TC-LOOK-05, 06) also reuse the hero image.
- ✅ **AC-11 notice.** `compositionNotice.test.ts` (kept look with `layout-violation`, a `busy` fallback names the look); TC-LOOK-07, 08.
- ✅ **AC-12 wizard.** TC-LOOK-09 and 10 (five cards enabled at 9:16, Launch pre-fill with hint, Spotlight sends `imageStyle: 'spotlight'`, Review row, resume, axe). T4 screenshots at 390 and 1440, light and dark, in `ui-captures/028`.
- ✅ **AC-13 unattended unchanged.** TC-LOOK-11 (queue entry `launch` at STORY through the generation tick stores classic and a classic stamp). Hard-rule diff re-run: empty.
- ✅ **AC-14 old drafts.** TC-LOOK-12 (v1 stamp carried by refine with no warning, regenerate records v2, restore copies v1); `refinePrompt.test.ts` v1 stamp gives v1 regions.
- ✅ **AC-15 runner logic.** `lookCheck.test.ts` (21 cases): cap 16, ledger counting, `planNext` refusals, localhost guard, `--verdict`.
- ✅ **AC-16 pass rule.** `lookCheck.test.ts` `lookVerdicts` cases (last result per slot counts).
- ✅ **AC-17 nothing extra.** `git grep -c` re-run: createMessage 21, runClaudeCli 27, recordModelCall 29, generateImage 17, equal to `4053cfe`. Hard-rule diff empty. T5 report: runner used only with `--dry-run`.
- ✅ **AC-18 design system.** `uiTokenGuard.test.ts` passes (re-run); `git diff 4053cfe HEAD` adds 0 `ui-exception`. Four step-1 screenshots exist; T4 notes no horizontal scroll, five cards stack at 390 px.
- ✅ **AC-19 gate.** Table above; every floor met. CI green at `1639b1e`, the later commit fills doc placeholders only.
- ⏸ **AC-20 (T7, after OP-028):** DEFERRED, not failed. The post-style defaults stay unchanged until T7.
- ⏸ **AC-21 (after OP-028):** DEFERRED, not failed. No `results.json` or ledger exists yet.

## Deviations

- AC-10's one-image-call unit case is in `heroSeams.test.ts` (judged met above).
- T3: a `LookShape = Shape | "STORY"` type was added instead of widening `Shape`; 009's fixtures are untouched.
- Existing §AA and §AE E2E cases (TC-HERO-09, 13, TC-PS-31, 32) were adapted to the 9:16 lift; none deleted.

## Known limits

- The fixtures prove the checker discriminates; they do not prove a real model draws the looks. That is OP-028 (spec limits L1 to L5).
- At 1440 px the five cards sit 3 + 2 with one empty cell.
- `compositionNotice.ts:42` carries unreachable 9:16 text (L3).
- Full-bleed PORTRAIT overlaps its band by 2 points, the same as a passing 009 contract.
- Defaults do not move until T7 runs after OP-028.

## Per-task reviews

- T1 — NOTE
- T2 — NOTE
- T3 — NOTE
- T4 — NOTE
- T5 — NOTE
- final — With fixes (all addressed)

## Verification

Command: `npx vitest run tests/unit/lookDataset.test.ts tests/unit/lookCheck.test.ts tests/unit/lookFixtureCompleteness.test.ts tests/unit/heroSeams.test.ts tests/unit/compositionNotice.test.ts tests/unit/heroPrompts.test.ts tests/unit/refinePrompt.test.ts tests/unit/designData.test.ts tests/unit/postStylesResolve.test.ts tests/unit/uiTokenGuard.test.ts`
Exit: 0
Output (tail):
Test Files 10 passed (10)
Tests 460 passed (460)

Command: `git diff --name-only 4053cfe -- prisma .env.example src/lib/env.ts src/lib/scheduler src/mcp src/acp src/app/api/acp src/app/api/campaigns src/lib/renderer src/lib/agent`
Exit: 0
Output (tail):
(no output)

Command: `git grep -c <createMessage|runClaudeCli|recordModelCall|generateImage> -- src` (now vs `4053cfe`)
Exit: 0
Output (tail):
createMessage 21/21, runClaudeCli 27/27, recordModelCall 29/29, generateImage 17/17

Command: `git diff 4053cfe HEAD -- src scripts tests | grep -c "^+.*ui-exception"`
Exit: 0
Output (tail):
0
