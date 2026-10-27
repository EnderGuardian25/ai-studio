# Party Report: 032-fork-folio-restore

**Reviewed:** 2026-10-26
**Tier:** deep (classifier) — Re-themes about 150 to 200 files from Graphite back to Folio, with Graphite-to-Folio mappings for components that never existed in Folio, and deletes the release workflow docker-publish.yml, which changes release machinery.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet), party-security(opus), party-visionary(opus)
**Verdict:** CHANGES_REQUESTED

## Summary

26 findings: 4 BLOCK, 17 WARN, 5 NOTE upheld — 0 withdrawn

## Findings

### [BLOCK] party-architect — The file-restore rule and the module decision contradict each other: restored files point at helper modules the decision says not to bring back

**Quotes:** > For files 021 changed and nothing after it touched, restore their `9f829456` version.
**Quotes:** > It folded the three `folio.ts` modules into `src/components/ui/atoms.ts` and feature-local `classes.ts` files
**Quotes:** > - Restore the Folio tokens and fonts (Fraunces, Instrument Sans, JetBrains Mono) and the `folio.ts` helper modules, or keep 021's neutral module names with Folio values. Planning picks one.
**Quotes:** > - **Module structure:** keep 021's neutral modules (`src/components/ui/atoms.ts`, feature-local `classes.ts`) and put Folio values in them. Do not restore the three `folio.ts` files.
**Problem:** The proposal says 021 moved the class helpers out of the three `folio.ts` modules and into `atoms.ts` and `classes.ts`. That makes the files 021 changed, as they stood at `9f829456`, the consumers of `folio.ts`. If those files are restored as they were, while `atoms.ts` and `classes.ts` stay and `folio.ts` does not come back, there are two possible results. In the first, the restored files import modules that no longer exist, and the merge half-lands. In the second, someone restores `folio.ts` so those imports resolve, and the codebase ends up with two helper layers for the same classes. The rule also does not cover the files 021 created (`atoms.ts`, `classes.ts`) or deleted (`folio.ts`, the logo). "Restore the `9f829456` version" means something different for each of those. Item 1 still says "Planning picks one" although the Decisions section has already picked. An implementer gets two rules that conflict. Round 2 changed nothing here. party-ba's first WARN reaches the same ambiguity from the acceptance side: it counts three readings of "Folio", one of them this module decision. That supports the finding.
**Fix:** Drop the blanket restore rule for any file that uses the helper modules. State that 021's module structure and imports stay. Only the token and class values come from `9f829456`, along with the files outside the helper graph: fonts, wordmark and guards. Delete "or keep 021's neutral module names … Planning picks one" from item 1 so that it matches the decision.
**Status:** upheld

### [WARN] party-architect — The "Graphite deny-list" is a new guard contract with no definition

**Quotes:** > - Restore the Folio guards and tests (`designTokens`, `contrast`, `uiTokenGuard`, including the legacy and Graphite deny-list). Keep 031's `uiWordingGuard`.
**Problem:** `9f829456` predates Graphite, so the guard being restored from it cannot contain a Graphite deny-list. That part is new work, not a restore. The proposal does not say what goes on the list: Graphite token names, utility classes, raw colour values, or the logo path. It also does not say how the list treats the neutral `atoms.ts` names the decision keeps. If the Graphite token names were themselves neutral, the list could reject the modules this change keeps. Two implementers would write two different guards, and this guard is the only deterministic check that "Folio on every screen" holds. party-visionary's NOTE on the same line covers the long-horizon cost of a growing deny-list. That is a separate point, so this finding stands.
**Fix:** List the deny-list entries in the proposal, or give the rule that produces them (for example "every token and class name in the Graphite `DESIGN_SYSTEM.md` that is absent from Folio's"). State whether the guard scans `atoms.ts` and `classes.ts` or exempts them.
**Status:** upheld

### [WARN] party-architect — The port change has no single source, and the test stack and CI wiring are not specified

**Quotes:** > Give the fork its own compose project name (`ai-studio`) and its own host ports for Postgres and MinIO, set through `.env` with fork defaults that do not clash with the company clone's `designer` stack. Update `.env.example`, `docs/cold-start.md`, the E2E DB scripts and the test compose file to match.
**Quotes:** > 1. Fork host ports: the proposal assumes Postgres `5442`, MinIO `9100`/`9101`, and test stack `5443`/`9110`. Any preference?
**Problem:** A host port is used in two places: compose publishes it, and every connection string the app and scripts use points at it. "Set through `.env`" does not say which variables hold the port. It also does not say whether connection URLs are built from those variables or repeat the number. The test stack has its own ports, and the proposal does not say which env file supplies them. Nor does it say whether CI's E2E job, which must end green, moves to the new ports. Renaming the project also changes the container names the proposal itself cites (`designer-postgres-1`, `designer-minio-1`), so anything that addresses a container by name has to change in the same commit. Two other round-1 findings land on the same line. party-security's BLOCK (a stale `.env`/`.env.test` silently targets the company stack) and party-visionary's WARN (database names are shared; there is no single source) are both consequences of this under-specified contract. They add weight to it and do not replace it.
**Fix:** Name the exact variables: the host port variables for dev and test, and how `DATABASE_URL` and the MinIO endpoints are built from them. Name the env file each stack reads. State whether CI's E2E job is affected. State that no script or doc may hard-code a container name; each must use the project name or `docker compose exec`.
**Status:** upheld

### [WARN] party-architect — "Keep what a fresh deploy needs" is not a decidable rule for the Dockerfile and entrypoint

**Quotes:** > Review 022's `Dockerfile` and entrypoint edits, and keep what a fresh deploy needs.
**Quotes:** > - A deploy workflow for the user's server (later, written fresh).
**Problem:** The deploy target is out of scope and undefined, so nothing in the proposal defines "what a fresh deploy needs". The image is still a shared contract: `e2e.yml` runs `docker build .`, and the entrypoint decides what runs at boot. One implementer will keep every 022 edit; another will revert to `9f829456`. The text allows both.
**Fix:** List the 022 `Dockerfile` and entrypoint edits in the proposal, each marked keep or revert. Or state a concrete criterion, for example "revert anything that references the company registry, Coolify or `studio.bistecglobal.com`; keep everything else".
**Status:** upheld

### [WARN] party-architect — The folder-move script is both in this change's scope and a prerequisite to planning, so the `launch.json` and path co-changes have no owner

**Quotes:** > - A PowerShell script, outside the repo, that the user runs after closing Claude Code. It moves the fork to `D:\ai-studio` and the company clone `D:\studio` to `D:\Bistec\studio`, moves the matching Claude memory folders, and pins the company clone to the existing `designer` Docker volumes.
**Quotes:** > - **Local split:** separate Docker stacks. The fork moves to `D:\ai-studio`, and the company clone `D:\studio` moves to `D:\Bistec\studio`, by a user-run script **before** planning. `.claude/launch.json` hard-codes `D:\Bistec\designer` and must point at the new path.
**Problem:** Scope lists the script as a deliverable of this change. The Decisions section says the script runs before planning, which is before this change exists. Three edits depend on the move, and none has an owner: the `.claude/launch.json` path, the new-paths entry in `CLAUDE.md` and `handoff.md`, and the fork's compose project rename (the company clone's `COMPOSE_PROJECT_NAME=designer` pin has to match it). The proposal does not say whether each one lands in a repo commit or in the script. If the script runs first, the fork's compose still says `designer` until this change merges. If it runs last, the build and the gate run from the old path. party-security's two script findings cover how the script fails and how memory is routed. Neither assigns these edits, so this finding stands.
**Fix:** Pick one order and state it. Then assign each path-dependent edit (`launch.json`, the doc paths, the compose project name) either to the script or to a named commit in this change.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po's wave cut line: the restored guard and the 023–031 restyle cannot land in separate waves

**Quotes:** > - Restore the Folio guards and tests (`designTokens`, `contrast`, `uiTokenGuard`, including the legacy and Graphite deny-list). Keep 031's `uiWordingGuard`.
**Quotes:** > For files 023–031 changed after 021, keep their behaviour and restyle them with the Folio primitives and tokens.
**Problem:** party-po's second WARN proposes a wave 1 of "tokens, fonts, wordmark, guards and the `atoms.ts` values" and a wave 2 of the per-feature 023–031 screens. This is a coupling fact, not a judgement on which order ships first. The guard this proposal restores fails on Graphite usage, and the 023–031 files keep Graphite styling until they are restyled. Wave 1 as drawn therefore fails its own gate: the guard goes red on every 023–031 file still waiting for wave 2. A cut line is still possible, but wave 1 can include only the Folio-value half of the guards. The Graphite deny-list, or the guard's scan of the feature-local `classes.ts` and 023–031 component files, has to land in the same commit as the restyle of the files it scans. The other way is an explicit, shrinking allow-list that wave 2 empties. The finding stays party-po's to keep or withdraw.
**Fix:** If the change is split into waves, put the deny-list half of `uiTokenGuard` in the wave that restyles the files it scans. Or ship it in wave 1 with a named allow-list of the files not yet restyled, which the last wave must empty.
**Status:** upheld

### [WARN] party-ba — The re-theme is justified by a design preference, but "Folio" is the success target and is never defined for components that never existed in it

**Quotes:**

> For files 023–031 changed after 021, keep their behaviour and restyle them with the Folio primitives and tokens.
> Changing app ports 3000/3001.
> Size:** architectural. It is a re-theme across about 150 files, with a Graphite → Folio mapping for components that never existed in Folio. That needs a design pass.
> **Problem:** "Folio" carries two meanings in the build. One is the tree at `9f829456`: a literal restore of files. The other is a design language to apply to roughly 100 components that have no Folio reference. The proposal says "Folio back, on every screen", but "every screen" includes screens that never had a Folio version. The fork's guards (`uiTokenGuard`, `contrast`) can only check tokens, so "looks like Folio" has no observable test for the new components. The "Decisions" section also says "Put Folio values in" 021's neutral modules, which is a third reading: module names stay Graphite-era but the values are Folio. Two builders would produce different results.
> **Fix:** Define "restored" (byte-identical to `9f829456`) separately from "restyled" (token-compliant only). State which guards decide the second category.
> **Status:** upheld

### [WARN] party-ba — The stated problem (Graphite, company deploy, company identity, shared stack) has no acceptance criteria, and the main goal "every screen is Folio" cannot fail

**Quotes:**

> Folio back, on every screen.
> Items 1–4 above, in light and dark themes, with the full gate: tsc, lint, unit, `test:render`, and a full clean mock E2E on the fork's own stack.
> **Problem:** The proposal has no acceptance-criteria section. The only ship-time check named is the existing gate, and that gate passes whatever theme is shipped. Restoring `uiTokenGuard` makes the guard pass on Folio, but the proposal never says which screens or which observation would show a screen is still on Graphite. There is also no check that no company reference remains in the docs or CI, and none that the two Docker stacks do not clash. The gate's green result cannot fail on any of the four stated problems.
> **Fix:** Add falsifiable criteria. For example: a grep for Graphite classes or `BistecStudioLogo` returns nothing. `docker-publish.yml` is absent. No `bistec-oss` or `studio.bistecglobal.com` string remains in the live docs. Both stacks can run `docker compose up` at once without a port or volume conflict.
> **Status:** upheld

### [WARN] party-ba — The counts that size the work are unsourced and internally inconsistent

**Quotes:**

> 021 touched about 94 files under `src/` and `tests/`.
> about 104 files under `src/components` and `src/app` changed after 021
> **Files affected:** about 150–200 (estimated)
> **Problem:** The figures are given as "about" and "estimated", with no derivation. Even on the proposal's own numbers, 94 files from 021 plus 104 from 023–031 is up to 198 before the docs, tests and CI work. The restore-versus-restyle split depends on how many of 021's 94 files were later touched, and the proposal never gives that overlap. The scope and the "architectural" label rest on these numbers.
> **Fix:** Cite the commands that produced the counts (for example `git diff --stat 9f829456..021`), and give the overlap between the two sets.
> **Status:** upheld

### [NOTE] party-ba — "Fresh start" is assumed to carry over to a database that already has the 022 migration applied

**Quotes:**

> Keep 022's caption backfill migration: it is a no-op on a fresh DB and keeps migration history intact.
> The fork starts with empty volumes (fresh start).
> **Problem:** The claim that the migration is a no-op rests on the DB being empty. Nothing says every environment the fork will meet is empty, so a developer with an old fork DB could see a different result. This is probably safe, because the user chose a fresh start. It is also not actually verified: no check states that the migration runs cleanly on an empty DB.
> **Fix:** Add a criterion that a `migrate deploy` on an empty DB succeeds.
> **Status:** upheld

### [BLOCK] party-po — A 150-200 file re-theme is priced as the only option; the cheaper variant (keep Graphite, ship the other three items) is never considered

**Quotes:**

> **Size:** architectural. It is a re-theme across about 150 files, with a Graphite → Folio mapping for components that never existed in Folio.
> **Files affected:** about 150–200 (estimated)
>
> 1. **Graphite instead of Folio.** Change 021 re-themed the app from Folio ... because the company "wants this system to look different from the fork".
>    **Problem:** Re-checked against the proposal's Decisions section. It records the user's choices (neutral modules with Folio values, delete the company docs) but still states no value for the Folio restore itself. It also doesn't price the do-nothing option of staying on Graphite. The only stated reason for Graphite, the company's wish, no longer applies, so the real value is the user's preference, which the proposal never names or compares with the cost. The "keep 021's neutral modules" decision does partly adopt a token-only approach, which lowers the cost. That is a good sign, but the proposal still sizes the work at 150-200 files and does not weigh the value against that price. Items 2-4 remain cheap and independent of item 1.
>    **Fix:** Split the change. Ship items 2-4 first, then run the Folio re-theme as its own change with its own value statement. In that statement, name the do-nothing cost of staying on Graphite and compare the token-only variant with the file restore.
>    **Status:** upheld

### [WARN] party-po — "Restore" and "restyle" are two different costs bundled under one line, with no cut line

**Quotes:**

> For files 021 changed and nothing after it touched, restore their `9f829456` version. For files 023–031 changed after 021, keep their behaviour and restyle them with the Folio primitives and tokens.
> Planning picks one.
> **Problem:** Restoring untouched files is mechanical. Restyling the roughly 104 files built after 021 is the costly, risky part. The proposal names no shippable intermediate, so the re-theme is all-or-nothing. The "Planning picks one" line is now settled by the module-structure decision, but the proposal still doesn't say how the work splits into waves.
> **Fix:** Name the cut line. Wave 1: tokens, fonts, wordmark, guards and the `atoms.ts` values. Wave 2: the per-feature 023-031 screens. State which waves are worth shipping on their own.
> **Status:** upheld

### [WARN] party-po — Running cost of the full gate and the screenshot/doc restoration is not stated

**Quotes:**

> Items 1–4 above, in light and dark themes, with the full gate: tsc, lint, unit, `test:render`, and a full clean mock E2E on the fork's own stack.
> Restore the Folio `DESIGN_SYSTEM.md` and screenshots, and archive the Graphite version under `docs/ui-reference/archive/graphite/`.
> **Problem:** The proposal gives no number of full E2E reruns (the suite is about 600 cases) and no estimate of the operator attention needed to review light and dark screens. The second archive keeps a theme the user is discarding, and git history already holds it.
> **Fix:** State the expected number of full E2E runs (for example, one per wave). Drop the Graphite archive unless a named reason requires it.
> **Status:** upheld

### [NOTE] party-po — Fork port defaults: pick them now rather than leave an open question

**Quotes:**

> 1. Fork host ports: the proposal assumes Postgres `5442`, MinIO `9100`/`9101`, and test stack `5443`/`9110`. Any preference?
>    **Problem:** The proposal already assumes values, and `.env` can override them. The question adds a prompt for little value.
>    **Fix:** Adopt the assumed ports as defaults, note that `.env` overrides them, and drop the open question.
>    **Status:** upheld

### [BLOCK] party-security — Pushing 202 company commits to the fork is irreversible, and deleting files at HEAD does not redact them

**Quotes:**

> Push `v2` to `origin` (the fork) and confirm fork CI is green.
> They stay in git history and in the company repo.
> Local `v2` was fast-forwarded `1c38dbb9 → 59f3b222`. The `upstream` and `company` remotes were removed, so `origin` (the fork) is the only remote. Nothing is pushed yet.
> **Problem:** The push publishes the whole range `1c38dbb9..59f3b222` to the fork. That range contains company DevOps material: `devops-deploy-handover.md`, the Coolify redeploy workflow, and prod hostnames and resource details. The proposal deletes these docs only at HEAD, and it says outright that they "stay in git history". Once the push lands, that history is out of the operator's control, and deleting the files does not undo it. No step scans the range for credentials, tokens, Coolify UUIDs or prod IDs before it leaves the machine. The proposal gives no recovery path, and a force-push afterwards does not recall clones or cached views. No seat disputed this entry point in round 1. PO's proposed split (ship items 2–4 first) would bring the push forward, which makes a pre-push gate more urgent, not less.
> **Fix:** Add a pre-push gate before the first push:

- Run a secret scan over every commit in `1c38dbb9..59f3b222`, not just the HEAD tree.
- Grep the same range for company prod identifiers: Coolify resource UUIDs, `COOLIFY_`, company registry paths, prod DB and host strings.
- Block the push on any hit, and get an explicit go-ahead from the user on the result.
- Record the scan output in the change's reports so the decision can be audited.
  **Status:** upheld

### [BLOCK] party-security — A stale local `.env` or `.env.test` silently keeps the fork pointed at the company stack, including the destructive test-DB reset

**Quotes:**

> Give the fork its own compose project name (`ai-studio`) and its own host ports for Postgres and MinIO, set through `.env` with fork defaults that do not clash with the company clone's `designer` stack. Update `.env.example`, `docs/cold-start.md`, the E2E DB scripts and the test compose file to match.
> Once the two codebases diverge, one repo's migrations can break the other's local DB.
> **Problem:** The proposal updates only `.env.example`. The fork's local `.env` and `.env.test` are untracked and still carry the old `DATABASE_URL` and MinIO endpoint on the shared ports.

- A missing compose variable falls back to a safe default, but a stale connection string does not.
- `prisma migrate deploy`, the seed scripts and the clean-gate `DROP DATABASE ... WITH (FORCE)` would then run against the company clone's `bistec_studio` / `bistec_studio_test`. That is exactly the harm item 4 exists to prevent.
- Nothing would signal it. The fork's own containers would sit idle while the E2E run "passes" against the company DB, so the failure looks the same as success.

Round 1 strengthened this finding. Visionary found that the database names stay identical across both stacks, so a misdirected command succeeds instead of failing. Architect found that no single source carries the port into the connection strings.
**Fix:**

- Rewrite the fork's local `.env` and `.env.test` as part of the change, or have the script do it. Updating `.env.example` alone is not enough.
- Add a preflight to the E2E DB scripts and to the migrate and seed entry points. It resolves the target host:port and container, and refuses (non-zero exit, message on stderr) when either matches the `designer` stack's ports or container names.
- Give the fork its own database names, as Visionary proposed, so a misdirected command fails with "database does not exist" instead of succeeding.
- Never address the DB by a hard-coded `designer-postgres-1` container name in fork scripts or docs.
  **Status:** upheld

### [WARN] party-security — The live company deploy workflow is in the tree that will be pushed, and the proposal does not order its deletion first

**Quotes:**

> Change 022 restored `.github/workflows/docker-publish.yml`: the GHCR push to the company registry, the Coolify redeploy of company prod and the `/api/health` check against `studio.bistecglobal.com`.
> Delete `.github/workflows/docker-publish.yml`.
> Push `v2` to `origin` (the fork) and confirm fork CI is green.
> **Problem:** Local `v2` contains a workflow whose job is to push images and trigger a redeploy of company prod. The proposal lists its deletion as item 2 of a change of about 150 files. It never says the deletion must land before any intermediate push, such as a push made mid-build to protect against drive failure. If the workflow reaches the fork with Actions enabled, it runs on the fork's triggers. Without secrets it will most likely fail, but that depends on the fork never holding a Coolify or registry secret, and the proposal does not say so.
> **Fix:**

- Make deleting `docker-publish.yml` the first commit of the change, before any push.
- Add a CI or unit guard that fails if any workflow under `.github/workflows/` references `coolify`, the company registry path or `studio.bistecglobal.com`.
- Confirm that the fork's repo secrets contain no `COOLIFY_*` token.
  **Status:** upheld

### [WARN] party-security — The folder-and-memory move script has no preflight, no log and no rollback, so a partial run fails silently

**Quotes:**

> A PowerShell script, outside the repo, that the user runs after closing Claude Code. It moves the fork to `D:\ai-studio` and the company clone `D:\studio` to `D:\Bistec\studio`, moves the matching Claude memory folders, and pins the company clone to the existing `designer` Docker volumes.
> The script only moves the folder and adds `COMPOSE_PROJECT_NAME=designer` to its `.env`.
> **Problem:** The script makes four dependent moves and one `.env` edit, outside any agent session, and the proposal states no failure behaviour.

- A locked file can stop it partway, for example a stray node process holding `.next` or a Docker bind mount. The repo may then be moved without its memory folder, or the company clone moved without being pinned.
- An unpinned company clone at `D:\Bistec\studio` comes up under a new project name with empty volumes. That looks like data loss and invites a re-seed into the wrong volumes.
- Appending to a `.env` that already defines `COMPOSE_PROJECT_NAME` creates a duplicate key, and which value wins is unclear.
- The operator gets no record of which steps completed.

Architect's round-1 finding, that the order of the script relative to the change is undefined, makes a partial or mis-ordered run more likely.
**Fix:**

- Check every precondition before moving anything: no process holds files under either tree, no target path exists, and each `.env` is present.
- Run each step with `-ErrorAction Stop` and log it. On failure, print the exact reverse moves.
- Set `COMPOSE_PROJECT_NAME` idempotently: replace it if present, append it if absent.
- After the move, run `docker compose ls` to verify that the company clone resolves to `designer`.
  **Status:** upheld

### [WARN] party-security — Moving the folders and memory can hand fork instructions to the company clone, whose `origin` can push to the company repo

**Quotes:**

> moves the matching Claude memory folders
> Plus the new local paths: fork `D:\ai-studio`, company clone `D:\Bistec\studio`.
> **Problem:** Claude memory is keyed by folder path, and the script re-pairs memory folders with repo folders by hand. The fork's memory says "this repo is the fork, `origin` is the fork, push to `origin`". If the script pairs that memory with the company clone, or a session is opened in the wrong folder, a session in the company clone loads it. Following those instructions as written would push fork work to the company repo. The new and old path keys do not overlap automatically, so the entry point is the script's pairing step and nothing else. Even so, the proposal relies on folder identity alone to route these instructions, and no seat argued otherwise.
> **Fix:**

- In the script, check `git remote get-url origin` in each folder before moving its memory folder, and abort on any mismatch.
- In the new `CLAUDE.md` and `handoff.md` top entries, require checking `git remote get-url origin` against `EnderGuardian25/ai-studio` before any push.
  **Status:** upheld

### [NOTE] party-security — The silo image is promised in the docs but not enforced, and this change edits the compose files and deletes the runbook that explained it

**Quotes:**

> **Object storage:** state that silo (`pgsty/silo`, pinned by digest) is already the fork's MinIO image in compose and CI, so a fresh deploy needs no MinIO migration.
> **Problem:** The change edits the test compose file and the E2E scripts, and it deletes `docs/minio-silo-migration.md`. After that, the only protection against a regression to a withdrawn or vulnerable MinIO image is one sentence in the docs, and a fresh deploy would trust it.
> **Fix:** Add a unit guard asserting that every compose file and `e2e.yml` reference the `pgsty/silo` image by digest.
> **Status:** upheld

### [WARN] party-visionary — The restored Folio DESIGN_SYSTEM.md predates every component the next UI change will copy

**Quotes:**

> Restore the Folio `DESIGN_SYSTEM.md` and screenshots, and archive the Graphite version under `docs/ui-reference/archive/graphite/`.
> **Size:** architectural. It is a re-theme across about 150 files, with a Graphite → Folio mapping for components that never existed in Folio. That needs a design pass.
> **Problem:** The Folio doc and screenshots at `9f829456` were written before 023–031, so they cover none of the post styles, image looks, hero reference images, stale-headline badge or 031 polish. The design pass that maps those components to Folio is the only place those decisions are made, and the proposal records them only in the restyled code. After this change, the only written description of those component patterns is the archived Graphite doc. The next change that adds a picker or badge of this kind (020, or 009's hero imagery) will find nothing in `DESIGN_SYSTEM.md`. Its author will either copy the archived Graphite spec or invent a third mapping. The reference screenshots will show an app without any of the 023–031 surfaces, and that gap grows with every change. Round 2 note: party-po's call to drop the Graphite archive makes this sharper, not weaker. Dropping the archive removes the wrong template, but the right one still does not exist until the design pass writes it down.
> **Fix:** Make the design pass's output a deliverable: a Folio `DESIGN_SYSTEM.md` section for each component type 023–031 introduced, plus screenshots re-captured from the current app, rather than the verbatim `9f829456` doc.
> **Status:** upheld

### [WARN] party-visionary — Restyling 023–031 inside their own files rewrites most UI files, so company fixes can't be cherry-picked, and the proposal never weighs that

**Quotes:**

> There are no future company merges (user decision).
> For files 023–031 changed after 021, keep their behaviour and restyle them with the Folio primitives and tokens.
> **Problem:** The proposal rules out future merges but says nothing about cherry-picks. The company repo continues past `59f3b222`, and its later fixes will touch the same files: a race in the stale-headline badge, a fix to an image-look route, a settle-timing fix like 015's. Because this change rewrites styling inside the files that hold the behaviour, almost every hunk of a later company fix will conflict over class strings that have nothing to do with the fix. "Only the styling changes" is true on merge day. A year on, it means the fork has given up cheap access to fixes for code the two repos still share in substance. Removing the remotes can be undone; the per-file divergence cannot, and it grows. Round 2 note: party-architect's BLOCK fix (keep 021's module structure and imports, and take only the values from `9f829456`) is the same lever this finding asks for. If it is adopted, it shrinks this cost substantially, but only if the 023–031 restyle also goes through `atoms.ts`/`classes.ts` rather than component bodies. The proposal still says neither.
> **Fix:** State in the proposal that porting company fixes becomes manual re-implementation. Or, where it costs little, put the Folio styling in the `classes.ts`/`atoms.ts` layer rather than in component bodies, so behaviour hunks still apply across the two repos.
> **Status:** upheld

### [WARN] party-visionary — The fork's stack identity lives in five places, while the database names, the one thing that tells the stacks apart, stay identical

**Quotes:**

> Give the fork its own compose project name (`ai-studio`) and its own host ports for Postgres and MinIO, set through `.env` with fork defaults that do not clash with the company clone's `designer` stack. Update `.env.example`, `docs/cold-start.md`, the E2E DB scripts and the test compose file to match.
> Fork host ports: the proposal assumes Postgres `5442`, MinIO `9100`/`9101`, and test stack `5443`/`9110`. Any preference?
> on the same ports and the same database names (`bistec_studio`, `bistec_studio_test`)
> **Problem:** The port numbers and the compose project name (and the container name derived from it) get written into `.env` defaults, `.env.example`, `cold-start.md`, the E2E DB scripts and the test compose file, and probably `.env.test` and the CI service config too. Nothing derives one copy from another. The proposal names the shared database names as part of the problem, but the solution leaves them identical. So when a port or container name in any doc or script drifts, the command still succeeds: it just runs against the company clone's `bistec_studio_test`. Two future cases hit this: the next change that edits the E2E DB script, and an agent following the existing "drop and recreate the test DB" step that names `designer-postgres-1`. Either one drops the other repo's test DB with no error, and nobody notices until the company clone's next E2E run fails for no apparent reason. Round 2 note: party-security's stale-`.env` BLOCK is the merge-day instance of this, and party-architect's single-source WARN covers the variables. Distinct database names remain the one long-horizon backstop neither seat proposes: they turn every future drift into "database does not exist" instead of silent success.
> **Fix:** Name one source (the `.env`/compose variables) and have scripts and docs read it rather than restate it. Give the fork its own database names (for example `ai_studio`, `ai_studio_test`), so a misdirected command fails loudly.
> **Status:** upheld

### [WARN] party-visionary — The proposal writes the same status entry and absolute local paths into several files again, the duplication that already made CLAUDE.md drift

**Quotes:**

> **`docs/handoff.md`:** the same top entry, plus a "resume after the folder move" checklist.
> Plus the new local paths: fork `D:\ai-studio`, company clone `D:\Bistec\studio`.
> `.claude/launch.json` hard-codes `D:\Bistec\designer` and must point at the new path.
> **Problem:** The fact "this is the fork, one-time sync, fresh start, no deploy" goes into `CLAUDE.md` and `docs/handoff.md` as two copies of one entry. The absolute paths go into `CLAUDE.md`, `handoff.md`, `.claude/launch.json` and the memory-folder layout. Any later change to one of these facts has to find and edit every copy: the user's deploy workflow (which voids "nothing deploys yet"), or another folder move. The repo's history shows what happens when one copy is missed. The current `CLAUDE.md` carries pages of "(superseded)" entries that still state company remotes, `designer-postgres-1` and Coolify to-dos as instructions. This change adds one more top entry to that pile and fixes only the references to deleted docs. Round 2 note: party-security's fix (an `origin` check in both top entries) is sound, but it adds a third duplicated fact to the two copies. That makes a single authoritative entry more pressing.
> **Fix:** Make one file authoritative for current state and have the other link to it, not restate it. Keep absolute paths only in `launch.json`, or derive them from the repo root, so the next folder move edits one file.
> **Status:** upheld

### [NOTE] party-visionary — The neutral token modules are one step from making the next re-theme a value swap, but the guards still hard-code the theme

**Quotes:**

> **Module structure:** keep 021's neutral modules (`src/components/ui/atoms.ts`, feature-local `classes.ts`) and put Folio values in them. Do not restore the three `folio.ts` files.
> Restore the Folio guards and tests (`designTokens`, `contrast`, `uiTokenGuard`, including the legacy and Graphite deny-list). Keep 031's `uiWordingGuard`.
> **Problem:** This is the third full re-theme: 011 to Folio, 021 to Graphite, and now 032 back to Folio. Each one rewrote the guard tests along with the values, and each adds the abandoned theme to a deny-list that only grows. Theme-neutral module names are the right seam. But the guards are being restored as Folio-specific assertions, and the styling is spread across feature-local `classes.ts` files instead of being drawn from one token source. So the next theme change, or a second theme for the user's own deployment, will again touch the guards and every `classes.ts`. Round 2 note: party-architect's WARN that the Graphite deny-list is undefined is the merge-day face of the same problem. A guard that checks structure (tokens come from the token module) instead of identity (no Graphite names) needs no deny-list to define.
> **Fix:** While the guards are being rewritten anyway, have `designTokens`/`contrast` derive their expected values from the token module rather than restating them. Have the `classes.ts` files compose from `atoms.ts` tokens instead of raw values. A future theme change then edits one file, and the guards check structure rather than one theme's identity.
> **Status:** upheld

### [WARN] party-visionary — Rebuttal of party-po's BLOCK: deferring or dropping Folio is not cost-neutral, because every queued UI change built on Graphite in the meantime enlarges the later re-theme

**Quotes:**

> Changes 023–031 then built new UI on Graphite (about 104 files under `src/components` and `src/app` changed after 021): hero reference images, post styles, image looks, the stale-headline badge, the final polish and more.
> **Problem:** party-po's fix treats "ship items 2–4 now, and treat Folio as a separate change or drop it" as the cheap variant. On the long horizon, only "drop it" is cheap. "Defer it" is the most expensive option on the table. The proposal's own line shows how fast the cost grows: ten changes after 021 put about 104 UI files on Graphite, and that is exactly why this re-theme is sized at 150–200 files. The fork already has UI work queued: 020 (Create post button), and 009's hero imagery from the 006–010 proposals. Each of those built on Graphite becomes one more component to map later, with no Folio reference. Ordering the cheap items first is sound. Letting further UI changes land before the theme decision is not. "Drop it" has its own long-horizon cost: the fork's `DESIGN_SYSTEM.md` history, the user's recorded 2026-10-07 Folio pick, and the `uiTokenGuard` contract would all have to be rewritten to adopt Graphite deliberately. Otherwise the fork lives with code on one theme while its decisions say another. This finding does not contest the split. It contests the claim that the deferred variant is cheap.
> **Fix:** If the change is split, either decide Folio-or-Graphite now and record it, or state that no UI change (020, 009 and the rest) starts until the re-theme lands. Do not leave the theme deferred while new UI accrues on Graphite.
> **Status:** upheld

## Dissent

No withdrawals.
