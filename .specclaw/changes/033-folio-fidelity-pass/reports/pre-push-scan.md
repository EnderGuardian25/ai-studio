# Pre-push scan: 033 W1 (2026-10-27)

**Range:** `c45ed3dc..<W1 tip>`, from `origin/v2` (`c45ed3dc`) to the T5 commit. It holds the 033 plan, T1 to T4 and the T5 docs commit, all by one author (Damian De Cruz).

## Method

This is 032's method (`.specclaw/changes/032-fork-folio-restore/reports/pre-push-scan.md`):

- **Pattern scan** over `git log -p <range>`:

  ```
  COOLIFY_API_TOKEN|ghp_[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{32,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|bstk_[A-Za-z0-9]{20,}|sk-proj-[A-Za-z0-9_-]{10,}
  ```

- **Local env check:** every value of 12 or more characters in the local `.env` and `.env.test` is searched for in the patch text, with a fixed-string match. URLs, paths, and DB and bucket names are excluded. Only key names are printed.

## Result

| Range                                                    | Commits | Pattern hits | Env values checked | Env hits |
| -------------------------------------------------------- | ------- | ------------ | ------------------ | -------- |
| `c45ed3dc..b6b9d48d` (before the T5 commit)              | 6       | 0            | 15                 | none     |
| the T5 docs diff (`git diff HEAD`, before the T5 commit) | 1       | 0            | —                  | —        |

## Decision

No credential was found. `origin` is `EnderGuardian25/ai-studio`. The push of `v2` to `origin` is part of the plan (T5, AC-08).

## Verification

Command: `node <scratchpad>/scan.cjs c45ed3dc..HEAD` (scan.cjs is the method above as a script)
Exit: 0
Output (tail):

```
commits: 6
authors: Damian De Cruz
pattern hits (distinct): 0
env values checked: 15; hits: none
```
