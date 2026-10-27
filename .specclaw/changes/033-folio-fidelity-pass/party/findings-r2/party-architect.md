### [WARN] party-architect — The Folio redesign of the 12 new components does not say whether it extends the shared class modules or bypasses them

**Quotes:** > The 12 screens and components new since Folio were restyled only through the shared class modules, never designed the way Folio builds a screen.
**Quotes:** > Each gets numbered ruled sections, small-caps labels, Fraunces headings and flat panels, with no Graphite-style cards or chips where Folio would not use them.
**Problem:** The proposal names the existing mechanism (the shared class modules) and says it was not enough, but it does not say where the Folio idiom will live. The Folio-era screens already build numbered ruled sections, small-caps labels and flat panels somehow. If each of the 12 components builds its own markup and classes for these, that is a second copy. Twelve local copies of the same section, label and panel pattern will drift apart from each other and from the Folio-era screens on the next restyle. If the work extends the shared modules instead, the change reaches every current consumer of those modules, including Folio-era screens outside the 12. The proposal does not name that co-change. No round-1 finding from another seat covers this seam, and nothing in round 2 answers it.
**Fix:** State the seam. Either add the Folio section, label and panel primitives to the shared class modules and list their existing consumers as part of the blast radius, or state why each component composes them locally and what stops the copies from drifting.
**Status:** upheld

### [WARN] party-architect — The audit table is a contract between three steps, and its shape and categories are unspecified

**Quotes:** > Classify every difference as **behaviour**, which stays (a feature, a flow, a condition, data, a deliberate 018–031 arrangement), or **look**, which returns to Folio
**Quotes:** > Record the audit as a table in the spec, so each fix traces to one row.
**Quotes:** > `aria-*`, `data-testid`, roles, accessible names, handlers, conditions, API calls and copy meaning stay unchanged unless the audit table names the change.
**Quotes:** > E2E and unit adaptations where a test asserted a non-Folio look (named in the report, never a behaviour assertion).
**Quotes:** > Some differences are ambiguous, where a 018–031 change altered both look and arrangement in one edit. The spec lists them for the user to rule on, rather than the build deciding.
**Problem:** Three steps read the table: it is the restyle work list, the exemption register for the item-5 guard, and the trace for each fix. The proposal does not give its columns (file, hunk or element, class, Folio reference, the attribute or selector change the row permits). It states two classes, but the Open Questions add a third (ambiguous, awaiting the user), with no state for such a row in the table and no rule for what the build does with it. Permitted test changes are recorded in a second place ("the report"), not in the table, so the record of allowed deviations is split across two documents that can disagree. Two implementers would build different tables, and a reviewer could not check a fix against a row. party-ba's finding on look versus behaviour asks what "deliberate" means. This finding asks for the shape of the register that holds the answer. The two are complementary, not duplicates.
**Fix:** Define the table's columns in the proposal or spec. Include a third class (`ambiguous — user to rule`) and a column for any `aria-*`, `data-testid` or test-assertion change the row permits. Make the table the one register, so a test adaptation cites its row.
**Status:** upheld

### [WARN] party-architect — The behaviour guard has no deterministic check, and the E2E suite that proves behaviour is edited in the same change

**Quotes:** > `aria-*`, `data-testid`, roles, accessible names, handlers, conditions, API calls and copy meaning stay unchanged unless the audit table names the change.
**Quotes:** > The full gate: tsc, lint, unit, render, upgrade, the full clean mock E2E, build and CI.
**Quotes:** > E2E and unit adaptations where a test asserted a non-Folio look (named in the report, never a behaviour assertion).
**Problem:** Item 5 is stated as a rule, but nothing checks it. The only checks the proposal names for this change are the wording guard and the token guard, and neither covers `aria-*`, `data-testid`, roles or handlers. The E2E suite catches only the selectors it asserts, and this change may also edit that suite, so the guard and what it guards change in one commit. About 70 files will have markup open to change. A dropped `data-testid` or handler that no test asserts passes every listed gate. The invariant can be checked without a model or the network: extract the `aria-*`, `data-testid`, `role` and `on*` attributes per file at the 032 baseline and at HEAD, then diff them against the rows the audit table permits.
**Fix:** Add a deterministic invariant check to the gate: a script or unit test that compares the attribute and handler sets against the 032 baseline and reads its exceptions from the audit table. Otherwise, state why review alone is enough.
**Status:** upheld

### [WARN] party-architect — "NFR-01's diff from 032" names a contract the proposal never defines

**Quotes:** > Any behaviour change: features, flows, routes, API, Prisma, providers, scheduler, MCP, ACP, analytics events and prompts. NFR-01's diff from 032 must stay empty.
**Problem:** This is the one check the proposal offers for "no behaviour change", but it gives neither the path set nor the baseline. It does not say whether NFR-01 is 032's requirement carried over or a new 033 requirement. It does not say which directories or globs NFR-01 covers, for example whether `src/lib` is in it, given that the audit set is `src/app/(app)`, `src/app/(auth)` and `src/components`. It does not say which commit "032" means. Two implementers would diff different path sets against different commits.
**Fix:** State the NFR-01 contract in the proposal: the exact path globs that must have an empty diff, and the baseline commit.
**Status:** upheld

### [NOTE] party-architect — The audit's file set and the list of 12 new components are not fully enumerable from the text

**Quotes:** > That is each file under `src/app/(app)`, `src/app/(auth)` and `src/components` that existed in Folio and has changed.
**Quotes:** > They are the insights page and its parts, the post style picker, the script font picker, the three draft-page notices, the caption route card and the rule review panel.
**Problem:** The rule "existed in Folio and has changed" does not say what happens to a file that 018–031 renamed or moved. Read literally, such a file belongs to neither the audit set nor the "new" set, so it is restyled by neither step. This rename gap is the structural point here and is not raised by any other seat. The second half, that the 12 cannot be counted from the text, overlaps party-ba's finding on unsourced counts. That half stands here only as the partition question: every UI file must fall in exactly one of the two sets.
**Fix:** Say how renamed or moved files are classified, and list the 12 components by path so the two sets partition the UI files.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po: the §8.20–§8.27 rewrite is coupled to the redesign and the audit, and the reference screenshots are coupled to the last look change

**Quotes:** > DESIGN_SYSTEM.md §8.20–§8.27 is rewritten to match.
**Quotes:** > Compare it with its `9f829456` version and with DESIGN_SYSTEM.md.
**Quotes:** > New `screen-light.png` and `screen-dark.png`.
**Problem:** party-po calls the doc rewrite a by-product and asks to cut it to the components that change. Under item 4, all 12 components that §8.20–§8.27 documents are redesigned, so every section in that range changes. The audit also uses DESIGN_SYSTEM.md as its comparison reference. If the rewrite does not land in the same commit as the redesign, the reference describes the pre-033 look of components the code no longer has, and the next audit row checked against it is wrong. As a coupling fact, the rewrite lands with item 4. party-po also asks to ship the screenshot recapture on its own, ahead of the audit. A recapture taken before the look fixes captures screens that the audit then changes, so it has to be redone after the last look change. The reference screenshots are coupled to the final restyle commit, not separable ahead of it. This is a coupling statement only; the release order remains party-po's call.
**Fix:** Keep the §8.20–§8.27 rewrite in the same commit or wave as the item-4 redesign. If the screenshots are recaptured early, record that they are recaptured again after the last look fix.
**Status:** upheld
