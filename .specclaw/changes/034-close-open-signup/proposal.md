# Proposal: Close open self-registration

**Created:** 2026-10-27
**Status:** 🟡 Draft

## Problem

Anyone who can reach the app can create an account. `src/lib/auth.ts:20` enables better-auth's email-and-password provider with no sign-up restriction. `src/app/api/auth/[...all]/route.ts` hands every `/api/auth/*` request to better-auth, and `src/proxy.ts` leaves `/api/auth` public. As a result, an anonymous `POST /api/auth/sign-up/email` creates a user and returns a session.

The pre-PR review of `v2` against `main` (finding F1, 2026-10-27) confirmed this live on a fresh deploy of the real compose file:

- The anonymous sign-up returned 200 and a session token.
- A `role` in the body is ignored (`input: false`), so the account is created as `EDITOR`.
- The account is in no team, so every team route answers 403.
- The account can still call `POST /api/briefs/images`, a plain `withAuth` route. That upload returned 200 and wrote the object to the public-read `generated-images` bucket under `briefs/<userId>/`. Anyone who can reach the app can therefore store raster images of up to 10 MB each in public storage, and get back a public URL.

Accounts are meant to be created only by a super admin (`POST /api/admin/users`, `/admin/users`), or by the seed scripts. No page in the app offers sign-up. The issue exists on `main` too. It matters before the system is reachable from outside the company network, and `main` is the deploy target.

## Proposed Solution

1. **Refuse public sign-up at the HTTP edge with an allow-list.** In `src/app/api/auth/[...all]/route.ts`, only the better-auth paths the app uses reach better-auth. Every other path, `/api/auth/sign-up/*` included, answers 404 before better-auth runs. The app uses five paths: `sign-in/username`, `sign-in/email` (the legacy email fallback on the login form), `sign-out`, `change-password` (`/settings`) and `get-session`. The spec confirms the exact list, including any path the better-auth client calls on its own. The allow-list fails closed: a route that a better-auth upgrade or a plugin adds stays unreachable until someone adds it on purpose.
   - Why not better-auth's own `emailAndPassword.disableSignUp`: in better-auth 1.6.20, `sign-up.mjs:143` checks that flag inside the endpoint itself. It would therefore also refuse the server-side `auth.api.signUpEmail` call that `POST /api/admin/users` (`src/app/api/admin/users/route.ts:66`) uses to create accounts.
   - Server-side `auth.api.*` calls never pass through the Next route handler, so admin-created accounts keep working.
   - The seed scripts (`seed-admin`, `seed-editor`, `seed-teams`) build their own `betterAuth` instance and are not affected either way.
2. **Defence in depth on the upload.** Move `POST /api/briefs/images` from `withAuth` to `withTeamAuth`. Its only callers, the post wizard and the inline-edit modal, already run inside a team. A signed-in user with no team then gets 403 there, as on every other content route.
3. **Regression tests (E2E).**
   - An anonymous `POST /api/auth/sign-up/email` is refused and creates no `User` row.
   - A super admin still creates a user through `POST /api/admin/users`, and that user can sign in.
   - A signed-in user with no team gets 403 from `POST /api/briefs/images`.
   - Sign-in, sign-out and the session endpoints are unchanged (covered by the existing suite).

## Scope

### In Scope

- `src/app/api/auth/[...all]/route.ts`: refuse the sign-up paths.
- `src/app/api/briefs/images/route.ts`: `withAuth` becomes `withTeamAuth`.
- New E2E cases, in the §K security regression area or a small new suite, plus their entries in `docs/e2e-test-plan.md`.
- A one-line note in `docs/mcp-acp-guide.md` or `CLAUDE.md` architecture decisions: accounts are admin-created only, and public sign-up is refused at the route.

### Out of Scope

- Other hardening items from the review (F3): session revocation on password reset, a `MOCK_*` refusal in production, a MIME allow-list on brand-kit uploads, and the `secure` flag on the active-team cookie. Each needs its own proposal if wanted.
- The deploy items (F2): MinIO public endpoint, first-admin bootstrap, app port binding. These belong to the future deploy workflow.
- Rate limiting, and cleaning up accounts that may already exist. There is no deployed `v2` system; the fresh start brings no data import.
- Any change to the seed scripts or to better-auth's version.

## Impact

- **Size:** bounded (spike / bounded / architectural). It alters two existing route handlers and adds tests, with no new subsystem or interface.
- **Files affected:** about 5 (estimated): 2 routes, 1 or 2 E2E test files, `docs/e2e-test-plan.md`, and one doc line.
- **Complexity:** small (small / medium / large)
- **Risk:** low (low / medium / high). The main risk is a better-auth client flow that relies on a `sign-up` path. None exists: no `signUp` call in `src/` outside the admin route's server call.

## Open Questions

None open. Decisions by the user, 2026-10-27:

1. A refused path answers 404 (the default; not contested).
2. The gate is an **allow-list** of the auth paths the app uses, not a deny-list of `sign-up`.
3. `POST /api/briefs/images` **moves to `withTeamAuth`**.
4. The size is **bounded**.
5. The party panel was **skipped** (tier deep by the classifier, `party/panel.json`). The user approved the proposal without the panel.

---

**To proceed:** Review this proposal and approve to begin planning.
