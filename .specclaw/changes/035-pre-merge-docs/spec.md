# Spec: Pre-merge docs refresh for the v2 → main PR

**Change:** 035-pre-merge-docs
**Created:** 2026-10-27
**Status:** 🟡 Draft

## Overview

Docs only. Bring the documents a reader of `main` meets first up to date with `v2`, add a deploy guide grounded in the pre-PR review's verified scratch deploy, then open the `v2` → `main` PR. Nothing in `src/`, `tests/`, `prisma/`, config or workflows changes.

## Requirements

### Functional Requirements

- **FR-01 — README.**
  - The stack names Next.js 16 and React 19, as in `package.json`.
  - The quick start applies migrations with `npm run db:migrate`, never a bare `npx prisma migrate deploy`.
  - It names the fork stack's ports (Postgres 5442, MinIO 9100) and links `docs/cold-start.md`.
  - The scripts table lists every script in `package.json`'s `scripts` that a developer runs. `prepare` and `lint` may be grouped.
  - No test count.
  - The documentation list links `docs/deploy.md`.
- **FR-02 — Deploy guide.** A new `docs/deploy.md` describes a self-hosted deploy with the repo's `docker-compose.yml`. It says plainly that no deploy workflow exists yet and that the user writes one later. It covers:
  - Production env values that `src/lib/env.ts` enforces, and why: `BETTER_AUTH_SECRET`; `TOKEN_ENCRYPTION_KEY` as 64 hex characters; MinIO keys that are not `minioadmin`.
  - `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL`.
  - `DATABASE_URL` and `MINIO_ENDPOINT` with the in-network hosts (`postgres:5432`, `minio:9000`).
  - Making MinIO reachable for browsers: the override file's host port, or a reverse-proxy route. `MINIO_PUBLIC_ENDPOINT` must be exactly the browser-facing base, because pre-signed URLs are signed against it.
  - The app's `3000:3000` publish behind a reverse proxy.
  - Migrations on boot through `docker-entrypoint.sh`. The env preflight runs first, the advisory lock serializes app and scheduler, and `SKIP_MIGRATIONS=1` is the emergency escape.
  - The scheduler service.
  - The first super admin: `seed-admin.mjs`, run from a checkout with `DATABASE_URL` pointed at `127.0.0.1:<POSTGRES_HOST_PORT>`, because the image ships no `scripts/`. The first team is then created at `/admin/teams`.
  - Accounts are admin-created only, since 034; there is no public sign-up.
  - The `GIT_SHA` build arg and `/api/health`.
  - A smoke check list.
  - Links to `docs/claude-account-setup.md` and `docs/social-publishing-setup.md`.
- **FR-03 — MCP/ACP guide.** The MCP client config example uses the fork's MinIO port (9100) and a neutral `cwd` placeholder (not `designer`).
- **FR-04 — CLAUDE.md.**
  - "What this project is" names Next.js 16.
  - The "Current state" pick-up says 035 is verified and the PR is open, with its number, and that merging is the user's call.
- **FR-05 — Roadmap.** `.specclaw/ROADMAP.md` gets a new latest status line: 033 and 034 VERIFIED PASS, the pre-PR review done, 035, and the PR open. The previous latest line is marked "(Superseded)".
- **FR-06 — History.** `docs/history.md` gets one dated entry at the top: the pre-PR review's four checks and results, 034, and 035. It is a summary only; the full review report stays outside the repo (user decision).
- **FR-07 — The PR.** `gh pr create --base main --head v2` on `EnderGuardian25/ai-studio`, opened only after CI is green on the pushed head. The body has:
  - a summary;
  - the changes 004 to 035, one line each;
  - the review's checks and results;
  - the test and CI evidence;
  - the deferred items (F2 deploy workflow, F3 hardening);
  - a note that merging is the user's call.

  The body ends with the attribution line. The PR is not merged.

### Non-Functional Requirements

- **NFR-01 — Docs only.** `git diff --name-only` for the change lists only `README.md`, `docs/deploy.md`, `docs/mcp-acp-guide.md`, `CLAUDE.md`, `.specclaw/ROADMAP.md`, `docs/history.md` and `.specclaw/` artifacts.
- **NFR-02 — Every fact is checked against the repo.** Commands, ports, variable names and file paths in the new or changed text exist in the repo as written. Nothing is invented.
- **NFR-03 — Formatting.** Markdown passes `npx prettier --check`.

## Acceptance Criteria

- **AC-01 (FR-01).**
  - `README.md` contains no `Next.js 14`, no `React 18`, no `npx prisma migrate deploy` and no `103 passing`.
  - It contains `npm run db:migrate` and links `docs/deploy.md`.
  - Every script it names exists in `package.json`.
- **AC-02 (FR-02, NFR-02).** `docs/deploy.md` exists and covers every FR-02 item. Each variable it names is in `src/lib/env.ts`, `.env.example`, `docker-compose.yml` or `docker-entrypoint.sh`. Each file and command it names exists.
- **AC-03 (FR-03).** `docs/mcp-acp-guide.md` contains no `localhost:9000` and no `path/to/designer`.
- **AC-04 (FR-04, FR-05, FR-06).**
  - `CLAUDE.md` contains no `Next.js 14`.
  - The roadmap's first status line names 034 and the PR.
  - `docs/history.md`'s first entry is the 2026-10-27 review entry.
- **AC-05 (NFR-01, NFR-03).** The change's diff touches only the listed files, and `npx prettier --check` passes on them.
- **AC-06 (FR-07).**
  - CI is green on the pushed head before the PR opens.
  - `gh pr view` shows the PR open, base `main`, head `v2`, not merged, with the body sections above.

## Edge Cases

- **CI on the docs push fails or flakes.** Do not open the PR. Report it, and rerun or fix only through the normal gate.
- **A PR from `v2` to `main` already exists.** Do not open a second one; report its number.

## Dependencies

- 034 VERIFIED PASS.
- `gh` authenticated for `EnderGuardian25/ai-studio`.

## Approach

One decision: the orchestrator writes the docs directly, because it holds the facts verified by the scratch deploy. The PR opens with `gh pr create` after the docs push is green. It is the one `v2` → `main` PR `CLAUDE.md` calls for, not a per-change `/specclaw:pr`.

File map:

- `README.md` (FR-01)
- `docs/deploy.md`, new (FR-02)
- `docs/mcp-acp-guide.md` (FR-03)
- `CLAUDE.md` (FR-04)
- `.specclaw/ROADMAP.md` (FR-05)
- `docs/history.md` (FR-06)

## Notes

- User decisions, 2026-10-27: bounded, `docs/deploy.md` included, findings summary in history only, panel skipped.
