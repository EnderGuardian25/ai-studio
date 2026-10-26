# Proposal: Restore the fork after the one-time company sync (Folio, checks-only CI, fork docs, own Docker stack)

**Created:** 2026-10-27
**Status:** 🟡 Draft

## Problem

This repo is the fork `EnderGuardian25/ai-studio`. Its `v2` stopped at `1c38dbb9` on 2026-10-14. On 2026-10-18 the company repo `bistec-oss/studio` fast-forwarded its `v2` to that tip and continued there: changes 018–031, 202 commits, ending at `59f3b222` (2026-10-27).

On 2026-10-27 the user chose to bring that work into the fork **once**. Local `v2` was fast-forwarded `1c38dbb9 → 59f3b222`. The `upstream` and `company` remotes were removed, so `origin` (the fork) is the only remote. Nothing is pushed yet. There are no future company merges (user decision).

The company work carries four things the fork must not keep:

1. **Graphite instead of Folio.** Change 021 re-themed the app from Folio (the fork's design, picked 2026-10-07, change 011) to Graphite, because the company "wants this system to look different from the fork". It also brought back the Bistec Studio PNG logo (`public/BistecStudioLogo.png`) instead of the typeset "Studio" wordmark. 021 touched about 94 files under `src/` and `tests/`. It folded the three `folio.ts` modules into `src/components/ui/atoms.ts` and feature-local `classes.ts` files, and moved the guards (`designTokens`, `contrast`, `uiTokenGuard`) and `DESIGN_SYSTEM.md` to Graphite. Changes 023–031 then built new UI on Graphite (about 104 files under `src/components` and `src/app` changed after 021): hero reference images, post styles, image looks, the stale-headline badge, the final polish and more.
2. **Company deploy.** Change 022 restored `.github/workflows/docker-publish.yml`: the GHCR push to the company registry, the Coolify redeploy of company prod and the `/api/health` check against `studio.bistecglobal.com`. The fork's CI is checks only (change 013). The user will deploy the fork **fresh, on their own, different server**, with a deploy workflow written later.
3. **Company identity in the docs.** `CLAUDE.md` and `docs/handoff.md` say this repo is `bistec-oss/studio`, `origin` points there, and the fork is fetched as `fork/*`. `docs/devops-deploy-handover.md` is a handover for company DevOps. The company prod items (B4, team tokens, Coolify token, the prod MinIO → silo swap) read as live to-dos.
4. **A shared local Docker stack.** The fork clone and the company clone (`D:\studio`) both use the containers `designer-postgres-1` and `designer-minio-1`, on the same ports and the same database names (`bistec_studio`, `bistec_studio_test`). Once the two codebases diverge, one repo's migrations can break the other's local DB.

## Proposed Solution

1. **Folio back, on every screen.** The Folio baseline is the tree at `9f829456`: 022 verified, the last commit before 021's code. For files 021 changed and nothing after it touched, restore their `9f829456` version. For files 023–031 changed after 021, keep their behaviour and restyle them with the Folio primitives and tokens. That covers the new UI (post styles, image looks, hero reference images, stale-headline badge, 031 polish) and every new component.
   - Restore the Folio tokens and fonts (Fraunces, Instrument Sans, JetBrains Mono) and the `folio.ts` helper modules, or keep 021's neutral module names with Folio values. Planning picks one.
   - Restore the typeset "Studio" wordmark and delete `public/BistecStudioLogo.png` again (user decision, 2026-10-07).
   - Restore the Folio guards and tests (`designTokens`, `contrast`, `uiTokenGuard`, including the legacy and Graphite deny-list). Keep 031's `uiWordingGuard`.
   - Restore the Folio `DESIGN_SYSTEM.md` and screenshots, and archive the Graphite version under `docs/ui-reference/archive/graphite/`.
2. **Checks-only CI.** Delete `.github/workflows/docker-publish.yml`. Keep `e2e.yml` (typecheck, lint, unit, E2E, build, `docker build .` with no push). Review 022's `Dockerfile` and entrypoint edits, and keep what a fresh deploy needs.
3. **Fork docs and a resume path.**
   - **`CLAUDE.md`:** a new top entry. This repo is the fork, `origin` is the fork and there are no company remotes. This was a one-time sync. The system starts fresh, the deploy target is the user's own server, and nothing deploys yet. Plus the new local paths: fork `D:\ai-studio`, company clone `D:\Bistec\studio`.
   - **`docs/handoff.md`:** the same top entry, plus a "resume after the folder move" checklist.
   - **Company-only docs** (`devops-deploy-handover.md`; the company prod to-dos): remove them, or mark them as company history.
   - **Object storage:** state that silo (`pgsty/silo`, pinned by digest) is already the fork's MinIO image in compose and CI, so a fresh deploy needs no MinIO migration.
   - Keep 022's caption backfill migration: it is a no-op on a fresh DB and keeps migration history intact.
4. **Own local Docker stack.** Give the fork its own compose project name (`ai-studio`) and its own host ports for Postgres and MinIO, set through `.env` with fork defaults that do not clash with the company clone's `designer` stack. Update `.env.example`, `docs/cold-start.md`, the E2E DB scripts and the test compose file to match. The fork starts with empty volumes (fresh start).

## Scope

### In Scope

- Items 1–4 above, in light and dark themes, with the full gate: tsc, lint, unit, `test:render`, and a full clean mock E2E on the fork's own stack.
- Push `v2` to `origin` (the fork) and confirm fork CI is green.
- A PowerShell script, outside the repo, that the user runs after closing Claude Code. It moves the fork to `D:\ai-studio` and the company clone `D:\studio` to `D:\Bistec\studio`, moves the matching Claude memory folders, and pins the company clone to the existing `designer` Docker volumes.

### Out of Scope

- Any change to the company repo or the company clone's code. The script only moves the folder and adds `COMPOSE_PROJECT_NAME=designer` to its `.env`.
- A deploy workflow for the user's server (later, written fresh).
- Reverting 018–031 behaviour. Only their styling changes.
- Changing app ports 3000/3001. Running both clones' app servers at once is not a goal.
- Carrying over local dev data (fresh start).

## Impact

- **Size:** architectural. It is a re-theme across about 150 files, with a Graphite → Folio mapping for components that never existed in Folio. That needs a design pass.
- **Files affected:** about 150–200 (estimated)
- **Complexity:** large
- **Risk:** medium. The behaviour stays, but many UI tests and a11y checks assert on styling and copy, and the 023–031 UI has no Folio reference.

## Decisions (user, 2026-10-27)

- **Sync approach:** a fast-forward to company `v2`, then this change. A one-time sync with no future company merges.
- **Module structure:** keep 021's neutral modules (`src/components/ui/atoms.ts`, feature-local `classes.ts`) and put Folio values in them. Do not restore the three `folio.ts` files.
- **Company-only docs: delete them.** That covers `docs/devops-deploy-handover.md`, `docs/minio-silo-migration.md`, `docs/coolify-token-rotation.md`, `docs/prod-e2e-findings-2026-07-2*.md` and `docs/scheduler-b4-diagnosis-2026-08-03.md`. They stay in git history and in the company repo. Also fix the references to them in `CLAUDE.md`, `docs/handoff.md` and `docs/fork-history.md`.
- **Keep 022's caption backfill migration** (a no-op on a fresh DB).
- **Deploy:** the user deploys the fork fresh on their own server, later. No deploy workflow in this change.
- **Local split:** separate Docker stacks. The fork moves to `D:\ai-studio`, and the company clone `D:\studio` moves to `D:\Bistec\studio`, by a user-run script **before** planning. `.claude/launch.json` hard-codes `D:\Bistec\designer` and must point at the new path.

## Panel rulings (user, 2026-10-27)

The user approved this proposal as **architectural** on 2026-10-27, with the panel findings resolved as follows. Planning maps every upheld finding to where it is addressed.

- **One change, three waves.** No split into separate changes. **Folio is decided now.** No new UI work (020, 009 and the rest) starts until W3 lands. This answers party-po's BLOCK with party-visionary's rebuttal.
  - **W1, the fork's foundations, then a push:**
    - The first commit deletes `docker-publish.yml`.
    - Guards: no company deploy strings in workflows, and `pgsty/silo` by digest in every compose file and `e2e.yml`.
    - Fork docs: one authoritative top entry in `CLAUDE.md`, which `handoff.md` links to. Delete the company-only docs. Point `.claude/launch.json` at `D:\ai-studio`.
    - Its own Docker stack: project `ai-studio`; ports 5442 (Postgres), 9100/9101 (MinIO) and test 5443/9110, as `.env`-overridable defaults; DB names `ai_studio`/`ai_studio_test`. The local `.env`/`.env.test` are rewritten, and a preflight refuses the `designer` stack.
    - Then the full gate on the fork stack and a push (pre-approved by the user, once the scan is recorded and the gate is green).
  - **W2, Folio values:** the tokens, fonts, wordmark and `atoms.ts` values from `9f829456`; the guards, with a named allow-list of files not yet restyled.
  - **W3, the 023–031 screens:** restyled through `atoms.ts`/`classes.ts`, not component bodies. New Folio `DESIGN_SYSTEM.md` sections for the 023–031 component types, re-captured screenshots, the allow-list emptied, and a full E2E.
- **Restore rule (party-architect BLOCK):** 021's module structure and imports stay. Only values, plus the files outside the helper graph (fonts, wordmark, guards), come from `9f829456`. No `folio.ts`. No Graphite archive (git history holds it).
- **Push (party-security BLOCK):** `bistec-oss/studio` is public, so every commit in `1c38dbb9..59f3b222` is already public. The range scan (`reports/pre-push-scan.md`) found only the secret's name and `FAKE` fixtures. The fork has no Actions secrets. The push after the W1 gate is pre-approved.
- **Stale env (party-security BLOCK):** resolved by W1's env rewrite, the new DB names and the preflight.
- **The move script** runs before planning. It checks each folder's `origin`, pins the company clone idempotently, logs, and prints undo steps. Path edits in the repo (`launch.json`, docs, the compose project name) land in W1 commits.

## Open Questions

1. Fork host ports: the proposal assumes Postgres `5442`, MinIO `9100`/`9101`, and test stack `5443`/`9110`. Any preference?

Party panel, upheld findings (verdict CHANGES_REQUESTED; see `party-report.md`):

- (party-architect, BLOCK) The blanket "restore the `9f829456` version" rule contradicts the decision to keep `atoms.ts`/`classes.ts`: the restored files would import `folio.ts`. Take only the values (and the files outside the helper graph) from `9f829456`.
- (party-po, BLOCK) The Folio re-theme is priced without its value or the do-nothing option. Split items 2–4 (CI, docs, Docker stack) from the re-theme.
- (party-security, BLOCK) Pushing `1c38dbb9..59f3b222` publishes it for good. Scan the whole range for secrets and company prod identifiers, record the result, and get the user's go-ahead before the first push.
- (party-security, BLOCK) The fork's stale local `.env`/`.env.test` would keep migrate, seed and the test-DB `DROP` pointed at the company stack. Rewrite them, give the fork its own DB names, and add a preflight that refuses the `designer` stack.
- (party-ba) Define "restored" (byte-identical to `9f829456`) separately from "restyled" (token-compliant only), and name the guard that decides each.
- (party-ba) No falsifiable acceptance criteria. Examples: no Graphite or `BistecStudioLogo` references, no `docker-publish.yml`, no company strings in the live docs, both stacks up at once.
- (party-ba) The file counts are unsourced. Cite the commands, and give the overlap between 021's files and 023–031's.
- (party-ba, NOTE) Add a criterion that `migrate deploy` on an empty DB succeeds.
- (party-po) Restore and restyle need a named cut line, with the waves that can ship on their own.
- (party-po) State the expected number of full E2E runs, and drop the Graphite archive (git history holds it).
- (party-po, NOTE) Adopt the assumed ports as `.env`-overridable defaults and drop open question 1.
- (party-architect) The "Graphite deny-list" is undefined. List its entries or the rule that produces them, and say whether the guard scans `atoms.ts`/`classes.ts`.
- (party-architect) The ports have no single source. Name the variables, how `DATABASE_URL` and the MinIO endpoints derive from them, the env file per stack, the CI impact, and a rule against hard-coded container names.
- (party-architect) "Keep what a fresh deploy needs" is not decidable. Give each 022 `Dockerfile`/entrypoint edit a keep or revert verdict, or state a concrete criterion.
- (party-architect) The script's order relative to this change leaves `launch.json`, the doc paths and the compose rename without an owner. Assign each one.
- (party-architect, NOTE) The deny-list half of `uiTokenGuard` must land in the same wave as the restyle of the files it scans, or carry a shrinking allow-list.
- (party-security) Delete `docker-publish.yml` in the first commit, before any push. Add a guard against company deploy strings in workflows, and confirm the fork has no `COOLIFY_*` secret.
- (party-security) The move script needs a preflight, a log, an idempotent `.env` pin and printed undo steps.
- (party-security) Check `git remote get-url origin` before moving each memory folder, and before any push.
- (party-security, NOTE) Add a unit guard that every compose file and `e2e.yml` use `pgsty/silo` by digest.
- (party-visionary) Write Folio `DESIGN_SYSTEM.md` sections for the 023–031 component types and re-capture the screenshots, instead of restoring the old doc verbatim.
- (party-visionary) Restyling inside component bodies makes company fixes impossible to cherry-pick. Put the styling in `atoms.ts`/`classes.ts`, or state that ports become manual.
- (party-visionary) Give the fork its own DB names (`ai_studio`, `ai_studio_test`) and one source for the stack identity.
- (party-visionary) Make one doc authoritative for current state, with the other linking to it. Keep absolute paths only in `launch.json`.
- (party-visionary, NOTE) Have the guards derive their expected values from the token module, so the next re-theme edits one file.
- (party-visionary) Rebuttal to party-po: deferring Folio is the most expensive option. Decide now, or block new UI work (020, 009) until the re-theme lands.

---

**To proceed:** Review this proposal and approve to begin planning.
