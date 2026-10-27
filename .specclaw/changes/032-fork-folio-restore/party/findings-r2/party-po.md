### [BLOCK] party-po — A 150-200 file re-theme is priced as the only option; the cheaper variant (keep Graphite, ship the other three items) is never considered

**Quotes:**

> **Size:** architectural. It is a re-theme across about 150 files, with a Graphite → Folio mapping for components that never existed in Folio.
> **Files affected:** about 150–200 (estimated)
>
> 1. **Graphite instead of Folio.** Change 021 re-themed the app from Folio ... because the company "wants this system to look different from the fork".
>    **Problem:** Re-checked against the proposal's Decisions section. It records the user's choices (neutral modules with Folio values, delete the company docs) but still states no value for the Folio restore itself. It also doesn't price the do-nothing option of staying on Graphite. The only stated reason for Graphite, the company's wish, no longer applies, so the real value is the user's preference, which the proposal never names or compares with the cost. The "keep 021's neutral modules" decision does partly adopt a token-only approach, which lowers the cost. That is a good sign, but the proposal still sizes the work at 150-200 files and does not weigh the value against that price. Items 2-4 remain cheap and independent of item 1.
>    **Fix:** Split the change. Ship items 2-4 first, then run the Folio re-theme as its own change with its own value statement. In that statement, name the do-nothing cost of staying on Graphite and compare the token-only variant with the file restore.
>    **Status:** upheld

### [WARN] party-po — "Restore" and "restyle" are two different costs bundled under one line, with no cut line

**Quotes:**

> For files 021 changed and nothing after it touched, restore their `9f829456` version. For files 023–031 changed after 021, keep their behaviour and restyle them with the Folio primitives and tokens.
> Planning picks one.
> **Problem:** Restoring untouched files is mechanical. Restyling the roughly 104 files built after 021 is the costly, risky part. The proposal names no shippable intermediate, so the re-theme is all-or-nothing. The "Planning picks one" line is now settled by the module-structure decision, but the proposal still doesn't say how the work splits into waves.
> **Fix:** Name the cut line. Wave 1: tokens, fonts, wordmark, guards and the `atoms.ts` values. Wave 2: the per-feature 023-031 screens. State which waves are worth shipping on their own.
> **Status:** upheld

### [WARN] party-po — Running cost of the full gate and the screenshot/doc restoration is not stated

**Quotes:**

> Items 1–4 above, in light and dark themes, with the full gate: tsc, lint, unit, `test:render`, and a full clean mock E2E on the fork's own stack.
> Restore the Folio `DESIGN_SYSTEM.md` and screenshots, and archive the Graphite version under `docs/ui-reference/archive/graphite/`.
> **Problem:** The proposal gives no number of full E2E reruns (the suite is about 600 cases) and no estimate of the operator attention needed to review light and dark screens. The second archive keeps a theme the user is discarding, and git history already holds it.
> **Fix:** State the expected number of full E2E runs (for example, one per wave). Drop the Graphite archive unless a named reason requires it.
> **Status:** upheld

### [NOTE] party-po — Fork port defaults: pick them now rather than leave an open question

**Quotes:**

> 1. Fork host ports: the proposal assumes Postgres `5442`, MinIO `9100`/`9101`, and test stack `5443`/`9110`. Any preference?
>    **Problem:** The proposal already assumes values, and `.env` can override them. The question adds a prompt for little value.
>    **Fix:** Adopt the assumed ports as defaults, note that `.env` overrides them, and drop the open question.
>    **Status:** upheld
