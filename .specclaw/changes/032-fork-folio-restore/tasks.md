# Tasks: Restore the fork after the one-time company sync

**Change:** 032-fork-folio-restore · **Size:** architectural
**Created:** 2026-10-27
**Total tasks:** 12 in 3 waves, run one at a time.

## Summary

1. **W1, foundations** (T1 to T4): delete the deploy workflow; the fork stack and preflight; the fork docs and identity guard; the gate, scan and push.
2. **W2, Folio values** (T5 to T7): tokens, fonts, wordmark, helpers and primitives; the other 021-only screens; the guards, the docs and the gate.
3. **W3, the 023–031 screens** (T8 to T12): four screen groups, then the screenshots, the gate and the push.

## Process / Gates

- **One task at a time:**
  1. an implementer subagent does the task, on the model listed for it;
  2. `specclaw:code-reviewer` (sonnet) reviews it;
  3. the orchestrator re-runs tsc, `npm run lint` and `npm run test:unit`, then commits to `v2`.

  Never run two implementers in this checkout. Never touch fork `main`.

- **Repo check before any push:** `git remote get-url origin` prints `https://github.com/EnderGuardian25/ai-studio.git`.
- **No DB or `docker compose` command before T2 lands** (the old `.env` points at the company clone's stack). From T2 on, every DB command goes through a preflighted npm script (`db:migrate`, `db:seed`, `test:e2e:db`, `test:upgrade`) or names `ai_studio_test`/`ai_studio_upgrade` explicitly. Never touch the `designer` stack or any `bistec_studio*` database. The one exception is AC-07 in T4, which needs the company stack _running_; ask the user first.
- **A clean E2E gate** (from T4 on): stop stray node processes, `rm -rf .next`, `npm run test:e2e:db -- --reset`, `npm run test:e2e:serve` in the background, then `npm run test:e2e:mock`. Full runs only in T4, T7 and T12. Other UI tasks run their own sections plus any suite whose locators they touch.
- **No real model or image calls.**
- **Read `docs/ui-reference/DESIGN_SYSTEM.md` before any UI task** (T5 to T12). From T7 on it is the Folio version. Also follow its §12 "Words" (031); copy does not change in this change.
- **Restyle rule (FR-13):** a UI task changes class strings, atom references and imports only. No copy, `aria-*`, `data-testid`, handler or control-flow change. The reviewer rejects any other hunk.
- **Baselines (031 verify, CI green at `a511013`):** unit 4553; render 154; lint 0 errors / 7 warnings; full clean mock E2E 598 passed / 3 skipped / 0 failed / 0 flaky. A task may add cases. It may not lower a pass count or add a lint warning. An existing case may be adapted (listed in the report), never deleted.
- **A `page.waitForResponse` must be created before the action that triggers it.**
- **Report footers.** Each task writes `reports/T<n>.md` ending with a `## Verification` heading exactly (`Command:` / `Exit:` / `Output (tail):`). Re-read it after prettier.
- **Briefs.** Give each implementer `spec.md`, `design.md`, this task's block and the files listed, as `briefs/T<n>.md`. Not the `specclaw-build-context` payload.
- **Haiku gate agents** have handed back before a long E2E run finished. The orchestrator waits on the run's log for the `MOCK_EXIT` line.

## Tasks

### Wave 1: Foundations

- [x] `T1` — Delete the company deploy workflow (first commit)
  - Files: `.github/workflows/docker-publish.yml` (delete)
  - Estimate: tiny
  - Kind: config
  - Model: haiku
  - Depends: none
  - Notes: The commit holds this deletion only (FR-01, AC-01). No push.

- [x] `T2` — The fork's own stack and the preflight
  - Files: `docker-compose.yml`, `docker-compose.override.yml`, `docker-compose.test.yml`, `.env.example`, `package.json`, `scripts/lib/stackPreflight.mjs` (new), `scripts/stack-preflight.mjs` (new), `scripts/setup-test-db.mjs`, `scripts/test-upgrade-path.mjs`, `scripts/seed-admin.mjs`, `scripts/seed-hearts-talk.mjs`, `scripts/refine-bistec-brandkit.mjs`, `.github/workflows/e2e.yml`, `tests/e2e/agui-refinement.test.ts`, `tests/e2e/brief-draft-recovery.test.ts`, `tests/unit/stackPreflight.test.ts` (new); local untracked `.env`, `.env.test`
  - Estimate: medium
  - Kind: config
  - Model: sonnet
  - Depends: T1
  - Notes:
    - FR-07, FR-08; design §6. `checkStack` is pure and unit-tested (AC-08).
    - Copy `.env` and `.env.test` to the scratchpad before the rewrite (design §6.4). Report changed key names only, never values.
    - `setup-test-db.mjs`: `docker compose exec -T postgres`, `--reset` (refuses a name not ending `_test`).
    - `test-upgrade-path.mjs`: `SCRATCH_DB` and its assertion become `ai_studio_upgrade` together; fix the "company prod" comments.
    - `e2e.yml`: ports 5442 and 9100, `ai_studio_test`; MinIO image stays the silo digest pin.
    - AC-09: run each preflighted script once with a temporary env file pointing at `localhost:5432/bistec_studio_test`, confirm exit 1 and the refusal, touch no DB.
    - Do not start containers in this task; T4 does.

- [x] `T3` — Fork docs and the identity guard
  - Files: `CLAUDE.md`, `docs/history.md` (new), `docs/handoff.md`, `docs/fork-history.md`, `docs/cold-start.md`, `docs/e2e-test-plan.md`, `.claude/launch.json`, `docker-compose.test.yml` (comment only), the seven docs of FR-05 (delete), `tests/unit/forkIdentity.test.ts` (new)
  - Estimate: medium
  - Kind: docs
  - Model: sonnet
  - Depends: T2
  - Notes:
    - FR-02, FR-04, FR-05, FR-06, FR-09; design §4.4, §7.
    - Move the dated entries from `CLAUDE.md` to `docs/history.md` verbatim, under the banner. The new "Current state" section is short: identity, remotes, sync, fresh start, deploy (none yet), silo, the `origin` check, change 032 in flight with its next task.
    - Leave `CLAUDE.md`'s design-system lines for T7 (they become Folio there); mark them "being restored to Folio by 032 W2" for now.
    - `forkIdentity.test.ts`: one negative case per check (AC-02).
    - AC-04, AC-05, AC-06 greps go in the report.

- [x] `T4` — W1 gate, stack check, scan and push
  - Files: `.specclaw/changes/032-fork-folio-restore/reports/pre-push-scan.md`, `reports/T4.md`
  - Estimate: medium (one full E2E run)
  - Kind: test
  - Model: haiku (gate runs); the orchestrator does the push
  - Depends: T3
  - Notes:
    - `docker compose up -d` (project `ai-studio`), `npm run db:migrate`, `npm run db:seed`. Then AC-07: ask the user before starting the company stack, if it is not running; `docker compose ls` shows both.
    - The full gate (AC-10, AC-11): tsc, lint, unit, `npm run test:render`, `npm run test:upgrade`, the clean E2E run, `npm run build`.
    - Re-run the pre-push scan over `59f3b222..HEAD` and append the result (FR-10). Any hit stops the push and goes to the user.
    - Orchestrator: check `origin`, `git push origin v2`, then `gh run list --branch v2` until the first run settles (AC-12). Update the memory file for the one-time sync.

### Wave 2: Folio values

- [x] `T5` — Folio foundation: tokens, fonts, Tailwind, wordmark, helpers, primitives, and the restore check
  - Files: `src/app/globals.css`, `src/app/layout.tsx`, `tailwind.config.ts`, `src/components/Logo.tsx`, `public/BistecStudioLogo.png` (delete), `src/components/ui/atoms.ts`, `src/components/ui/GateNotice.tsx`, `src/components/ui/{Button,FieldLabel,ImageLightbox,Input,Modal,Notice,PageHead,Panel,QueryError,SectionHead,SegmentedToggle,Select,StatusChip}.tsx`, `src/components/ui/index.ts`, `src/components/admin/brandkits/classes.ts`, `src/components/campaigns/classes.ts`, `src/components/brief/cardCls.ts`, `scripts/check-folio-restore.mjs` (new)
  - Estimate: medium
  - Kind: refactor
  - Model: sonnet
  - Depends: T4
  - Notes:
    - FR-11, FR-12, FR-15; design §2.1, §3. Restore with `git show 9f829456:<path>` and apply the import map. Never hand-retype a restored file.
    - `check-folio-restore.mjs` holds the whole §2.1 list (including T6's files) with the per-file import lines and the kept additions; in this task it checks the T5 files and reports T6's as pending.
    - tsc will flag every place post-021 code relies on a Graphite-only primitive prop or atom. Fix by adding the prop or atom with a Folio value (a kept addition, listed in the script and the report), never by editing the post-021 caller here.
    - Settle `PILL_BADGE`'s Folio value (design §3.2) and record it.
    - Unit tests that import removed names (`designTokens`, `contrast`, `uiPrimitives`) may fail until T7; list them in the report. tsc and lint must pass.

- [x] `T6` — Restore the other 021-only screens
  - Files: the "Pages" and "Screens" lines of design §2.1
  - Estimate: medium
  - Kind: refactor
  - Model: haiku
  - Depends: T5
  - Notes: Mechanical: `git show 9f829456:<path>` plus the import map, for each file. `node scripts/check-folio-restore.mjs` exits 0 over the full list (AC-14). tsc and lint pass. Report any file where the restore needed more than the map (expected: none).

- [ ] `T7` — Guards flipped to Folio, tests adapted, docs part 1, W2 gate
  - Files: `tests/unit/{designTokens,contrast,uiTokenGuard,uiPrimitives,noTeamNotice}.test.ts`, `tests/e2e/{a11y,surfaces}.test.ts` and any suite the full run shows asserting Graphite styling, `docs/ui-reference/DESIGN_SYSTEM.md`, `CLAUDE.md` (design-system lines), `reports/T7.md`
  - Estimate: large (one full E2E run)
  - Kind: test
  - Model: sonnet
  - Depends: T6
  - Notes:
    - FR-14, FR-16, FR-17; design §4.1 to §4.3.
    - `PENDING_RESTYLE` = exactly the restyled-set files that fail the Graphite deny-list or the atom-copy check after T6. List it in the report with the reason per file. `W3_DONE = false`.
    - AC-15, AC-16, AC-17: include the scratch-line checks in the report (reverted after).
    - `DESIGN_SYSTEM.md`: the 9f829456 text with `folio.ts` references changed to `atoms.ts`/`classes.ts`. No Graphite archive.
    - Full clean E2E (AC-18). Adapted cases listed, none deleted.

### Wave 3: The 023–031 screens

Each group task: restyle its files (design §5 "How to restyle a file"), remove them from `PENDING_RESTYLE`, add its `DESIGN_SYSTEM.md` sections (FR-19), run the E2E sections that cover its screens plus `a11y.test.ts`, and capture its screens in light and dark with `scripts/capture-ui.mjs` into `ui-captures/032/<group>` for the user.

- [ ] `T8` — G1, the draft page
  - Files: design §5 row G1; `src/components/ui/atoms.ts` or a new `src/components/drafts/classes.ts` if shared styling needs a home; `docs/ui-reference/DESIGN_SYSTEM.md`; `tests/unit/uiTokenGuard.test.ts` (list only)
  - Estimate: large
  - Kind: impl
  - Model: sonnet
  - Depends: T7

- [ ] `T9` — G2, the create flow and the shell
  - Files: design §5 row G2; `atoms.ts` or `src/components/brief/cardCls.ts`; `DESIGN_SYSTEM.md`; `uiTokenGuard.test.ts` (list only)
  - Estimate: large
  - Kind: impl
  - Model: sonnet
  - Depends: T8

- [ ] `T10` — G3, campaigns, projects and brand kits
  - Files: design §5 row G3; `atoms.ts`, `src/components/campaigns/classes.ts`, `src/components/admin/brandkits/classes.ts`; `DESIGN_SYSTEM.md`; `uiTokenGuard.test.ts` (list only)
  - Estimate: large
  - Kind: impl
  - Model: sonnet
  - Depends: T9

- [ ] `T11` — G4, team, settings, admin and insights
  - Files: design §5 row G4; `atoms.ts` or a new `src/components/admin/insights/classes.ts`; `DESIGN_SYSTEM.md`; `uiTokenGuard.test.ts` (list only)
  - Estimate: medium
  - Kind: impl
  - Model: sonnet
  - Depends: T10

- [ ] `T12` — Screenshots, W3 gate, docs, scan and push
  - Files: `tests/unit/uiTokenGuard.test.ts` (`W3_DONE = true`), `docs/ui-reference/screen-light.png`, `docs/ui-reference/screen-dark.png`, `CLAUDE.md` (Current state), `docs/e2e-test-plan.md` (counts), `reports/pre-push-scan.md`, `reports/T12.md`
  - Estimate: medium (one full E2E run)
  - Kind: test
  - Model: haiku (gate runs); the orchestrator does the push
  - Depends: T11
  - Notes:
    - FR-20, FR-21; AC-19 to AC-23. NFR-01's diff in the report (expected empty).
    - `ui-captures/032/` complete for the user's review, both themes.
    - Re-scan the new range, check `origin`, push, check CI. Update `CLAUDE.md` "Current state": 032 built, the next step is the user's review of the captures and `/specclaw:verify`.
