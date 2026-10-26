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
