### [WARN] party-architect — The Folio redesign of the 12 new components does not say whether it extends the shared class modules or bypasses them

**Quotes:** > The 12 screens and components new since Folio were restyled only through the shared class modules, never designed the way Folio builds a screen.
**Quotes:** > Each gets numbered ruled sections, small-caps labels, Fraunces headings and flat panels, with no Graphite-style cards or chips where Folio would not use them.
**Problem:** The proposal names the existing mechanism (the shared class modules) and says it was not enough, but it does not say where the Folio idiom will live. The Folio-era screens already build numbered ruled sections, small-caps labels and flat panels somehow. If each of the 12 components builds its own markup and classes for these, that is a second copy, and twelve local copies of the same section/label/panel pattern will drift apart from each other and from the Folio-era screens on the next restyle. If instead the work extends the shared modules, the change reaches every current consumer of those modules, including Folio-era screens outside the 12. That co-change is not named.
**Fix:** State the seam. Either add the Folio section, label and panel primitives to the shared class modules (and list their existing consumers as part of the blast radius), or state why each component composes them locally and what stops the copies from drifting.
**Status:** upheld

### [WARN] party-architect — The audit table is a contract between three steps, and its shape and categories are unspecified

**Quotes:** > Classify every difference as **behaviour**, which stays (a feature, a flow, a condition, data, a deliberate 018–031 arrangement), or **look**, which returns to Folio
**Quotes:** > Record the audit as a table in the spec, so each fix traces to one row.
**Quotes:** > `aria-*`, `data-testid`, roles, accessible names, handlers, conditions, API calls and copy meaning stay unchanged unless the audit table names the change.
**Quotes:** > E2E and unit adaptations where a test asserted a non-Folio look (named in the report, never a behaviour assertion).
**Quotes:** > Some differences are ambiguous, where a 018–031 change altered both look and arrangement in one edit. The spec lists them for the user to rule on, rather than the build deciding.
**Problem:** The table is consumed three ways: as the restyle work list, as the exemption register for the item-5 guard, and as the trace for each fix. Its columns (file, hunk or element, class, Folio reference, the permitted attribute or selector change) are not given. The classification is stated as two values, but the Open Questions add a third (ambiguous, awaiting the user) with no stated state in the table or rule for what the build does with such a row. Permitted test changes are recorded in a second place ("the report"), not the table, so the record of allowed deviations is split across two documents that can disagree. Two implementers would build different tables, and a reviewer could not check a fix against a row.
**Fix:** Define the table's columns in the proposal or spec, including a third class (`ambiguous — user to rule`) and a column for any `aria-*`/`data-testid`/test-assertion change the row permits. Make the table the one register: a test adaptation cites its row.
**Status:** upheld

### [WARN] party-architect — The behaviour guard has no deterministic check, and the E2E suite that proves behaviour is edited in the same change

**Quotes:** > `aria-*`, `data-testid`, roles, accessible names, handlers, conditions, API calls and copy meaning stay unchanged unless the audit table names the change.
**Quotes:** > The full gate: tsc, lint, unit, render, upgrade, the full clean mock E2E, build and CI.
**Quotes:** > E2E and unit adaptations where a test asserted a non-Folio look (named in the report, never a behaviour assertion).
**Problem:** Item 5 is stated as a rule, but no mechanism checks it. Of the listed gates, only the wording and token guards are named as checks on this change, and neither covers `aria-*`, `data-testid`, roles or handlers. The E2E suite catches only the selectors it asserts, and this change may also edit that suite, so the guard and what it guards change in one commit. Across about 70 files with markup now open to change, a dropped `data-testid` or handler that no test asserts goes through every listed gate. The invariant can be checked without a model or the network: extract the `aria-*`, `data-testid`, `role` and `on*` attributes per file at the 032 baseline and at HEAD, then diff them against the audit table's permitted rows.
**Fix:** Add a deterministic invariant check (a script or unit test that compares the attribute and handler sets against the 032 baseline, with exceptions read from the audit table) as part of the gate, or state why review alone is enough.
**Status:** upheld

### [WARN] party-architect — "NFR-01's diff from 032" names a contract the proposal never defines

**Quotes:** > Any behaviour change: features, flows, routes, API, Prisma, providers, scheduler, MCP, ACP, analytics events and prompts. NFR-01's diff from 032 must stay empty.
**Problem:** This is the one check the proposal offers for "no behaviour change", but neither the path set nor the baseline is given. It does not say whether NFR-01 is 032's requirement carried over or a new 033 requirement, which directories or globs it covers (for example whether `src/lib` is in it, given that the audit set is `src/app/(app)`, `src/app/(auth)` and `src/components`), or which commit "032" means. Two implementers would diff different path sets against different commits.
**Fix:** State the NFR-01 contract in the proposal: the exact path globs that must have an empty diff, and the baseline commit.
**Status:** upheld

### [NOTE] party-architect — The audit's file set and the list of 12 new components are not fully enumerable from the text

**Quotes:** > That is each file under `src/app/(app)`, `src/app/(auth)` and `src/components` that existed in Folio and has changed.
**Quotes:** > They are the insights page and its parts, the post style picker, the script font picker, the three draft-page notices, the caption route card and the rule review panel.
**Problem:** The rule "existed in Folio and has changed" does not say what happens to a file that 018–031 renamed or moved. Read literally, such a file belongs to neither the audit set nor the "new" set. The list of new components names seven items plus "its parts", so the count of 12 cannot be checked against the text. Each set can be derived with git, but the rename case and the members of "its parts" are left to the implementer.
**Fix:** Say how renamed or moved files are classified, and list the 12 components by path.
**Status:** upheld
