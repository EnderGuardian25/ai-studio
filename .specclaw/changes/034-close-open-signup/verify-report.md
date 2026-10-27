# Verify report: 034-close-open-signup

**Verdict:** PASS

**Verified:** 2026-10-27, on `93e9c7f4` (pushed), with CI run 40552350239 green.

All six acceptance criteria are met. The change touches only the five files in the spec's Approach file map. The verify agent (sonnet) did not start servers or run the E2E suite, so AC-06 rests on the orchestrator's runs recorded below.

## Acceptance criteria

| AC    | Status           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-01 | MET              | `src/app/api/auth/[...all]/route.ts:17-29`: `POST /api/auth/sign-up/email` is not on `ALLOWED_AUTH_ROUTES` and answers 404 `{error:"Not found"}`; better-auth never runs. TC-AUTH-09 (`tests/e2e/auth.test.ts:132`) asserts 404 from a fresh context, then that `GET /api/admin/users` does not list the username or email, and that sign-in by username and by email both fail (≥ 400). It passed in the full run.                        |
| AC-02 | MET              | The two sign-in pairs pass through to `handler.POST`. TC-AUTH-10 (`tests/e2e/auth.test.ts:154`) asserts sign-in 200 with a `better-auth.session_token=` cookie, then `GET /api/auth/get-session` 200 with `user`. TC-AUTH-01 and §M stay green.                                                                                                                                                                                            |
| AC-03 | MET (as amended) | The match is exact on `` `${method} ${pathname}` ``. TC-AUTH-10 asserts 404 for `GET sign-up/email`, `POST SIGN-UP/email` and `POST update-user`. The trailing slash gets 308 or 404 with redirects off, per the build-time amendment: Next.js redirects to the slash-less path before the handler runs, and that path is checked by the allow-list.                                                                                       |
| AC-04 | MET              | `src/app/api/briefs/images/route.ts` uses `withTeamAuth`, and `src/lib/api/handler.ts:82-84` returns 403 "You are not a member of any team". TC-AUTH-11 (`tests/e2e/auth.test.ts:182`): a user created through `POST /api/admin/users` (201) signs in and gets 403 on the upload; the seeded editor gets 200 with a `url`.                                                                                                                 |
| AC-05 | MET              | The §M case "create user → sign in by username → role change → deactivate → reactivate + reset" (`tests/e2e/user-management.test.ts:50`) is unedited and green in the full run. `src/app/api/admin/users` and `src/lib/auth.ts` are not in the diff.                                                                                                                                                                                       |
| AC-06 | MET              | Full local mock E2E on a freshly reset `ai_studio_test`: 601 passed, 3 skipped (TC-REG-H11a/b/c), 0 failed, 0 flaky (16.6 min). CI run 40552350239 on `93e9c7f4`: success (unit 4609 passed; E2E 601 passed / 3 skipped; build job with docker build, env preflight, glyph check and render harness 154 passed). `tsc` clean; lint 0 errors, 7 warnings, all in files this change did not touch; unit 4609 passed; `npm run build` passed. |

## Requirements

- **FR-01 MET.** `ALLOWED_AUTH_ROUTES` holds exactly the five pairs. Anything else answers 404. The exports are `guard("GET", handler.GET)` and `guard("POST", handler.POST)`.
- **FR-02 MET.** The pathname comes from `new URL(req.url).pathname` with an exact Set lookup. The list is one constant, and its comment names 034 and says to add a path only on purpose.
- **FR-03 MET.** `withAuth` became `withTeamAuth`, and the comment is updated. The key, bucket and response are unchanged.
- **FR-04 MET.** The admin route and `src/lib/auth.ts` are unchanged; the server-side `signUpEmail` call never goes through the HTTP route.
- **NFR-01 MET.** The allow-list fails closed.
- **NFR-02 MET.** No package, env, migration, seed, `src/proxy.ts` or `src/lib/auth.ts` change.
- **NFR-03 MET.** Full E2E and CI are green.

## Scope

`git diff --name-only 7109f0ed..HEAD`, outside `.specclaw/`, lists exactly the Approach file map: `CLAUDE.md`, `docs/e2e-test-plan.md`, `src/app/api/auth/[...all]/route.ts`, `src/app/api/briefs/images/route.ts`, `tests/e2e/auth.test.ts`.

## Per-task reviews

- T1 — NOTE (0 BLOCK, 0 WARN, 3 NOTE; `reviews/T1.md`)
- T2 — not reviewed (docs only, done by the orchestrator)

## Notes

- HEAD and OPTIONS on an allowed path answer 404 because the route exports only GET and POST (spec edge cases).
- `workflow.code_review` is not set, so there is no whole-change `review-report.md`; the per-task review above stands in for it.

## Verification

Command: git diff --stat 7109f0ed..HEAD -- src tests docs CLAUDE.md
Exit: 0
Output (tail):
CLAUDE.md | 1 +
docs/e2e-test-plan.md | 4 ++
src/app/api/auth/[...all]/route.ts | 29 ++++++++++-
src/app/api/briefs/images/route.ts | 6 +--
tests/e2e/auth.test.ts | 98 +++++++++++++++++++++++++++++++++++++-
5 files changed, 133 insertions(+), 5 deletions(-)
