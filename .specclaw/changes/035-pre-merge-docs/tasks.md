# Tasks: Pre-merge docs refresh for the v2 → main PR

**Change:** 035-pre-merge-docs
**Created:** 2026-10-27
**Total Tasks:** 3

## Summary

T1 writes the docs. T2 records state (roadmap, history, the CLAUDE.md pick-up) and pushes. T3 opens the PR once CI is green.

## Tasks

### Wave 1 — the docs

- [ ] `T1` — README, deploy guide, MCP/ACP guide, CLAUDE.md stack line
  - Files: `README.md`, `docs/deploy.md`, `docs/mcp-acp-guide.md`, `CLAUDE.md`
  - Estimate: small
  - Kind: docs
  - Notes: FR-01 to FR-04 (the stack line only; the pick-up line is T2). Check every command, port, variable and path against the repo (NFR-02). Deploy facts come from the scratch deploy (pre-PR review, 2026-10-27).

### Wave 2 — state and push

- [ ] `T2` — Roadmap, history and the CLAUDE.md pick-up; push
  - Files: `.specclaw/ROADMAP.md`, `docs/history.md`, `CLAUDE.md`
  - Estimate: small
  - Kind: docs
  - Depends: T1
  - Notes: FR-05, FR-06 and the pick-up half of FR-04, written for "PR open". Run `npx prettier --check`, push, and check `gh run list --branch v2`.

### Wave 3 — the PR

- [ ] `T3` — Open the v2 → main PR
  - Files: none (GitHub only)
  - Estimate: small
  - Kind: config
  - Depends: T2
  - Notes: FR-07. Only after CI is green on the pushed head. Check for an existing `v2` → `main` PR first. Do not merge. Then record the PR number in the CLAUDE.md pick-up, in a follow-up commit.

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
```
