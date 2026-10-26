### [BLOCK] party-security — Pushing 202 company commits to the fork is irreversible, and deleting files at HEAD does not redact them

**Quotes:**

> Push `v2` to `origin` (the fork) and confirm fork CI is green.
> They stay in git history and in the company repo.
> Local `v2` was fast-forwarded `1c38dbb9 → 59f3b222`. The `upstream` and `company` remotes were removed, so `origin` (the fork) is the only remote. Nothing is pushed yet.
> **Problem:** The push publishes the full range `1c38dbb9..59f3b222` to the fork. That range includes company DevOps material: `devops-deploy-handover.md`, the Coolify redeploy workflow, and prod hostnames and resource details. The proposal deletes those docs only at HEAD and says outright that they "stay in git history". Once the push lands, that history is out of the operator's control. Deleting the files does not undo it, and no step checks the range for credentials, tokens, Coolify UUIDs or prod IDs before it leaves the machine. The proposal states no recovery path. A force-push rewrite after the fact does not recall clones or cached views.
> **Fix:** Before the first push, add a pre-push gate. Run a secret scan over every commit in `1c38dbb9..59f3b222`, not just the HEAD tree, and grep for company prod identifiers (Coolify resource UUIDs, `COOLIFY_`, company registry paths, prod DB or host strings). Block the push on any hit and get an explicit user go-ahead on the result. Record the scan output in the change's reports so the decision is auditable.
> **Status:** upheld

### [BLOCK] party-security — A stale local `.env` or `.env.test` silently keeps the fork pointed at the company stack, including the destructive test-DB reset

**Quotes:**

> Give the fork its own compose project name (`ai-studio`) and its own host ports for Postgres and MinIO, set through `.env` with fork defaults that do not clash with the company clone's `designer` stack. Update `.env.example`, `docs/cold-start.md`, the E2E DB scripts and the test compose file to match.
> Once the two codebases diverge, one repo's migrations can break the other's local DB.
> **Problem:** The proposal only updates `.env.example`. The fork's existing local `.env` and `.env.test` are untracked, and they still carry the old `DATABASE_URL` and MinIO endpoint on the shared ports. A missing compose variable falls back to a safe default, but a stale connection string does not. `prisma migrate deploy`, the seed scripts and the clean-gate `DROP DATABASE ... WITH (FORCE)` would then run against the company clone's `bistec_studio` / `bistec_studio_test`, which is exactly the harm item 4 exists to prevent. Nothing would signal it: the fork's own containers would sit idle while the E2E run "passes" against the company DB. The failure looks the same as success.
> **Fix:** Rewrite the fork's local `.env` and `.env.test` as part of the change (or have the script do it), not just `.env.example`. Add a preflight to the E2E DB scripts and the migrate/seed entry points that resolves the target host:port and container and refuses (non-zero exit, stderr message) when it matches the `designer` stack's ports or container names. Never address the DB by a hard-coded `designer-postgres-1` container name in fork scripts or docs.
> **Status:** upheld

### [WARN] party-security — The live company deploy workflow sits in the tree that will be pushed, and the proposal does not order its deletion first

**Quotes:**

> Change 022 restored `.github/workflows/docker-publish.yml`: the GHCR push to the company registry, the Coolify redeploy of company prod and the `/api/health` check against `studio.bistecglobal.com`.
> Delete `.github/workflows/docker-publish.yml`.
> Push `v2` to `origin` (the fork) and confirm fork CI is green.
> **Problem:** Local `v2` currently contains a workflow whose job is to push images and trigger a redeploy of company prod. The proposal lists the deletion as item 2 of a ~150-file change. It does not say the deletion must land before any intermediate push, for example a push made for drive-safety mid-build. If the workflow reaches the fork with Actions enabled, it runs on the fork's triggers. With no secrets it most likely fails, but whether it fails depends on the fork never holding a Coolify or registry secret, and the proposal does not state that.
> **Fix:** Make deleting `docker-publish.yml` the first commit of the change, before any push. Add a CI or unit guard that fails if any workflow under `.github/workflows/` references `coolify`, the company registry path or `studio.bistecglobal.com`. Confirm the fork's repo secrets contain no `COOLIFY_*` token.
> **Status:** upheld

### [WARN] party-security — The folder-and-memory move script has no preflight, no log and no rollback, so a partial run fails silently

**Quotes:**

> A PowerShell script, outside the repo, that the user runs after closing Claude Code. It moves the fork to `D:\ai-studio` and the company clone `D:\studio` to `D:\Bistec\studio`, moves the matching Claude memory folders, and pins the company clone to the existing `designer` Docker volumes.
> The script only moves the folder and adds `COMPOSE_PROJECT_NAME=designer` to its `.env`.
> **Problem:** The script makes four dependent moves plus one `.env` edit, outside any agent session, and the proposal states no failure behaviour. A locked file, such as a stray node process holding `.next` or a Docker bind mount, can stop it partway. That leaves the repo moved but its memory folder not moved, or the company clone moved but not pinned. An unpinned company clone at `D:\Bistec\studio` comes up under a new project name with empty volumes. That looks like data loss and invites a re-seed into the wrong volumes. Appending to `.env` that already defines `COMPOSE_PROJECT_NAME` produces a duplicate key with an ambiguous winner. The operator gets no record of which steps completed.
> **Fix:** Have the script check all preconditions before it moves anything: no process holds files under either tree, no target path exists, and each `.env` is present. Run the steps with `-ErrorAction Stop`, log every step, and on failure print the exact reverse moves. Set `COMPOSE_PROJECT_NAME` idempotently (replace if present, append if absent). After the move, verify with `docker compose ls` that the company clone resolves to `designer`.
> **Status:** upheld

### [WARN] party-security — Swapping folder and memory locations can hand fork instructions to the company clone, whose `origin` can push to the company repo

**Quotes:**

> moves the matching Claude memory folders
> Plus the new local paths: fork `D:\ai-studio`, company clone `D:\Bistec\studio`.
> **Problem:** Claude memory is keyed by folder path. After the move, the company clone occupies `D:\Bistec\...`, the area that used to hold the fork. Its `origin` is the company repo. If the script pairs a memory folder with the wrong repo, or a session is opened in the wrong folder, a session in the company clone loads fork memory that says "this repo is the fork, `origin` is the fork, push to `origin`". Following those instructions as designed would push fork work to the company repo. The proposal relies on folder identity alone to route these instructions.
> **Fix:** In the script, check `git remote get-url origin` in each folder before moving its memory folder, and abort on any mismatch. In the new `CLAUDE.md` and `handoff.md` top entries, require checking `git remote get-url origin` against `EnderGuardian25/ai-studio` before any push.
> **Status:** upheld

### [NOTE] party-security — The silo image claim is asserted in docs, not enforced, while this change edits the compose files and deletes the runbook that explained why

**Quotes:**

> **Object storage:** state that silo (`pgsty/silo`, pinned by digest) is already the fork's MinIO image in compose and CI, so a fresh deploy needs no MinIO migration.
> **Problem:** The change edits the test compose file and the E2E scripts and deletes `docs/minio-silo-migration.md`. After that, the only protection against a regression to a withdrawn or vulnerable MinIO image is a sentence in the docs. A fresh deploy would trust that sentence.
> **Fix:** Add a unit guard asserting that every compose file and `e2e.yml` reference the `pgsty/silo` image by digest.
> **Status:** upheld
