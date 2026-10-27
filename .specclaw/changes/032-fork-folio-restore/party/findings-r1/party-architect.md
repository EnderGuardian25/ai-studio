### [BLOCK] party-architect — The file-restore rule and the module decision contradict each other: restored files point at helper modules the decision says not to bring back

**Quotes:** > For files 021 changed and nothing after it touched, restore their `9f829456` version.
**Quotes:** > It folded the three `folio.ts` modules into `src/components/ui/atoms.ts` and feature-local `classes.ts` files
**Quotes:** > - Restore the Folio tokens and fonts (Fraunces, Instrument Sans, JetBrains Mono) and the `folio.ts` helper modules, or keep 021's neutral module names with Folio values. Planning picks one.
**Quotes:** > - **Module structure:** keep 021's neutral modules (`src/components/ui/atoms.ts`, feature-local `classes.ts`) and put Folio values in them. Do not restore the three `folio.ts` files.
**Problem:** The proposal says 021 moved the class helpers out of the three `folio.ts` modules and into `atoms.ts`/`classes.ts`. So in the `9f829456` tree, the files 021 changed were the consumers of `folio.ts`. Restoring those files wholesale while keeping `atoms.ts`/`classes.ts` and not restoring `folio.ts` leaves two outcomes. Either the restored files import modules that do not exist, which is a half-landed merge. Or someone brings `folio.ts` back to satisfy them, and the codebase then has two helper layers for the same classes (`folio.ts` and `atoms.ts`), which is a second source of truth. The rule also says nothing about the files 021 created (`atoms.ts`, `classes.ts`) or deleted (`folio.ts`, the logo), and "restore the `9f829456` version" means something different for each of those. The Proposed Solution still says "Planning picks one" when the Decisions section has already picked, so the text gives an implementer two conflicting rules.
**Fix:** Drop the blanket "restore their `9f829456` version" rule for any file that consumes the helper modules. State that 021's module structure and imports stay, and that only the token and class values (and the files outside the helper graph, such as fonts, wordmark and guards) are taken from `9f829456`. Strike "or keep 021's neutral module names … Planning picks one" from item 1 so it matches the decision.
**Status:** upheld

### [WARN] party-architect — The "Graphite deny-list" is a new guard contract with no definition

**Quotes:** > - Restore the Folio guards and tests (`designTokens`, `contrast`, `uiTokenGuard`, including the legacy and Graphite deny-list). Keep 031's `uiWordingGuard`.
**Problem:** The baseline is `9f829456`, which comes before Graphite existed. So the guard being "restored" can hold no Graphite deny-list: that part is new, not a restore. The proposal does not say what goes on the list: Graphite token names, utility classes, raw colour values, or the logo path. It also does not say how the list relates to the neutral `atoms.ts` names the decision keeps. If the Graphite token names were neutral, denying them could reject the very modules being kept. Two implementers would write two different guards, and the guard is the only deterministic check that "Folio on every screen" holds.
**Fix:** List the deny-list entries in the artifact, or the rule that produces them (for example "every token and class name present in the Graphite `DESIGN_SYSTEM.md` and absent from Folio's"). State whether the guard scans `atoms.ts`/`classes.ts` or exempts them.
**Status:** upheld

### [WARN] party-architect — The port change has no single source, and the test stack and CI wiring are not specified

**Quotes:** > Give the fork its own compose project name (`ai-studio`) and its own host ports for Postgres and MinIO, set through `.env` with fork defaults that do not clash with the company clone's `designer` stack. Update `.env.example`, `docs/cold-start.md`, the E2E DB scripts and the test compose file to match.
**Quotes:** > 1. Fork host ports: the proposal assumes Postgres `5442`, MinIO `9100`/`9101`, and test stack `5443`/`9110`. Any preference?
**Problem:** A host port is consumed in two places: by compose, which publishes it, and by every connection string the app and scripts use to reach it. "Set through `.env`" does not say which variables carry the port, or whether connection URLs are derived from them or repeat the number. If the number is repeated, a later port change edits one file and silently misses the other. The test stack has its own ports (`5443`/`9110`), but the proposal does not say which env file supplies them. Nor does it say whether the CI workflow, which runs the "full clean mock E2E" and must be green, uses the new ports or keeps its own. The project rename also changes the container names the proposal itself cites (`designer-postgres-1`, `designer-minio-1`), and anything that addresses containers by name has to change in the same commit. The proposal names the E2E DB scripts, but not the rule they should follow.
**Fix:** Name the exact variables (host port vars for dev and test, and how `DATABASE_URL`/MinIO endpoints derive from them) and the env file each stack reads. State whether CI's E2E job is affected. State that no script or doc may hard-code a container name, and that each must use the project name or `docker compose exec`.
**Status:** upheld

### [WARN] party-architect — "Keep what a fresh deploy needs" is not a decidable rule for the Dockerfile and entrypoint

**Quotes:** > Review 022's `Dockerfile` and entrypoint edits, and keep what a fresh deploy needs.
**Quotes:** > - A deploy workflow for the user's server (later, written fresh).
**Problem:** The deploy target is explicitly out of scope and undefined, so nothing in the artifact defines "what a fresh deploy needs". The image is still a shared contract: `e2e.yml` runs `docker build .`, and the entrypoint decides what runs at boot. One implementer will keep every 022 edit, and another will revert to `9f829456`. Both readings fit the text.
**Fix:** List the 022 `Dockerfile` and entrypoint edits in the artifact, each with a keep or revert verdict. Or state the criterion concretely (for example "revert anything that references the company registry, Coolify or `studio.bistecglobal.com`; keep everything else").
**Status:** upheld

### [WARN] party-architect — The folder-move script is both in this change's scope and a prerequisite to planning, so the `launch.json` and path co-changes have no owner

**Quotes:** > - A PowerShell script, outside the repo, that the user runs after closing Claude Code. It moves the fork to `D:\ai-studio` and the company clone `D:\studio` to `D:\Bistec\studio`, moves the matching Claude memory folders, and pins the company clone to the existing `designer` Docker volumes.
**Quotes:** > - **Local split:** separate Docker stacks. The fork moves to `D:\ai-studio`, and the company clone `D:\studio` moves to `D:\Bistec\studio`, by a user-run script **before** planning. `.claude/launch.json` hard-codes `D:\Bistec\designer` and must point at the new path.
**Problem:** Scope lists the script as a deliverable of this change. The Decisions section says it runs before planning, which means before this change exists. The co-changes that depend on the move are then unassigned: the `.claude/launch.json` path, the `CLAUDE.md` and `handoff.md` "new local paths" entry, and the compose project rename that the company clone's `COMPOSE_PROJECT_NAME=designer` pin must match. The proposal does not say whether each one lands in a repo commit or in the script. If the script runs first, the fork's compose still says `designer` until this change merges. If it runs last, the build and gate run from the old path.
**Fix:** Pick one order and state it. Then assign each path-dependent edit (`launch.json`, the docs paths, the compose project name) either to the script or to a named commit in this change.
**Status:** upheld
