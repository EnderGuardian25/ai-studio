# Tasks: Folio fidelity pass on top of 018–031

**Change:** 033-folio-fidelity-pass · **Size:** architectural
**Created:** 2026-10-27
**Total tasks:** 11 in 2 waves, run one at a time, with a user checkpoint between the waves.

## Summary

1. **W1, evidence and the known gaps** (T1 to T5):
   - the invariant check;
   - capture coverage;
   - the three known items;
   - the audit;
   - the gate and push.

   Then the **checkpoint**: the user approves `audit.md`.

2. **W2, the pass** (T6 to T11):
   - Folio primitives;
   - four family passes, each with its new components and DESIGN_SYSTEM.md sections;
   - the final gate, screenshots, docs and push.

## Process / Gates

- **One task at a time:**
  1. An implementer subagent does the task on its listed model.
  2. `specclaw:code-reviewer` (sonnet) reviews it.
  3. The orchestrator re-runs tsc, `npm run lint`, `npm run test:unit` and (from T1 on) `node scripts/check-ui-invariants.mjs`, then commits to `v2`.

  Never run two implementers in this checkout. Never touch fork `main`.

- **Repo check before any push:** `git remote get-url origin` prints `https://github.com/EnderGuardian25/ai-studio.git`. After the push, run `gh run list --branch v2`.
- **DB and stack:** only the fork stack (project `ai-studio`). DB commands go through the preflighted npm scripts. Never touch the `designer` stack or a `bistec_studio*` database.
- **A clean E2E gate** (T5, T11):
  1. Stop stray node processes and run `rm -rf .next`.
  2. Run `npm run test:e2e:db -- --reset`.
  3. Start `npm run test:e2e:serve` in the background.
  4. Run `npm run test:e2e:mock`.

  [`tools/gate.sh`](tools/gate.sh) does all of this plus the other checks; run it in the background (design §8). Other tasks run only their own suites (design §7), against a server started with `npm run test:e2e:serve` after `npm run test:e2e:db -- --reset`.

- **Captures for a single task:** start the mock server as above, then `node scripts/capture-ui.mjs --out ui-captures/033-t<n>`, and view the PNGs.

- **No real model or image calls.** Captures run against the mock server (`:3001`).
- **Read `docs/ui-reference/DESIGN_SYSTEM.md` before any UI task,** including §12 "Words".
- **The guard rule:**
  - A UI task may change markup, class strings and visible text only as an `approved` (or, in T3, a `closed`) `audit.md` row says.
  - `aria-*`, `data-testid`, `role`, `id`, `htmlFor`, `type`, `name`, `href` and `on*` change only with a row permit, and `check-ui-invariants.mjs` enforces that.
  - The 17 pinned files (design §2.3) do not change.
  - The NFR-01 paths do not change.
- **Baselines** (`c45ed3dc`; CI green on `468a2018`):

  | Check  | Baseline                                         |
  | ------ | ------------------------------------------------ |
  | unit   | 4581                                             |
  | render | 154                                              |
  | lint   | 0 errors / 7 warnings                            |
  | E2E    | 598 passed / 3 skipped / 0 failed / 0 flaky (CI) |

  A task may add cases, but may not lower a pass count or add a lint warning. A case may be adapted (citing its audit row), never deleted.

- **A `page.waitForResponse` must be created before the action that triggers it.**
- **Report footers.** Each task writes `reports/T<n>.md`, ending with a `## Verification` heading exactly (`Command:` / `Exit:` / `Output (tail):`). Re-read it after prettier.
- **Briefs.** Give each implementer `spec.md`, `design.md`, this task's block and its files, as `briefs/T<n>.md`. From T6 on, add its family's `audit.md` rows.

## Tasks

### Wave 1: Evidence and the known gaps

- [x] `T1` — The behaviour-invariant check
  - Files: `scripts/lib/uiInvariants.mjs` (new), `scripts/check-ui-invariants.mjs` (new), `tests/unit/uiInvariants.test.ts` (new), `.specclaw/changes/033-folio-fidelity-pass/audit.md` (new: the header and empty family tables only)
  - Estimate: medium
  - Kind: test
  - Model: sonnet
  - Depends: none
  - Notes:
    - FR-01, design §5. The core is pure; the CLI does the git and fs work.
    - `AUDIT_SET` is design §2.1's 47 paths, exactly.
    - Unit cases per AC-01, on inline TSX fixtures.
    - Run the CLI at HEAD (expected: exit 0, no diff). `--coverage` is expected to fail until T4 and is not in the T1 commit's gate.
    - No change to `package.json` scripts.

- [x] `T2` — Capture coverage for every state this change touches
  - Files: `scripts/capture-ui.mjs`
  - Estimate: medium
  - Kind: test
  - Model: sonnet
  - Depends: T1
  - Notes:
    - FR-02, design §6. Copy locators from the named E2E suites.
    - Run against a clean mock server into `ui-captures/033-t2/` (gitignored). Confirm each state's files and the three notices by viewing the PNGs.
    - Report any `skipped` state and stop if one of the three notices is unreachable.

- [x] `T3` — The three known items
  - Files: `src/components/layout/AppShell.tsx`, `src/components/admin/brandkits/BrandKitAssistantPanel.tsx`, `src/components/campaigns/BriefingAssistantPanel.tsx`, `src/app/(app)/drafts/[id]/page.tsx`, `tests/e2e/surfaces.test.ts`
  - Estimate: small
  - Kind: impl
  - Model: haiku
  - Depends: T1
  - Notes:
    - FR-03, FR-04, FR-05; the sources are cited in spec FR-04 and FR-05. Confirm the briefing drawer's Send markup at `9f829456` before editing it.
    - Add `toHaveText('Send')` next to the three existing Send checks in `surfaces.test.ts`, for the two drawers only (AC-05).
    - `check-ui-invariants.mjs` will report the removed nav-icon attributes (`aria-hidden`). Write their permit tokens into the report; T4 records them as the `closed` rows.
    - Run `surfaces.test.ts`, the draft-page suites and the axe suite. Capture the sidebar, both drawers and the draft page in both themes.

- [x] `T4` — The audit
  - Files: `.specclaw/changes/033-folio-fidelity-pass/audit.md`
  - Estimate: large
  - Kind: docs
  - Model: opus
  - Depends: T3
  - Notes:
    - FR-06, design §3. One agent does all four families, so the classes are consistent.
    - **Per audit-set file:** diff `9f829456..c45ed3dc`, read the current file and DESIGN_SYSTEM.md, and write rows.
    - **For a `behaviour` row,** cite the 018–031 proposal or spec line that names the arrangement. Search `.specclaw/changes/0{18..31}-*/{proposal,spec}.md`.
    - **The 12 new components:** for each one, list its planned Folio structure in a family subsection. These have no rows, because there is no `9f829456` version.
    - **The T3 items:** write them as `closed <T3 sha>`, with the permits from the T3 report.
    - `node scripts/check-ui-invariants.mjs --coverage` must exit 0.
    - Fill in the header counts. Every row is `proposed` except T3's.

- [~] `T5` — W1 gate, scan, push and the checkpoint
  - Files: `docs/e2e-test-plan.md` (latest-gate line), `CLAUDE.md` ("Current state"), `.specclaw/changes/033-folio-fidelity-pass/reports/pre-push-scan.md`
  - Estimate: medium
  - Kind: config
  - Model: orchestrator
  - Depends: T4
  - Notes:
    - The full gate (NFR-03) with `CAPTURE=1`, then the scan, the push and CI (AC-08).
    - **Checkpoint (FR-07):** present the user with the row counts by class and family, the ambiguous questions, and the short capture list for the three items.
    - Record the approval and the rulings in `audit.md` (AC-09), set rows to `approved` or `cut`, and commit.
    - No W2 task starts before this commit.

### Wave 2: The pass

- [ ] `T6` — Folio primitives in the shared modules
  - Files: `src/components/ui/atoms.ts`, `src/components/ui/{PageHead,Notice,FieldLabel,StatusChip}.tsx`, `docs/ui-reference/DESIGN_SYSTEM.md` (§8.18), `.specclaw/changes/033-folio-fidelity-pass/audit.md` (rows closed by T6)
  - Estimate: medium
  - Kind: refactor
  - Model: sonnet
  - Depends: T5
  - Notes:
    - FR-08, design §4. Add only what at least two approved rows need, each with a JSDoc citing its `9f829456` source.
    - The primitive rows from design §2.1 close here.
    - List every importer of each changed primitive, run their suites, and capture their screens.
    - Stop and ask if `Panel` or `SectionHead` (pinned) would have to change.

- [ ] `T7` — G1 draft page
  - Files: G1's files (design §2.1) and new components (§2.2); `docs/ui-reference/DESIGN_SYSTEM.md` §8.20, §8.21; `audit.md`; tests named by its rows
  - Estimate: large
  - Kind: impl
  - Model: sonnet
  - Depends: T6
  - Notes: design §7. Suites: the draft-page sections of `surfaces.test.ts`, `headline-badge.test.ts`, `apply-text.test.ts`, `hero-image.test.ts`, `agui-refinement.test.ts`, the publish suites, and the axe suite.

- [ ] `T8` — G2 create flow and shell
  - Files: G2's files and new components; DESIGN_SYSTEM.md §8.22, §8.23; `audit.md`; tests named by its rows
  - Estimate: large
  - Kind: impl
  - Model: sonnet
  - Depends: T7
  - Notes: design §7. Suites: `post-styles.test.ts`, `image-looks.test.ts`, the wizard and dashboard suites, `surfaces.test.ts` (shell), and the axe suite.

- [ ] `T9` — G3 campaigns and kits
  - Files: G3's files and new components; DESIGN_SYSTEM.md §8.24, §8.25; `audit.md`; tests named by its rows
  - Estimate: large
  - Kind: impl
  - Model: sonnet
  - Depends: T8
  - Notes: design §7. Suites: `brand-kit.test.ts`, `kit-upgrade.test.ts`, the campaign and queue suites, `surfaces.test.ts` (drawers), and the axe suite.

- [ ] `T10` — G4 team, settings and admin
  - Files: G4's files and new components; DESIGN_SYSTEM.md §8.26, §8.27; `audit.md`; tests named by its rows
  - Estimate: medium
  - Kind: impl
  - Model: sonnet
  - Depends: T9
  - Notes: design §7. Suites: the team, caption-route, settings, admin-users and `analytics.test.ts` (insights) suites, and the axe suite.

- [ ] `T11` — Final gate, screenshots, docs and push
  - Files: `docs/ui-reference/screen-light.png`, `docs/ui-reference/screen-dark.png`, `CLAUDE.md`, `docs/e2e-test-plan.md`, `docs/history.md`, `reports/pre-push-scan.md`, `audit.md`
  - Estimate: medium
  - Kind: config
  - Model: orchestrator
  - Depends: T10
  - Notes:
    - FR-13; AC-11 to AC-16. Run the full gate with `CAPTURE=1` into `ui-captures/033/`.
    - Recapture the reference screenshots (the 032 method), and write an index of the changed screens.
    - Confirm no row is `approved` or `open`. Scan, push, and get CI green.
    - The user reviews the index (AC-17).
