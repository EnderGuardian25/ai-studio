# Tasks: Close open self-registration

**Change:** 034-close-open-signup
**Created:** 2026-10-27
**Total Tasks:** 2

## Summary

T1 closes the hole and proves it: the allow-list at the auth route, the team gate on the brief image upload, and the three E2E cases. T2 records the decision in the test plan and in `CLAUDE.md`. The full gate (the whole mock E2E suite, unit, `tsc`, lint and CI) runs at verify.

## Tasks

### Wave 1 — the fix and its tests

- [ ] `T1` — Allow-list the auth route, team-gate the brief image upload, and add TC-AUTH-09 to TC-AUTH-11
  - Files: `src/app/api/auth/[...all]/route.ts`, `src/app/api/briefs/images/route.ts`, `tests/e2e/auth.test.ts`
  - Estimate: small
  - Kind: impl
  - Notes:
    - FR-01 and FR-02: keep `toNextJsHandler(auth)` and wrap its `GET` and `POST`.
      - One constant holds the allowed method and path pairs, for example a `Set` of `'POST /api/auth/sign-in/username'`, with the comment the spec asks for.
      - Check `new URL(req.url).pathname` exactly.
      - Anything not on the list returns `NextResponse.json({ error: 'Not found' }, { status: 404 })`, and better-auth is never called for it.
    - FR-03: `withAuth` becomes `withTeamAuth`; the handler's third argument still carries `userId`, and the key does not change. Update the route comment.
    - TC-AUTH-09 (AC-01): anonymous sign-up is 404, then check as a super admin that no user with that username exists and that sign-in fails.
    - TC-AUTH-10 (AC-02, AC-03): the allowed paths still work, including get-session with a cookie. The listed off-list requests each answer 404.
    - TC-AUTH-11 (AC-04): a super admin creates a user with `POST /api/admin/users`, the user signs in and gets 403 on `POST /api/briefs/images` with a small valid PNG; an existing team member gets 200. Reuse the PNG the other suites send to that route (`regression.test.ts:168`, `brief-draft-recovery.test.ts:118`).
    - Use a fresh request context for every sign-in and sign-up probe (the e2e-test-plan's stale-cookie rule). Use unique usernames per run, because the test DB is reused.
    - Run `npx playwright test tests/e2e/auth.test.ts tests/e2e/user-management.test.ts` against the mock server, plus the suites that upload brief images: `regression`, `brief-draft-recovery`, `brand-kit` and `draft-inline-edit`.

### Wave 2 — record the decision

- [ ] `T2` — Test plan and CLAUDE.md
  - Files: `docs/e2e-test-plan.md`, `CLAUDE.md`
  - Estimate: small
  - Kind: docs
  - Depends: T1
  - Notes:
    - In the §A catalog, add TC-AUTH-09 to TC-AUTH-11 in the existing one-line format.
    - Add a row to the §9 traceability table: "034 open sign-up (F1)" → TC-AUTH-09, TC-AUTH-10, TC-AUTH-11.
    - In `CLAUDE.md` "Architecture decisions to remember", add one line: accounts are created only by a super admin (`POST /api/admin/users`) or the seed scripts. `src/app/api/auth/[...all]/route.ts` passes only an allow-list of better-auth paths and answers 404 to the rest, sign-up included. Add a path there only on purpose. `disableSignUp` is not used because it would also block the admin route's server-side `signUpEmail`.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
- `[>]` Deferred — correctly blocked on a sibling change, not incomplete through any fault of its own; excluded from the incomplete-task count that gates `verify`

**Task format:**

```
- [ ] `T<n>` — <title>
  - Files: <files to create/modify>
  - Estimate: small | medium | large
  - Kind: docs | test | config | refactor | impl | migration   (optional; hints the build subagent's role, tools, and model)
  - Depends: <task ids> (if any)
  - Notes: <additional context>
  - Deferred-Reason: <why this can't be built yet>            (required when marker is `[>]`)
  - Deferred-Blocked-On: <sibling change name, if known>      (optional; free text, not a structured link)
```
