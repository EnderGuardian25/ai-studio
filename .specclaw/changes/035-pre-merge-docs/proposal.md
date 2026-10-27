# Proposal: Pre-merge docs refresh for the v2 → main PR

**Created:** 2026-10-27
**Status:** ✅ Approved (2026-10-27)

## Problem

The user asked for the `v2` → `main` PR to be opened "after updating all the necessary documents". `main` is the deploy target, and several documents a reader of `main` meets first are stale or missing:

- `README.md` says Next.js 14 and React 18; `package.json` has `next ^16.2.10` and `react ^19.2.7`.
- Its quick start runs a bare `npx prisma migrate deploy`, which `CLAUDE.md` and `docs/cold-start.md` forbid. The supported command is `npm run db:migrate`, which runs the stack preflight first.
- Its scripts table lacks `db:migrate`, `test:unit`, `test:render` and `test:upgrade`. It still says the E2E catalog has "103 passing tests"; the suite is now 601 passing.
- `CLAUDE.md` "What this project is" also says Next.js 14. Its pick-up line has to say the PR is open.
- `docs/mcp-acp-guide.md` shows MinIO on `localhost:9000` in the MCP client config, but the fork's stack is on 9100. Its `cwd` example says `/absolute/path/to/designer`, the company clone's name.
- `.specclaw/ROADMAP.md`'s latest status line says 033 is "planned"; 033 and 034 are VERIFIED PASS.
- `docs/history.md` has no entry for the pre-PR review or 034.
- There is no deploy guide. The pre-PR review's fresh deploy (2026-10-27) found what a self-hosted deploy needs beyond `.env.example` (finding F2):
  - `MINIO_PUBLIC_ENDPOINT` and a browser route to MinIO; without them, image URLs come out as `http://minio:9000/...`.
  - The first super admin, seeded from a checkout because the image ships no `scripts/`.
  - The app port binding.
  - Migrations run on boot, through the entrypoint.
  - Nothing documents any of this.

## Proposed Solution

A docs-only change, then the PR:

1. **`README.md`:**
   - the current stack versions;
   - the quick start through `npm run db:migrate`, with the fork stack's ports;
   - the full scripts table;
   - no stale test count;
   - a link to the new deploy guide.
2. **New `docs/deploy.md`.** Deploying on your own server with the repo's `docker-compose.yml`, grounded in what the scratch deploy verified:
   - Production env: real `BETTER_AUTH_SECRET` and `TOKEN_ENCRYPTION_KEY` (64 hex characters), non-`minioadmin` MinIO keys, `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL`.
   - MinIO for browsers: either `docker-compose.override.yml`'s port or a reverse-proxy route, plus `MINIO_PUBLIC_ENDPOINT`.
   - The app behind a reverse proxy.
   - Migrate on boot, and `SKIP_MIGRATIONS`.
   - The first super admin through `seed-admin.mjs` from a checkout, then the first team at `/admin/teams`.
   - Accounts are admin-created only (034).
   - The `GIT_SHA` build arg, and the scheduler service.
   - It states that no deploy workflow exists yet.
3. **`docs/mcp-acp-guide.md`:** the fork's ports and a neutral `cwd`.
4. **`CLAUDE.md`:** Next.js 16 in "What this project is", and a pick-up line for the open PR.
5. **`.specclaw/ROADMAP.md`:** a new latest status line (033 and 034 PASS, the review done, the PR open).
6. **`docs/history.md`:** one entry for the pre-PR review, 034 and 035.
7. **Then open the PR** `v2` → `main` with `gh pr create`. The body summarises 004 to 035 by change, the review's four checks and their results, the CI evidence, and what is deferred (F2 deploy workflow, F3 hardening). The PR is not merged; merging is the user's call.

## Scope

### In Scope

- The six documents above, plus the PR.

### Out of Scope

- Any code, config, workflow or test change.
- The F3 hardening items (session revocation on password reset, `MOCK_*` refusal in production, the brand-kit upload MIME allow-list, the `secure` cookie flag). Each needs its own proposal.
- A deploy workflow. The user writes it later.
- Merging the PR.
- Rewriting history documents (`docs/handoff.md`, `docs/fork-history.md`, older plan files); they stay as history.

## Impact

- **Size:** bounded (spike / bounded / architectural). It edits existing docs and adds one new doc, with no code.
- **Files affected:** 7 (estimated)
- **Complexity:** small (small / medium / large)
- **Risk:** low (low / medium / high). Docs only; CI still runs on the push.

## Open Questions

None open. Decisions by the user, 2026-10-27:

1. Approved as **bounded**, with `docs/deploy.md`.
2. The review findings stay outside the repo. `docs/history.md` gets a short summary and `docs/deploy.md` the deploy facts; `docs/code-review-findings.md` is not changed.
3. The party panel was **skipped**.

---

**To proceed:** Review this proposal and approve to begin planning.
