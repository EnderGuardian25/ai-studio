# Party Report: 033-folio-fidelity-pass

**Reviewed:** 2026-10-27
**Tier:** standard (classifier) — Roughly 70 UI files across many screens change in look only (markup, visible text and layout of Folio screens), with behaviour frozen by the guard rule and an empty NFR-01 diff, so the panel need not be deep even though the file count is large.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet)
**Verdict:** CHANGES_REQUESTED

## Summary

16 findings: 2 BLOCK, 10 WARN, 4 NOTE upheld — 0 withdrawn

## Findings

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

### [WARN] party-ba — "Not yet the Folio the user picked" is asserted, with no falsifiable acceptance criterion

**Quotes:**

> the app is not yet the Folio the user picked on 2026-10-07
> A full `ui-captures/033/` set for the user's review, which is the acceptance for the look.
> **Problem:** The main goal is fidelity to Folio, but the only acceptance for the look is the user viewing captures. No observation can make that fail. The proposal gives no measurable done-state. It also does not say what the 032 review missed. Round-1 findings from party-architect support this: the audit table has no defined shape, so "every audit row closed" cannot serve as the criterion yet.
> **Fix:** Add criteria that can fail. Every audit row is classified. Every look row is closed or ruled on by the user. Each §8.20–§8.27 element has a matching capture. State which gaps the 032 review missed.
> **Status:** upheld

### [WARN] party-ba — "About 60" screens and "12 new components" are unsourced counts that set scope

**Quotes:**

> About 60 Folio-era screens and components changed in 018–031, and none of them was compared against its Folio version for markup.
> Files affected:** about 70 (estimated)
> They are the insights page and its parts, the post style picker, the script font picker, the three draft-page notices, the caption route card and the rule review panel.
> **Problem:** The 60 figure is asserted with no source such as a diff command. The 12 is not reproducible from the text, because the named items sum to 8 before "its parts". party-architect's NOTE on enumerability agrees. The 70-file estimate rests on these two unverified quantities.
> **Fix:** Derive the counts from `git diff --stat 9f829456..HEAD` over the stated directories and list the 12 by path. Or drop the numbers and let the audit's first task set scope.
> **Status:** upheld

### [WARN] party-ba — "Look" versus "behaviour" is the load-bearing distinction and is left undefined at the edges

**Quotes:**

> **look**, which returns to Folio (structure of sections, rules, numbering, labels, type, spacing, cards or badges Folio did not use)
> Markup and visible text may now change; behaviour may not.
> Where a 018–031 change rearranged a screen on purpose, the new arrangement stays and only its look returns to Folio.
> **Problem:** "Structure of sections" is listed as look, but "a deliberate 018–031 arrangement" is listed as behaviour. A section or card that a feature introduced is both. One reading strips the 018–031 sections. The other keeps them and only restyles. These give two different builds. No tie-break defines "deliberate". party-architect's finding that the table has no third "ambiguous" class bears on the same gap.
> **Fix:** Define "deliberate", for example introduced by a named change with its own spec. Give a default for ambiguous rows.
> **Status:** upheld

### [NOTE] party-ba — "Folio showed the word Send" and crop marks rest on a prior-version recollection

**Quotes:**

> Show the word "Send" in the assistant drawers' Send buttons, as Folio did (`aria-label="Send"` stays).
> **Problem:** The proposal cites `9f829456` for the crop marks but gives no source for the Send claim. The 032 follow-ups list these items as "for the user to decide". The proposal does not say whether the user chose them. It also does not say whether the word fits the drawer layout or the §12 glossary.
> **Fix:** Cite the Folio file and line for Send, and record the user's decision.
> **Status:** upheld

### [BLOCK] party-po — A cheaper variant (the three known items plus a bounded audit) is never considered

**Quotes:**

> The user wants the original Folio plan back, on top of the new features, with the UI curated and adjusted as required.
> Files affected:** about 70 (estimated): about 60 Folio-era UI files to audit, of which an unknown share need fixes, plus the 12 new components and DESIGN_SYSTEM.md.
> Complexity:** large (wide, but each fix is local).
> **Problem:** The three named defects (hidden icons, "Send" label, crop marks) are about 3 small edits and capture the concrete, evidenced gap. The rest of the scope is an open-ended audit of about 60 files plus a redesign of 12 components, with no estimate of how many rows are "look". The proposal does not weigh the cheaper variants: ship the three items alone, or ship them and redesign only the highest-traffic screens, then decide on the rest from the captures. Round 2 confirms nobody else covered this. The architect and ba findings concern the contract and the counts, not the price. Both also show the scope is under-defined, which strengthens the case for a staged cut.
> **Fix:** Add a "cheaper variants" section that prices (a) the three items only and (b) the three items plus the 12 components, and state why the full audit is worth it.
> **Status:** upheld

### [BLOCK] party-po — The do-nothing option is not priced, and the Folio gap is not given a value

**Quotes:**

> That kept the risk low, but the app is not yet the Folio the user picked on 2026-10-07:
> The 12 screens and components new since Folio were restyled only through the shared class modules, never designed the way Folio builds a screen.
> **Problem:** If none of this ships, the app is already on Folio tokens, fonts and theme (032 is verified PASS, CI green). What gets worse is an aesthetic mismatch on a few screens. The proposal gives no cost to the user, no usage figure, and no consequence. Large, medium-risk work (E2E selector breakage, axe regressions) is being bought with no stated return beyond "the user wants it". The ba finding that 032's review passed and the proposal never says what it missed supports this.
> **Fix:** State what the user loses if only the 032 state ships. Use that to decide how much of the pass to fund.
> **Status:** upheld

### [WARN] party-po — Scope is unbounded: the audit's size is unknown, yet the proposal commits to fixing every "look" row

**Quotes:**

> The audit table and every **look** fix it lists, across the Folio-era UI files changed since `9f829456`.
> How many audit rows will turn out to be "look"? That is unknown until the audit runs
> **Problem:** "Every look fix" is a commitment with no cap. The cost is only known after the first task, but the proposal still sets the full scope and the full gate. Rows with a tiny visual gain (spacing, label tweaks) get the same E2E and capture cost as rows that are clearly worth it.
> **Fix:** Add a threshold or a budget, for example a cap on task count or on files touched. Make the audit a priced checkpoint that the user approves before the restyle tasks start. Treat the audit as a separate cut line.
> **Status:** upheld

### [WARN] party-po — The running cost of the proof is large and unstated

**Quotes:**

> The full gate: tsc, lint, unit, render, upgrade, the full clean mock E2E, build and CI.
> A full `ui-captures/033/` set for the user's review, which is the acceptance for the look.
> **Problem:** The full E2E (about 430 tests) is run over about 70 files of markup churn, probably more than once as selectors break. The user must also review a full capture set in light and dark. No count of screens, gate runs, or review minutes appears. Operator attention is the scarcest cost here, and it is unpriced. The architect's proposed deterministic attribute-diff check would add to this cost, so it should be priced too.
> **Fix:** State the capture count (screens x light/dark) and the expected number of full-gate runs. Consider running the full E2E per wave rather than per task, and have the user review only the screens with look fixes.
> **Status:** upheld

### [WARN] party-po — Rewriting DESIGN_SYSTEM.md §8.20–§8.27 and the new reference screenshots add scope with no stated value

**Quotes:**

> DESIGN_SYSTEM.md §8.20–§8.27 is rewritten to match.
> New `screen-light.png` and `screen-dark.png`.
> **Problem:** Docs follow the code, so a spec rewrite for 12 components that were redesigned in the same change is partly a by-product. It is still extra work with no named reader or consequence. Recapturing the reference screenshots is cheap and has value, because the current ones still show Graphite, but it is bundled with the rest and cannot ship alone.
> **Fix:** Cut the doc rewrite to the components that actually change. Ship the screenshot recapture on its own, ahead of the audit.
> **Status:** upheld

### [NOTE] party-po — Name the cut lines and a shipping order

**Quotes:**

> the plan's first task is the audit, and the restyle tasks are grouped by screen family once it is done.
> **Problem:** The proposal does not name which parts are worth shipping alone. Natural lines are: (1) the three known items, which are independent and cheap; (2) the audit table with a user ruling; (3) the 12-component redesign; (4) the remaining look fixes by screen family. Shipping (1) first gives the user a visible win and a real capture, so the user can judge whether (3) and (4) are needed.
> **Fix:** Order the work as 1, then a user checkpoint, then 3 or 4, with the stop point named.
> **Status:** upheld

## Dissent

No withdrawals.
