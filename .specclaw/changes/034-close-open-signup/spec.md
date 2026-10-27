# Spec: Close open self-registration

**Change:** 034-close-open-signup
**Created:** 2026-10-27
**Status:** 🟡 Draft

## Overview

Today anyone who can reach the app can create an account. `src/app/api/auth/[...all]/route.ts` hands every `/api/auth/*` request to better-auth, and `emailAndPassword` is enabled with no sign-up restriction (`src/lib/auth.ts:20`). The account a stranger creates this way can then write images to the public-read `generated-images` bucket through `POST /api/briefs/images`, which only checks for a session (pre-PR review finding F1, confirmed live 2026-10-27).

This change closes the route with an allow-list of the better-auth paths the app uses. It also requires a team for the brief image upload. Accounts are still created by a super admin (`POST /api/admin/users`, which calls `auth.api.signUpEmail` server-side and never goes through the HTTP route) and by the seed scripts, which build their own `betterAuth` instance.

better-auth's `emailAndPassword.disableSignUp` is **not** used. In better-auth 1.6.20 the check runs inside the endpoint (`node_modules/better-auth/dist/api/routes/sign-up.mjs:143`), so it would also refuse the admin route's server call.

## Requirements

### Functional Requirements

- **FR-01 — Allow-list at the auth route.** `src/app/api/auth/[...all]/route.ts` passes a request to better-auth only when its method and path are on an allow-list. Every other request under `/api/auth` answers **404** with a JSON body `{ "error": "Not found" }`, and better-auth never runs for it. The allow-list is exactly:
  - `POST /api/auth/sign-in/username` (the login form)
  - `POST /api/auth/sign-in/email` (the login form's legacy email fallback, and the E2E helpers)
  - `POST /api/auth/sign-out`
  - `POST /api/auth/change-password` (`/settings`)
  - `GET /api/auth/get-session` (the better-auth client's session read)
- **FR-02 — Exact match.** The check compares the request's pathname (`new URL(req.url).pathname`) with the allow-list exactly. A trailing slash, different case, an encoded character or a longer path is not on the list and answers 404. The list is one constant in the route file, with a comment that names this change and says to add a path only on purpose.
- **FR-03 — Brief image upload requires a team.** `POST /api/briefs/images` uses `withTeamAuth` instead of `withAuth`. A signed-in user with no live team membership gets the wrapper's 403 ("You are not a member of any team"), and nothing is uploaded. The object key, `briefs/<userId>/<ts>-<name>`, the bucket and the response shape do not change. The route comment no longer says "Available to any signed-in user".
- **FR-04 — Admin-created accounts still work.** `POST /api/admin/users` still creates a user who can sign in by username. No change to that route or to `src/lib/auth.ts`.

### Non-Functional Requirements

- **NFR-01 — Fail closed.** A better-auth upgrade or a new plugin that adds a route does not make that route reachable. Only an edit to the allow-list does.
- **NFR-02 — No new dependency, no env var, no migration.** The seed scripts, `src/proxy.ts`, `src/lib/auth.ts` and the better-auth version are unchanged.
- **NFR-03 — No behaviour change for the app's own flows.** Sign-in (username and email), sign-out, change password and session reads behave exactly as before. The full E2E suite stays green.

## Acceptance Criteria

- **AC-01 (FR-01).** An anonymous `POST /api/auth/sign-up/email` with a valid body answers 404. No `User` row is created for that username: a super admin's `GET /api/admin/users` does not list it, and signing in with those credentials fails.
- **AC-02 (FR-01, FR-02).** For each allowed path the request still reaches better-auth: sign-in by username and by email answer 200 with a session cookie (TC-AUTH-01 and §M stay green), and `GET /api/auth/get-session` with that cookie answers 200 with the session.
- **AC-03 (FR-01, FR-02).** These requests each answer 404:
  - `GET /api/auth/sign-up/email`
  - `POST /api/auth/sign-in/username/` (a trailing slash)
  - `POST /api/auth/SIGN-UP/email`
  - one unused better-auth path, `POST /api/auth/update-user`
- **AC-04 (FR-03).** A user created by a super admin through `POST /api/admin/users`, signed in, and in no team gets 403 from `POST /api/briefs/images` with a valid PNG. A team member gets 200 with a `url`, as before.
- **AC-05 (FR-04).** The §M case "create user → sign in by username → role change → deactivate → reactivate + reset" stays green with no edit.
- **AC-06 (NFR-03).** The full mock E2E suite, unit tests, `tsc` and lint are green locally, and CI is green on the pushed commit.

## Edge Cases

- **Stale session cookie on a sign-up probe.** better-auth can answer 403 `MISSING_OR_NULL_ORIGIN` when a sign-in or sign-up POST carries a stale cookie (e2e-test-plan, 2026-07-07 note). The new cases use a fresh request context per probe, so the asserted 404 comes from the allow-list and not from better-auth.
- **`HEAD` or `OPTIONS` on an allowed path.** These are not on the list and answer 404. The route exports only `GET` and `POST`, as today.
- **A super admin with no team membership.** `withTeamAuth` already lets a super admin act in any live team, so the upload works for them whenever a team exists. On a fresh system with zero teams it answers 403, which is correct: a post cannot be made without a team.
- **Server-side `auth.api.*` calls** (`getSession` in `requireRole` and `getCurrentUser`, `signUpEmail` in the admin route) never pass through the route, so the allow-list does not affect them.

## Dependencies

None. It builds on existing code only.

## Approach

One decision: refuse at the Next route with an allow-list of method and path pairs, not with better-auth's `disableSignUp`. The flag would also block the admin route's server-side `signUpEmail`, and a deny-list would let through any route a later better-auth version adds.

File map (the scope that verify checks):

- `src/app/api/auth/[...all]/route.ts`: the allow-list constant, and `GET` and `POST` wrappers around `toNextJsHandler(auth)` (FR-01, FR-02).
- `src/app/api/briefs/images/route.ts`: `withAuth` becomes `withTeamAuth`, and the comment is updated (FR-03).
- `tests/e2e/auth.test.ts`: new cases TC-AUTH-09 (sign-up refused, AC-01), TC-AUTH-10 (allow-list exactness and get-session, AC-02 and AC-03) and TC-AUTH-11 (upload without a team is 403, AC-04).
- `docs/e2e-test-plan.md`: §A gains TC-AUTH-09 to TC-AUTH-11, and the traceability table gains a row.
- `CLAUDE.md`: one line under "Architecture decisions to remember" (accounts are admin-created only; the auth route is an allow-list).

## Notes

- Source: the pre-PR review of `v2` against `main` (2026-10-27), finding F1. The other findings (F2 deploy, F3 hardening) are out of scope.
- The user decided on 2026-10-27: an allow-list, 404, the upload moves to `withTeamAuth`, size bounded, party panel skipped.
