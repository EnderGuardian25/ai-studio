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
