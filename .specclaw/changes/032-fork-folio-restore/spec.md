# Spec: Restore the fork after the one-time company sync

**Change:** 032-fork-folio-restore · **Size:** architectural
**Created:** 2026-10-27
**Source:** [`proposal.md`](proposal.md) (approved 2026-10-27, with the "Panel rulings" section as the brief) and [`party-report.md`](party-report.md).

## Overview

On 2026-10-27 the fork's `v2` was fast-forwarded once to the company's `59f3b222` (changes 018–031). This change removes what the fork must not keep, in three waves:

- **W1, foundations, then a push:** no company deploy workflow, fork-identity docs, the fork's own Docker stack with its own DB names and a preflight, the full gate, then `git push origin v2`.
- **W2, Folio values:** the Folio tokens, fonts, Tailwind theme, wordmark and helper values, the 021-only files back to their Folio bodies, and the guards flipped from Graphite to Folio, with a named allow-list of files not yet restyled.
- **W3, the 023–031 screens:** the remaining files restyled through `atoms.ts`/`classes.ts`, the allow-list emptied, `DESIGN_SYSTEM.md` sections for the new component types, new screenshots, and the full gate.

Behaviour from 018–031 does not change. Only styling, docs, CI and the local stack do.

## Approach

- **The baseline** is `9f829456` (022 verify, the last commit before 021's code). Its Folio token blocks match `docs/ui-reference/direction-studies/study-b-folio.html` exactly for every colour, radius, shadow, type and space token. Only `--control-*` (Folio-era additions by 014) and the three `--font-*` lines (served by `next/font`) differ (checked with a block diff, 2026-10-27).
- **021's module structure stays.** `src/components/ui/atoms.ts`, `src/components/admin/brandkits/classes.ts`, `src/components/campaigns/classes.ts` and `src/components/ui/GateNotice.tsx` stay where 021 put them, and every import stays pointed at them. No `folio.ts` returns. Their **values** come from the 9f829456 `folio.ts` modules (`ui/folio.ts`, `team/folio.tsx`, `campaigns/folio.ts`, `admin/brandkits/folio.ts`).
- **Two classes of file** (party-ba): every UI file changed since `9f829456` is either **restored** or **restyled**, and each class has its own check (FR-12, FR-13).
- **The guards read their expected values from the source of truth** (party-visionary NOTE): `designTokens` reads the Folio study, as 021's version reads the Graphite one.
- **The stack's identity has one source per value** (party-architect, party-visionary): compose reads the port variables; the app reads `DATABASE_URL`/`MINIO_ENDPOINT`; a preflight fails when the two disagree or when either points at the company stack.

### Sizing (party-ba: cited counts)

Commands run on 2026-10-27 at `aca27333`:

| Set                                                                        | Command                                                      | Files                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------- |
| 021 (`9f829456..f8ebee25`) under `src tests public`                        | `git diff --name-only 9f829456 f8ebee25 -- src tests public` | 95                               |
| 023–031 (`f8ebee25..59f3b222`) under `src tests public`                    | `git diff --name-only f8ebee25 59f3b222 -- src tests public` | 473 (mostly non-UI)              |
| Overlap (in both)                                                          | `comm -12` of the two                                        | 42 (38 under `src/`, 4 tests)    |
| 021-only                                                                   | `comm -23`                                                   | 53                               |
| 023–031 UI files under `src/components`, `src/app/(app)`, `src/app/(auth)` | `git diff --name-status f8ebee25 59f3b222 -- …`              | 43 modified, 15 added, 1 deleted |

The lists are in `design.md` §2.

## Requirements

### Functional requirements

#### W1: Foundations

- **FR-01 — No company deploy workflow, first.** The first commit of this change deletes `.github/workflows/docker-publish.yml` and does nothing else. No push happens before it (party-security).
- **FR-02 — Fork identity guard.** A unit test, `tests/unit/forkIdentity.test.ts`, fails when:
  - any file under `.github/workflows/`, any `docker-compose*.yml`, `Dockerfile` or `docker-entrypoint.sh` contains `coolify` (any case), `ghcr.io/bistec-oss`, `bistec-oss/studio` or `studio.bistecglobal.com`;
  - any MinIO-role image in `docker-compose.yml`, `docker-compose.test.yml` or `.github/workflows/e2e.yml` is not `pgsty/silo:<tag>@sha256:<64 hex>` (party-security NOTE);
  - any file under `scripts/`, `package.json`, `.github/`, the compose files, `CLAUDE.md`, `docs/cold-start.md` or `docs/e2e-test-plan.md` contains `designer-postgres` or `designer-minio` (no hard-coded container names; party-architect);
  - any tracked file outside `.specclaw/` and `.superpowers/` names a deleted doc (FR-05).
- **FR-03 — Dockerfile and entrypoint.** The rule: revert any edit that references the company registry, Coolify or `studio.bistecglobal.com`; keep the rest. 022's only edits are the env preflight bundle (`Dockerfile`, esbuild of `src/scripts/env-preflight.ts`) and its call in `docker-entrypoint.sh`. Neither matches, so **both are kept** (party-architect). FR-02's guard holds the rule from then on.
- **FR-04 — One authoritative current-state entry** (party-visionary).
  - `CLAUDE.md` gets one "Current state" section, the only place current state is stated. It says: this repo is the fork `EnderGuardian25/ai-studio`; `origin` is the only remote; the 2026-10-27 company sync was one-time and there are no company merges; the system starts fresh; nothing deploys yet, and the user will deploy to their own server with a workflow written later; object storage is already `pgsty/silo` pinned by digest, so a fresh deploy needs no MinIO migration; run `git remote get-url origin` and confirm `EnderGuardian25/ai-studio` before any push (party-security); the change in flight and the next step.
  - Every dated entry now under "Outstanding work" moves verbatim to `docs/history.md`, under a banner: "History. Not instructions. The company-era entries (2026-10-18 to 2026-10-27) describe `bistec-oss/studio`." `CLAUDE.md` links to it.
  - `docs/handoff.md` opens with a short section that links to `CLAUDE.md` "Current state" and restates nothing. Its existing sections stay, under the same banner.
  - `CLAUDE.md`'s reference sections stay. Lines that name Graphite, the PNG logo, Coolify or the company prod items as current are corrected; W2 corrects the design-system lines (FR-16).
  - Absolute local paths appear only in `.claude/launch.json` (FR-06). Docs name paths relative to the repo root.
- **FR-05 — Delete the company-only docs** (user decision): `docs/devops-deploy-handover.md`, `docs/minio-silo-migration.md`, `docs/coolify-token-rotation.md`, `docs/prod-e2e-findings-2026-07-22.md`, `docs/prod-e2e-findings-2026-07-23.md`, `docs/prod-e2e-findings-2026-07-24.md` and `docs/scheduler-b4-diagnosis-2026-08-03.md`. Every reference to them in tracked files outside `.specclaw/` and `.superpowers/` is removed or rewritten (this includes the comment in `docker-compose.test.yml`, `CLAUDE.md`, `docs/handoff.md`, `docs/fork-history.md` and `docs/history.md`, where a moved entry keeps its text but the link becomes plain text naming the deleted file).
- **FR-06 — `.claude/launch.json`** runs `npm --prefix D:\ai-studio run dev`.
- **FR-07 — The fork's own Docker stack.**
  - `docker-compose.yml` gets `name: ${COMPOSE_PROJECT_NAME:-ai-studio}`. Postgres publishes `127.0.0.1:${POSTGRES_HOST_PORT:-5442}:5432`; the MinIO console `127.0.0.1:${MINIO_CONSOLE_HOST_PORT:-9101}:9001`. `docker-compose.override.yml` publishes `${MINIO_HOST_PORT:-9100}:9000`.
  - `docker-compose.test.yml` gets `name: ${COMPOSE_TEST_PROJECT_NAME:-ai-studio-test}`, DB `ai_studio_test`, ports `${POSTGRES_TEST_HOST_PORT:-5443}:5432`, `${MINIO_TEST_HOST_PORT:-9110}:9000` and `127.0.0.1:${MINIO_TEST_CONSOLE_HOST_PORT:-9111}:9001`.
  - DB names: dev `ai_studio`, test `ai_studio_test`, upgrade scratch `ai_studio_upgrade`. The Postgres user stays `bistec` (a credential, not an identity; changing it gains nothing once the DB names differ).
  - `.env.example` names every variable above with its default, and builds `DATABASE_URL` and `MINIO_ENDPOINT`/`MINIO_PUBLIC_ENDPOINT` on the same ports, with a comment that the two must agree and that the preflight checks it.
  - The local untracked `.env` and `.env.test` are rewritten to the fork stack (party-security BLOCK). Secrets in them are kept; only the stack lines change: `COMPOSE_PROJECT_NAME`, the port variables, `POSTGRES_DB`, `DATABASE_URL`, `MINIO_ENDPOINT`, `MINIO_PUBLIC_ENDPOINT`. The local E2E keeps using the dev stack's Postgres and MinIO, with the `ai_studio_test` database, as it does today.
  - CI (`e2e.yml`) moves to the same identity: Postgres service on `5442:5432` with DB `ai_studio_test`, MinIO `-p 9100:9000`, and the matching `DATABASE_URL`/`MINIO_ENDPOINT`.
  - Scripts that default to `localhost:5432` or `bistec_studio*` use the fork defaults: `scripts/setup-test-db.mjs`, `scripts/test-upgrade-path.mjs`, `scripts/seed-admin.mjs`, `scripts/seed-hearts-talk.mjs`, `scripts/refine-bistec-brandkit.mjs`, and the two E2E files that name the MinIO port or DB (`tests/e2e/agui-refinement.test.ts`, `tests/e2e/brief-draft-recovery.test.ts`).
  - `scripts/setup-test-db.mjs` reaches Postgres with `docker compose exec -T postgres psql …`, never a container name. It gains `--reset`, which drops `ai_studio_test` with `WITH (FORCE)` first. The clean-gate step in the docs becomes `npm run test:e2e:db -- --reset`.
- **FR-08 — The stack preflight** (party-security BLOCK).
  - A pure function `checkStack(env)` in `scripts/lib/stackPreflight.mjs` and a CLI `scripts/stack-preflight.mjs [--env-file <path>]`. It returns a list of refusals; the CLI prints each to stderr and exits 1 when there is one.
  - It refuses when: `COMPOSE_PROJECT_NAME` is `designer`; `DATABASE_URL`'s host is local (`localhost`, `127.0.0.1`, `::1`) and its port is 5432 or 5433, or its database name starts with `bistec_studio`; `MINIO_ENDPOINT` or `MINIO_PUBLIC_ENDPOINT` is local on port 9000 or 9010; `DATABASE_URL` is local and its port differs from `POSTGRES_HOST_PORT` (default 5442); `MINIO_ENDPOINT` is local and its port differs from `MINIO_HOST_PORT` (default 9100).
  - It has no skip flag and no CI bypass: CI uses the fork identity (FR-07).
  - It runs first in `test:e2e:db` (both modes), `db:seed`, `test:upgrade`, and a new `db:migrate` script (`prisma migrate deploy` after the preflight). `docs/cold-start.md` tells developers to use `npm run db:migrate`, not a bare `npx prisma migrate deploy`.
  - It does not run inside the container (`docker-entrypoint.sh`), where `DATABASE_URL` is `postgres:5432` on the compose network.
- **FR-09 — Cold start.** `docs/cold-start.md` documents the fork stack: `docker compose up -d`, the port variables, `npm run db:migrate`, `npm run test:e2e:db -- --reset`, and how to run both clones' stacks at once.
- **FR-10 — Gate and push.** After FR-01 to FR-09: the full gate (tsc, lint, unit, `test:render`, `test:upgrade`, a full clean mock E2E on the fork stack, `npm run build`). Then the scan in `reports/pre-push-scan.md` is re-run over any commit not already scanned (`59f3b222..HEAD`), and its result appended. Then `git remote get-url origin` is checked, and `git push origin v2`. This push is pre-approved by the user once the gate is green and the scan is recorded. Then fork CI is checked with `gh run list --branch v2`.

#### W2: Folio values

- **FR-11 — Restore the files outside the helper graph byte-for-byte from `9f829456`:** `src/app/globals.css`, `src/app/layout.tsx` (Fraunces, Instrument Sans, JetBrains Mono via `next/font`), `tailwind.config.ts` (021's added `ui-xl` radius, `12` opacity and `label` tracking go; `display` and `text` font families return), `src/components/Logo.tsx` (the typeset "Studio" wordmark). `public/BistecStudioLogo.png` is deleted.
- **FR-12 — Restored files.** A UI file is **restored** when 021 changed it and nothing after 021 did (the 021-only set, `design.md` §2.1). Its content equals its `9f829456` content after the fixed import map in `design.md` §3 (`folio` paths to `atoms`/`classes`/`GateNotice`). `scripts/check-folio-restore.mjs` checks this for every file in the list and prints any difference; it runs at the end of W2 and at verify. It is a script, not a unit test, because CI checks out with depth 1 and has no `9f829456`.
  - The helper modules are restored by value: `atoms.ts` holds every export of the 9f829456 `ui/folio.ts` with its Folio value (including `SECTION_NUMERAL`), plus the exports 021 added that code after 021 still imports (`ROW`, `PILL_BADGE`), each given a Folio value from the 9f829456 call site it replaced (`design.md` §3.2). `GateNotice.tsx`, `brandkits/classes.ts`, `campaigns/classes.ts` and `brief/cardCls.ts` likewise.
- **FR-13 — Restyled files.** A UI file is **restyled** when a change after 021 touched it (the overlap set and the 023–031 additions, `design.md` §2.2). Restyled means: it passes `uiTokenGuard` with no allow-list entry; its styling comes from `atoms.ts`, the feature `classes.ts`, the primitives and token utilities, with no Graphite-only utility; and its look follows `DESIGN_SYSTEM.md` (W3). A restyle changes class strings and atom references only. It changes no behaviour, no copy, no `aria-*`, no `data-testid` and no control flow.
- **FR-14 — The guards, flipped to Folio.**
  - `designTokens.test.ts` keeps 021's structure (expected values read from a study file) and reads `docs/ui-reference/direction-studies/study-b-folio.html`. It asserts the three Folio families and that no Graphite family is loaded.
  - `contrast.test.ts` checks the Folio pairs it checked at `9f829456` (status text on its 10 % tint, text on canvas and surfaces, in both themes).
  - `uiTokenGuard.test.ts` drops its Folio deny-list and gains the **Graphite deny-list**, defined by rule (party-architect): (1) the utilities of every Tailwind theme key in the 021 config and absent from the Folio config (`rounded-ui-xl`, `tracking-label`, an opacity modifier `/12`); (2) the Graphite font names (`Plus Jakarta`); (3) `BistecStudioLogo`. It scans `src/app/**` and `src/components/**`, **including** `atoms.ts` and every `classes.ts`. Post font data is out of scope as before (`src/lib/fonts/catalogue.json`, `src/components/admin/brandkits/googleFonts.ts`). Its other checks (legacy colour utilities, glass classes, raw palette colours, copies of shared atoms, `// ui-exception`) are unchanged.
  - `uiTokenGuard` carries a named allow-list, `PENDING_RESTYLE`, of the restyled-set files that still fail after W2. W3 empties it; the guard fails while it is non-empty once W3's last task runs (a `W3_DONE` constant set in that task) (party-architect NOTE).
  - `uiWordingGuard` (031) is unchanged.
- **FR-15 — `SectionHead` numerals.** The restored `SectionHead` takes the optional `numeral` prop again. Screens that passed numerals at `9f829456` pass them again; restyled screens number their sections where Folio did (W3).
- **FR-16 — Docs, part 1.** `CLAUDE.md`'s design-system section names Folio, the typeset wordmark, the Folio study, and the guards' sources. `docs/ui-reference/DESIGN_SYSTEM.md` becomes the `9f829456` Folio version, with every reference to `folio.ts` changed to `atoms.ts`/`classes.ts`. No Graphite archive copy is made (git history holds it; party-po).
- **FR-17 — W2 gate.** tsc, lint, unit, `test:render`, and a full clean mock E2E. Any E2E or unit case that asserts a Graphite class or style is adapted to the Folio one and listed in the task report, never deleted.

#### W3: The 023–031 screens

- **FR-18 — Restyle** every file in `PENDING_RESTYLE` and every other file in the restyled set, by screen group (`design.md` §5). Styling moves into `atoms.ts` or the group's `classes.ts` when two or more files use it, or when a file in the group would otherwise carry a long inline class list (party-visionary: company fixes stay portable as hunks in bodies, not in class strings).
- **FR-19 — `DESIGN_SYSTEM.md` sections for the 023–031 component types** (party-visionary): the post style picker, the image look picker and its notices, the composition/screenshot notice, the facts-check notice, the stale-headline badge, the rule review panel (kit upgrade), the script-font picker, the caption route card, the insights page (data table, rate bar, section), and the Apply to image action. Each section states its anatomy, the atoms and tokens it uses, and its states.
- **FR-20 — Screenshots.** Re-capture `docs/ui-reference/screen-light.png` and `screen-dark.png` with the 031 FR-04 method (the draft review page at 1440 × 1120, newest EXPORTED draft on a mock server, light and dark). Capture every screen with `node scripts/capture-ui.mjs --out ui-captures/032` for the user's review; that folder stays untracked.
- **FR-21 — W3 gate.** `PENDING_RESTYLE` is empty and `W3_DONE` is set. tsc, lint, unit, `test:render`, a full clean mock E2E, `npm run build`, `check-folio-restore.mjs`. Push to `origin v2` after a scan of the new range, and check CI.

### Non-functional requirements

- **NFR-01 — No behaviour change.** No file under `src/lib`, `src/app/api`, `src/providers`, `src/scheduler`, `src/mcp`, `prisma/` or `src/scripts` changes in W2 or W3. `git diff --name-only <W1 tip> HEAD -- src/lib src/app/api src/providers src/scheduler src/mcp prisma src/scripts` is empty at the end, except `src/lib/fonts` if, and only if, a guard carve-out needs no code change (expected: empty).
- **NFR-02 — Light and dark.** Every restored and restyled screen is checked in both themes (screenshots; the a11y E2E suite runs axe in both).
- **NFR-03 — Cost.** Three full E2E runs in all, one per wave gate, plus re-runs of a failing suite only. No real model or image calls.
- **NFR-04 — Safety.** No command in this change touches the company clone's stack or databases. Every DB command runs through a preflighted script or with an explicit `DATABASE_URL` naming `ai_studio_test` or `ai_studio_upgrade`.
- **NFR-05 — Process.** One task at a time: an implementer subagent, then `specclaw:code-reviewer`, then the orchestrator runs tsc, lint and unit and commits to `v2`. Fork `main` is not touched.

## Acceptance criteria

All criteria are `[real]`; nothing is stubbed.

### W1

- **AC-01** — `git log --format=%s <first 032 commit> -1 --name-status` shows exactly `D .github/workflows/docker-publish.yml`, and no `git push` ran before that commit.
- **AC-02** — `tests/unit/forkIdentity.test.ts` passes, and fails when any one of its checks is broken by hand (each check has a negative case in the test file).
- **AC-03** — `Dockerfile` and `docker-entrypoint.sh` are unchanged from `59f3b222` (FR-03).
- **AC-04** — `CLAUDE.md` has one "Current state" section; `grep -nE 'bistec-oss|studio\.bistecglobal\.com|Coolify|COOLIFY' CLAUDE.md` returns nothing outside lines that link to `docs/history.md`; `docs/history.md` holds the moved entries under the banner; `docs/handoff.md`'s first section links to `CLAUDE.md` and restates no state.
- **AC-05** — The seven docs of FR-05 are absent, and `git grep -nE 'devops-deploy-handover|minio-silo-migration|coolify-token-rotation|prod-e2e-findings|scheduler-b4-diagnosis' -- ':!.specclaw' ':!.superpowers'` returns nothing.
- **AC-06** — `.claude/launch.json` names `D:\ai-studio`, and `git grep -nE 'D:\\\\(Bistec|studio|ai-studio)|D:/(Bistec|studio|ai-studio)' -- CLAUDE.md docs/cold-start.md docs/handoff.md` returns nothing in the current-state sections.
- **AC-07** — With the company clone's `designer` stack running, `docker compose up -d` in the fork starts project `ai-studio` with no port or volume conflict; `docker compose ls` lists both `designer` and `ai-studio`.
- **AC-08** — `checkStack` unit cases: refuses `COMPOSE_PROJECT_NAME=designer`; refuses `localhost:5432`, `localhost:5433` and a `bistec_studio_test` DB name; refuses MinIO on `localhost:9000` and `:9010`; refuses a `DATABASE_URL` port that differs from `POSTGRES_HOST_PORT`; accepts the `.env.example` defaults; accepts a non-local host (`postgres:5432`).
- **AC-09** — `npm run test:e2e:db`, `npm run db:seed`, `npm run db:migrate` and `npm run test:upgrade` each exit 1 with a stack refusal on stderr when run with an env pointing at `localhost:5432/bistec_studio_test` (run with a temporary env file; no DB is touched).
- **AC-10** — `prisma migrate deploy` on an empty `ai_studio_test` succeeds (the `--reset` run of `test:e2e:db`), including 022's caption backfill migration (party-ba NOTE).
- **AC-11** — W1 gate: tsc clean; lint 0 errors, ≤ 7 warnings; unit ≥ 4553 passing; render ≥ 154; `test:upgrade` passes; full clean mock E2E ≥ 598 passed / 3 skipped / 0 failed on the fork stack; build passes.
- **AC-12** — `reports/pre-push-scan.md` records the re-scan of `59f3b222..<W1 tip>` and the `origin` check before the push; `origin/v2` equals the W1 tip; the first CI run on it is green.

### W2

- **AC-13** — `globals.css`, `layout.tsx`, `tailwind.config.ts` and `Logo.tsx` equal their `9f829456` content (`git diff 9f829456 HEAD -- <those four>` is empty), and `public/BistecStudioLogo.png` is absent.
- **AC-14** — `node scripts/check-folio-restore.mjs` exits 0: every restored file equals its `9f829456` content under the import map.
- **AC-15** — `designTokens.test.ts` reads `study-b-folio.html` and passes; changing one digit of a colour token in `globals.css` fails it.
- **AC-16** — `uiTokenGuard.test.ts` fails on a scratch line using `rounded-ui-xl`, `tracking-label`, `bg-status-failed/12`, `Plus Jakarta` or `BistecStudioLogo` in a scanned file, including `atoms.ts`; it does not fail on `src/lib/fonts/catalogue.json`.
- **AC-17** — `git grep -nE 'Plus Jakarta|BistecStudioLogo|rounded-ui-xl|tracking-label' -- src tailwind.config.ts` returns only post font data.
- **AC-18** — W2 gate: tsc, lint, unit, render and a full clean mock E2E pass at no lower counts than AC-11 (adapted cases listed in the report).

### W3

- **AC-19** — `PENDING_RESTYLE` is empty and `W3_DONE` is `true` in `uiTokenGuard.test.ts`, and the guard passes.
- **AC-20** — NFR-01's diff is empty.
- **AC-21** — `DESIGN_SYSTEM.md` has a section for each component type FR-19 lists.
- **AC-22** — `screen-light.png` and `screen-dark.png` are new captures showing the Folio wordmark and type; `ui-captures/032/` holds every screen for the user's review.
- **AC-23** — W3 gate: tsc, lint, unit, render, a full clean mock E2E and build pass at no lower counts than AC-11; `check-folio-restore.mjs` exits 0; `origin/v2` equals the W3 tip and CI is green.

## Edge cases

- **A restored file imports a symbol 021 renamed or removed.** The import map covers paths; a symbol 021 removed (e.g. `SECTION_NUMERAL`) is re-exported from `atoms.ts` with its Folio value. If a restored file needs a symbol whose home 021 moved (e.g. `BLOCK` from `team/folio.tsx`), the map names the new home; the import map is the only allowed difference.
- **A restored file's 9f829456 body calls a prop 021 removed from a primitive** (`SectionHead`'s `numeral`). The primitive is restored too, so the prop returns.
- **An atom 021 added has no Folio counterpart** (`PILL_BADGE`, `ROW`). Its value is the inline class the 9f829456 call site used; `design.md` §3.2 records each.
- **A test asserts a Graphite class or style** (`a11y.test.ts`, `surfaces.test.ts`, `uiPrimitives.test.ts`, `noTeamNotice.test.ts`). It is adapted to the Folio value, not deleted, and listed in the report.
- **The developer's `.env` has a real secret.** FR-07's rewrite changes only the stack lines and keeps every other line as it was; the task diffs variable names, never prints values.
- **The company clone's stack is down when AC-07 runs.** AC-07 is checked with both stacks up; if the user's company stack is down, the task starts it with `docker compose -p designer up -d postgres minio` from `D:\Bistec\studio`, which only starts containers on existing volumes, and stops them after. It asks first.
- **Fork CI's first run fails on a CI-only issue** (runner timeout, Chromium launch). Re-run once; a second failure is debugged, not re-run.
- **A post font named "Fraunces" or "Instrument Sans"** appears in the post-font catalogue. It is post data and out of the guard's scope, as 021's carve-out was.

## Out of scope

- Any change to the company repo or the company clone's code or `.env`.
- A deploy workflow for the user's server.
- Reverting 018–031 behaviour, copy or wording (031's glossary and `uiWordingGuard` stay).
- Changing app ports 3000/3001.
- Carrying over local dev data. The fork's new volumes start empty.
- A Graphite archive copy (git history holds it).
- Changing the Postgres user name.

## Panel findings, mapped

| Finding                                                   | Where                                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| party-architect BLOCK: restore rule vs modules            | Approach; FR-11, FR-12                                                                                       |
| party-architect: Graphite deny-list undefined             | FR-14 (rule, scope incl. `atoms.ts`/`classes.ts`)                                                            |
| party-architect: ports without a single source            | FR-07, FR-08 (variables, derivation, drift check, CI)                                                        |
| party-architect: Dockerfile/entrypoint rule               | FR-03, AC-03                                                                                                 |
| party-architect: script order and owners                  | The script ran before planning; `launch.json` FR-06, doc paths FR-04, compose name FR-07                     |
| party-architect NOTE: deny-list wave coupling             | FR-14 `PENDING_RESTYLE`, FR-21                                                                               |
| party-ba: restored vs restyled                            | FR-12, FR-13                                                                                                 |
| party-ba: falsifiable criteria                            | AC-01 to AC-23                                                                                               |
| party-ba: unsourced counts                                | Sizing table                                                                                                 |
| party-ba NOTE: migrate on empty DB                        | AC-10                                                                                                        |
| party-po BLOCK: split                                     | Answered by the user's ruling: one change, three waves; W1 ships alone                                       |
| party-po: cut line                                        | W1, W2, W3; W1 and W3 end in a push                                                                          |
| party-po: E2E count, Graphite archive                     | NFR-03; FR-16 (no archive)                                                                                   |
| party-po NOTE: ports as defaults                          | FR-07                                                                                                        |
| party-security BLOCK: push range                          | FR-10, AC-12, `reports/pre-push-scan.md`                                                                     |
| party-security BLOCK: stale env                           | FR-07, FR-08, AC-08, AC-09                                                                                   |
| party-security: workflow deletion first, guard, secrets   | FR-01, FR-02, AC-01; secrets checked in `pre-push-scan.md`                                                   |
| party-security: move script                               | Done by the user before planning (2026-10-27); this session found and removed the leftover `upstream` remote |
| party-security: `origin` check                            | FR-04, FR-10                                                                                                 |
| party-security NOTE: silo guard                           | FR-02                                                                                                        |
| party-visionary: design-system sections, screenshots      | FR-19, FR-20                                                                                                 |
| party-visionary: portability of company fixes             | FR-13, FR-18                                                                                                 |
| party-visionary: own DB names, one source                 | FR-07, FR-08                                                                                                 |
| party-visionary: one authoritative doc                    | FR-04                                                                                                        |
| party-visionary NOTE: guards derive from the token source | FR-14                                                                                                        |
| party-visionary rebuttal: decide Folio now                | The ruling; no new UI work until W3 lands                                                                    |

## Assumptions

- **A1 — Restored bodies.** The ruling's "only values come from `9f829456`" governs the helper modules: it stops `folio.ts` returning and keeps one helper layer. For a 021-only file, the Folio styling _is_ its 9f829456 body, and nothing after 021 touched it, so restoring that body with the import map is the same result as restyling it, and it is checkable byte for byte. Imports stay pointed at 021's modules, as the ruling requires.
- **A2 — Test-stack compose.** `docker-compose.test.yml` is not used by any script today (local E2E runs on the dev stack with its own DB). It gets the fork identity anyway, so it cannot clash if someone starts it.
- **A3 — Baselines.** From 031's verify (`a511013`): unit 4553, render 154, lint 0 / 7, E2E 598 / 3 / 0 / 0.
