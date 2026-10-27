# Error Journal: 032-fork-folio-restore

Build errors and their resolutions.

---

## [T2] Investigation 1 — CI run 40485318461 (v2, 647a90c4) fails at 'Upgrade path from main's schema (022)': npm run test:upgrade prints 'node: .env.test: not found' and exits 9

**When:** 2026-10-27 10:16 UTC
**Status:** upheld
**Failure-Sig:** —
**Reproduce:** `node scripts/stack-preflight.mjs --env-file .env.nonexistent-xyz` → exit 9
**Evidence:** The error format and exit 9 are Node's own; the preflight prints nothing and reads a file only if it exists. Reproduced locally on Node 24 with a missing file. Locally .env.test exists, so the 032 gates passed. CI has no .env.test.
**Hypothesis 1 (upheld):** Node parses --env-file <path> as its own CLI option even after the script path and exits 9 when the file is missing, so the preflight's flag name collides with Node's
**Fix:** rename the preflight CLI flag to --stack-env in scripts/stack-preflight.mjs and package.json (test:e2e:db, test:upgrade) (commit 86439c0e)
**Proof:** new unit cases (stackPreflight.test.ts, CLI as package.json calls it, env file missing) fail without the fix with Node's not-found error and pass with it; node scripts/stack-preflight.mjs --stack-env .env.nonexistent-xyz now reaches the preflight's own check; AC-09 refusals unchanged (4 scripts exit 1); unit 4581, tsc clean

---
