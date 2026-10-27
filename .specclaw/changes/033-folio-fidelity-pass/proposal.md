# Proposal: Folio fidelity pass on top of 018–031

**Created:** 2026-10-27
**Status:** ✅ Approved (2026-10-27, architectural)

## Problem

Change 032 brought Folio back. It restored the tokens, fonts, Tailwind theme, wordmark and helper values, and it restyled the screens that 018–031 had changed. 032's restyle rule allowed only class strings, atom references, presentational props and imports to change. Markup, visible text, `aria-*`, `data-testid`, roles, handlers and conditions had to stay untouched. That kept the risk low, but the app is not yet the Folio the user picked on 2026-10-07:

- **Hidden sidebar nav icons.** Folio's sidebar is text only. The icons that 018–031 added are still in the markup with `hidden` (`src/components/layout/AppShell.tsx:109` and `:182`).
- **Icon-only Send buttons.** The Send buttons in the brand-kit assistant and the briefing assistant show only an icon, where Folio showed the word "Send".
- **No crop marks.** The draft page's proof plate (DESIGN_SYSTEM.md §8.12) lost its four crop marks.
- **Unaudited screens.** About 60 Folio-era screens and components changed in 018–031, and none of them was compared against its Folio version for markup. The 12 screens and components new since Folio were restyled only through the shared class modules, never designed the way Folio builds a screen.

The user wants the original Folio plan back, on top of the new features, with the UI curated and adjusted as required.

## Proposed Solution

This change is a Folio fidelity pass. Markup and visible text may now change; behaviour may not.

1. **The three known items.**
   - Remove the hidden nav icons and their imports.
   - Show the word "Send" in the assistant drawers' Send buttons, as Folio did (`aria-label="Send"` stays).
   - Restore the four proof-plate crop marks on the draft page (§8.12, from `9f829456`).
2. **An audit of every UI file changed since `9f829456`.** That is each file under `src/app/(app)`, `src/app/(auth)` and `src/components` that existed in Folio and has changed.
   - Compare it with its `9f829456` version and with DESIGN_SYSTEM.md.
   - Classify every difference as **behaviour**, which stays (a feature, a flow, a condition, data, a deliberate 018–031 arrangement), or **look**, which returns to Folio (structure of sections, rules, numbering, labels, type, spacing, cards or badges Folio did not use).
   - Record the audit as a table in the spec, so each fix traces to one row.
3. **Layout rule (user decision, 2026-10-27).** Where a 018–031 change rearranged a screen on purpose, the new arrangement stays and only its look returns to Folio. For example, Refine Design stays under the Preview (026), and the floating Create post button (020) stays.
4. **The 12 components new since Folio are redesigned in Folio's idiom** (user decision, 2026-10-27). They are the insights page and its parts, the post style picker, the script font picker, the three draft-page notices, the caption route card and the rule review panel. Each gets numbered ruled sections, small-caps labels, Fraunces headings and flat panels, with no Graphite-style cards or chips where Folio would not use them. DESIGN_SYSTEM.md §8.20–§8.27 is rewritten to match.
5. **The guard.**
   - `aria-*`, `data-testid`, roles, accessible names, handlers, conditions, API calls and copy meaning stay unchanged unless the audit table names the change.
   - Visible text changes only when Folio's text differs and the 031 wording glossary (§12) allows it.
   - The 031 wording guard and the token guard keep passing.
6. **Proof.**
   - The full gate: tsc, lint, unit, render, upgrade, the full clean mock E2E, build and CI.
   - New `screen-light.png` and `screen-dark.png`.
   - A full `ui-captures/033/` set for the user's review, which is the acceptance for the look.

## Scope

### In Scope

- The three known items above.
- The audit table and every **look** fix it lists, across the Folio-era UI files changed since `9f829456`.
- A Folio redesign of the 12 new components, and §8.20–§8.27 rewritten to match.
- E2E and unit adaptations where a test asserted a non-Folio look (named in the report, never a behaviour assertion).
- New reference screenshots, a full capture set, `CLAUDE.md` "Current state" and the history notes.

### Out of Scope

- Any behaviour change: features, flows, routes, API, Prisma, providers, scheduler, MCP, ACP, analytics events and prompts. NFR-01's diff from 032 must stay empty.
- Undoing a deliberate 018–031 arrangement (user decision: the new arrangement stays, Folio style).
- Changing the Folio tokens or `study-b-folio.html`. Those were restored in 032 and stay as they are.
- Copy rewrites beyond what Folio's text and the §12 glossary require.
- Generated post designs, templates and the renderer (post HTML is not app UI).

## Impact

- **Size:** architectural. Party tier `standard` seeds architectural, and the change adds an interface others depend on: Folio primitives in the shared class modules, and a new behaviour-invariant check in the gate.
- **Files affected:** about 70 (estimated): about 60 Folio-era UI files to audit, of which an unknown share need fixes, plus the 12 new components and DESIGN_SYSTEM.md.
- **Complexity:** large (wide, but each fix is local).
- **Risk:** medium. Markup changes can break E2E selectors and accessibility checks (axe runs in E2E). The guard rule and the full gate contain it.

## Open Questions

- How many audit rows will turn out to be "look"? That is unknown until the audit runs, so the plan's first task is the audit, and the restyle tasks are grouped by screen family once it is done.
- Some differences are ambiguous, where a 018–031 change altered both look and arrangement in one edit. The spec lists them for the user to rule on, rather than the build deciding.
- (party-po, BLOCK) No cheaper variant is priced: (a) the three items only, (b) the three items plus the 12 components. Say why the full audit is worth it. See party-report.md.
- (party-po, BLOCK) The do-nothing option is not priced. What does the user lose if only the 032 state ships? See party-report.md.
- (party-po) The scope is unbounded ("every look row"). Add a cap or make the audit a priced checkpoint the user approves before the restyle tasks. See party-report.md.
- (party-po) The proof's running cost is unstated: the capture count, the number of full-gate runs, and the user's review time. See party-report.md.
- (party-po) The §8.20–§8.27 rewrite and the screenshot recapture have no stated value; ship the recapture separately. (party-architect rebuts: both are coupled to the redesign and to the last look fix.) See party-report.md.
- (party-po) Name the cut lines and a shipping order: three items, then a user checkpoint, then the redesign or the look fixes. See party-report.md.
- (party-architect) Where does the Folio idiom live for the 12 components: the shared class modules (whose consumers widen the blast radius) or local markup (drift)? See party-report.md.
- (party-architect) The audit table's columns are undefined. It needs a third class, `ambiguous — user to rule`, and a permitted attribute/test-change column, and it must be the one register. See party-report.md.
- (party-architect) The behaviour guard has no deterministic check. Add an attribute and handler diff (`aria-*`, `data-testid`, `role`, `on*`) against the 032 baseline, with exceptions read from the table. See party-report.md.
- (party-architect) The NFR-01 contract is undefined: name the path globs and the baseline commit. See party-report.md.
- (party-architect) How are files renamed by 018–031 classified? List the 12 components by path so the sets partition the UI. See party-report.md.
- (party-architect) The §8.20–§8.27 rewrite lands with the redesign, and the reference screenshots are taken after the last look fix. See party-report.md.
- (party-ba) There is no acceptance that can fail: require every row classified, every look row closed or ruled, and a capture for each §8.20–§8.27 element. State what the 032 review missed. See party-report.md.
- (party-ba) The counts "about 60" and "12" are unsourced. Derive them with git and list the new components by path. See party-report.md.
- (party-ba) "Deliberate" is undefined at the look/behaviour edge. Define it and give a default for ambiguous rows. See party-report.md.
- (party-ba) The Send claim has no Folio source. Cite the file and line, and record that the user chose the three items. See party-report.md.

## Panel rulings (user, 2026-10-27)

The plan takes these as its brief. They answer the panel's open questions above.

- **Why (party-po BLOCK, do-nothing):** one coherent product. Every screen should read as the same Folio product. Today the 018–031 screens carry Folio colours on a non-Folio structure. The user chose these three items and the full pass after the 032 captures, so the 032 review accepted the restyle, not the structure.
- **Staging (party-po BLOCK, cheaper variants):** a checkpoint after the audit.
  - Wave 1 ships the three known items and the audit table with its counts.
  - The user approves the table, ruling on every `ambiguous` row, before any restyle task starts. The full pass may be cut at that checkpoint.
  - Then the 12-component redesign, with §8.20–§8.27 in the same wave, and the look fixes by screen family.
  - The reference screenshots are recaptured after the last look fix.
- **The edge rule (party-ba):** an arrangement is deliberate only if a 018–031 change's proposal or spec names it (for example 026's Refine Design under the Preview, and 020's floating Create post button). Anything else is look and returns to Folio. A row that stays unclear is `ambiguous` and goes to the user at the checkpoint.
- **Counts, from git** (`git diff --name-status -M 9f829456 c45ed3dc -- 'src/app/(app)' 'src/app/(auth)' src/components`):
  - **The audit set:** 64 modified files.
  - **The seam, not audit rows:** the 4 renames, `folio.*` to `atoms.ts`, `classes.ts` (twice) and `GateNotice.tsx`, which 032 restored.
  - **The 12 new components:** `src/app/(app)/admin/insights/page.tsx`; `admin/insights/{DataTable,InsightSection,RateBar,sections}.tsx`; `admin/brandkits/ScriptFontPicker.tsx`; `brief/PostStylePicker.tsx`; `drafts/{CompositionNotice,FactsCheckNotice,HeadlineImageNotice}.tsx`; `team/CaptionRouteCard.tsx`; `textUpgrade/RuleReviewPanel.tsx`.
  - **Helpers, not redesigned:** 4 new non-UI modules, `insights/format.ts`, `brief/classes.ts`, `campaigns/postStyleOptions.ts` and `textUpgrade/useRuleReview.ts`.
- **Plan-level answers (orchestrator; the spec states them):**
  - **The seam:** Folio primitives are added to the shared class modules, and their consumers are listed in the scope.
  - **The audit table:** defined columns and three classes, and it is the single register.
  - **The behaviour check:** a deterministic attribute and handler diff against `c45ed3dc`.
  - **NFR-01:** an empty diff over `src/lib src/app/api src/providers src/scheduler src/mcp prisma` from `c45ed3dc`.
  - **Acceptance that can fail:** every row classified, every look row closed or ruled on, and a capture per new component.
  - **The Send source:** `9f829456` `BrandKitAssistantPanel.tsx:416` shows the word "Send".
