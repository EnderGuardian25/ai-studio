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
