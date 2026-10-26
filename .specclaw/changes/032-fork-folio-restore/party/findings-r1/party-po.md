### [BLOCK] party-po — A 150-200 file re-theme is priced as the only option; the cheaper variant (keep Graphite, ship the other three items) is never considered

**Quotes:**

> **Size:** architectural. It is a re-theme across about 150 files, with a Graphite → Folio mapping for components that never existed in Folio.
> **Files affected:** about 150–200 (estimated)
>
> 1. **Graphite instead of Folio.** Change 021 re-themed the app from Folio ... because the company "wants this system to look different from the fork".
>    **Problem:** The do-nothing option for item 1 is that the fork's UI looks like Graphite. The proposal states no user-facing harm from that and no cost of keeping it. The only stated motive is that the company wanted a different look. The company repo is now disconnected, so that reason no longer applies. The price is a large, medium-risk change, with a full E2E rerun and a design pass for every 023-031 component that has no Folio reference. Items 2-4 are small and independent: delete a workflow, edit docs, change compose ports. A cheaper variant exists and is not weighed: ship 2-4 now, and treat Folio as a separate change or drop it. If the user simply prefers Folio, that preference must be stated as the value, and compared with the cost.
>    **Fix:** Split the change. Ship items 2-4 first (CI, docs, own Docker stack), since they are cheap and unblock the fork. Make the Folio re-theme its own change with its own value statement. Name the do-nothing cost of staying on Graphite, and compare a token-only variant (Folio values in the Graphite modules) with restoring files.
>    **Status:** upheld

### [WARN] party-po — "Restore" and "restyle" are two different costs bundled under one line, with no cut line

**Quotes:**

> For files 021 changed and nothing after it touched, restore their `9f829456` version. For files 023–031 changed after 021, keep their behaviour and restyle them with the Folio primitives and tokens.
> Planning picks one.
> **Problem:** Restoring untouched files is mechanical and cheap. Restyling about 104 files that were built after 021 is the expensive, risky part. The proposal does not say how the work splits, and the sizing is an estimate of 150-200 files. It never names a shippable intermediate, for example the tokens, fonts, logo and guards first, with the rest of the screens following. A single all-or-nothing gate means a half-done re-theme cannot ship. "Planning picks one" leaves open whether the module structure is restored or kept, which changes the file count.
> **Fix:** Name the cut line. Wave 1: tokens, fonts, wordmark, guards and the `atoms.ts` values, which re-themes most screens through shared classes. Wave 2: the per-feature 023-031 screens. Say which waves are independently worth shipping.
> **Status:** upheld

### [WARN] party-po — Running cost of the full gate and the screenshot/doc restoration is not stated

**Quotes:**

> Items 1–4 above, in light and dark themes, with the full gate: tsc, lint, unit, `test:render`, and a full clean mock E2E on the fork's own stack.
> Restore the Folio `DESIGN_SYSTEM.md` and screenshots, and archive the Graphite version under `docs/ui-reference/archive/graphite/`.
> **Problem:** The gate is one full E2E, about 600 cases, plus CI. The restyle touches tests that "assert on styling and copy". The proposal gives no number for how many E2E reruns it expects, nor for the operator attention needed to review light and dark screens. Archiving Graphite adds a second archive for a theme the user is discarding. Its value is not stated.
> **Fix:** State the expected number of full E2E runs (one per wave, for example). Drop the Graphite archive unless there is a named reason to keep it; git history already holds it.
> **Status:** upheld

### [NOTE] party-po — Fork port defaults: pick them now rather than leave an open question

**Quotes:**

> 1. Fork host ports: the proposal assumes Postgres `5442`, MinIO `9100`/`9101`, and test stack `5443`/`9110`. Any preference?
>    **Problem:** The proposal already assumes values. A question to the user for a default that is overridable through `.env` is an extra prompt for little value.
>    **Fix:** Adopt the assumed ports as defaults and note that `.env` overrides them. Drop the open question.
>    **Status:** upheld
