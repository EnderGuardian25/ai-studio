# Pre-push scan: `1c38dbb9..59f3b222` (2026-10-27)

This scan answers party-security's BLOCK. Pushing `v2` to the fork publishes the 202 commits that the one-time sync brought in from `bistec-oss/studio`.

## Facts

- `gh repo view bistec-oss/studio --json visibility` → `PUBLIC`. Every commit in the range is already public in the company repo.
- `gh api repos/EnderGuardian25/ai-studio/actions/secrets` → no secrets. The fork holds no `COOLIFY_*` or registry token, so the company deploy workflow cannot run successfully even before W1 deletes it.
- All 202 commits are authored by the same person (`git log --format='%an <%ae>' 1c38dbb9..59f3b222 | sort | uniq -c`).

## Range scan

```
git log -p 1c38dbb9..59f3b222 | grep -IoE '(COOLIFY_API_TOKEN|ghp_[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{32,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|bstk_[A-Za-z0-9]{20,}|sk-proj-[A-Za-z0-9_-]{10,})'
```

| Hit                                               | Distinct values                                                                                                                                                                                                          | Verdict       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| `COOLIFY_API_TOKEN`                               | only the name: `${{ secrets.COOLIFY_API_TOKEN }}`, `$COOLIFY_API_TOKEN`, `gh secret set COOLIFY_API_TOKEN`, doc prose                                                                                                    | no value      |
| `sk-ant-…`                                        | `sk-ant-oat01-FAKE`, `sk-ant-api03-FAKE-unit-test`, `sk-ant-image-attempt-000008`, `sk-ant-server-key`, `sk-ant-row-plaintext`, `sk-ant-e2e-route-key-`, `sk-ant-abcdefghijklmnopqrstuvwxyz0123` and other test prefixes | test fixtures |
| `ghp_`, `AKIA`, private keys, `bstk_`, `sk-proj-` | none                                                                                                                                                                                                                     | —             |

## Company identifiers

The range contains the company prod hostname `studio.bistecglobal.com`, Coolify resource names in `docs/devops-deploy-handover.md`, and the `ghcr.io/bistec-oss/studio` registry path. All of these are already public in the company repo. W1 deletes them from the fork's HEAD (company-only docs and `docker-publish.yml`), and a guard keeps company deploy strings out of the workflows.

## Decision

No credential found. The user pre-approved the push after the W1 gate (2026-10-27). Re-run the scan over any new range before that push.

---

# Re-scan: `59f3b222..<W1 tip>` (2026-10-27, before the W1 push)

The range is the 032 plan and W1 (T1 to T4), 8 commits, all by the same author. The scan was run on `59f3b222..be013940` before the T4 commit and again on `59f3b222..HEAD` after it (the T4 commit adds only reports, evidence and two doc lines), with the same result.

## Range scan

Same pattern as above, over `git log -p 59f3b222..HEAD`:

| Hit                                               | Where                                                                                                  | Verdict       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------- |
| `COOLIFY_API_TOKEN`                               | only the name: removed lines of `docker-publish.yml` (T1), prose in moved docs, the scan command above | no value      |
| `sk-ant-…`                                        | the fixture names quoted in this file's first table                                                    | test fixtures |
| `ghp_`, `AKIA`, private keys, `bstk_`, `sk-proj-` | none                                                                                                   | —             |

## Local env values

Every value of 12 or more characters in the local `.env` and `.env.test` (copied to the scratchpad before T2; URLs, paths, DB and bucket names excluded) was searched for in the range's patch text with a fixed-string match. **No hit.** Only key names were printed.

## `origin` check

`git remote get-url origin` → `https://github.com/EnderGuardian25/ai-studio.git`.

An `upstream` remote (`bistec-oss/studio`, no fetched refs) reappeared in `.git/config` at 02:52 during the gate run. The user ruled to remove it, and it was removed; it came back at 03:21. The cause is GitHub Desktop (running since 01:50), which adds an `upstream` remote for a fork on refresh; nothing in the repo or its hooks adds it. It has no effect on this push, which names `origin` explicitly. Stopping it for good is a GitHub Desktop setting, left to the user.

## Decision

No credential found. The W1 gate is green (`reports/T4.md`). Push `v2` to `origin` (pre-approved by the user, 2026-10-27).

---

# Re-scan: `b124aa0d..db6f471b` (2026-10-27, the W2 push)

GitHub recorded the W1 push (`v2` = `b124aa0d`) in the repo's activity log but created no push event, so CI never ran on it. The user chose to push again after the W2 gate. That push covers W1 too.

The range is T5 to T9: 5 commits, all by the same author. W2 (T5–T7) plus the first two W3 groups (T8, T9).

## Gate on `db6f471b`

| Check                    | Result                                      |
| ------------------------ | ------------------------------------------- |
| tsc                      | clean                                       |
| lint                     | 0 errors / 7 warnings                       |
| unit                     | 4579 passed                                 |
| render                   | 154 passed                                  |
| `test:upgrade`           | pass                                        |
| `test:e2e:db -- --reset` | pass                                        |
| mock E2E                 | 597 passed + 1 flaky / 0 failed / 3 skipped |
| build                    | pass                                        |

The flaky case, `surfaces` "the post on the post stage is shown as rendered", failed at 0 ms and passed on retry. Evidence: `evidence/gate-t9-summary.txt`.

The earlier W2 gate on `242a4409` (T7) had one failure, `surfaces` AC-11, which asserted the Graphite 18 px header radius. T9 adapted it to the Folio shell. Evidence: `evidence/w2-gate-summary.txt`.

## Range scan

The same pattern scan and local-env fixed-string check as above, run over `git log -p b124aa0d..HEAD`, found no hits.

## Decision

No credential found. `origin` is `EnderGuardian25/ai-studio`. Push `v2` to `origin`, as approved by the user on 2026-10-27 for after the W2 gate.

---

# Re-scan: `0af87398..<W3 tip>` (2026-10-27, the W3 push)

The range is T10, T11 and T12 (3 commits, all by the same author), plus this scan commit. The W3 gate is green (`reports/T12.md`). The same pattern scan and local-env fixed-string check over `git log -p 0af87398..HEAD` found no hits. `origin` is `EnderGuardian25/ai-studio`. Push `v2` to `origin` (pre-approved by the user for the W3 push, 2026-10-27).

**CI note:** GitHub created no workflow run for the pushes of `b124aa0d` or `0af87398`, although both reached `origin` and Actions is enabled with the workflow active. The cause is not visible from the API. The user is to check the repo's Actions tab.
