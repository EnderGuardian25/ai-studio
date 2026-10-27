# Spec: Folio fidelity pass on top of 018–031

**Change:** 033-folio-fidelity-pass · **Size:** architectural
**Created:** 2026-10-27
**Source:** [`proposal.md`](proposal.md) (approved 2026-10-27; the "Panel rulings" section is the brief) and [`party-report.md`](party-report.md).

## Overview

032 restored Folio's values, fonts, wordmark and the 021-only screens, then restyled the 018–031 screens under a rule that allowed only class changes. The result is Folio colour and type on a structure that is often not Folio's. This change brings every screen back to the way Folio builds a screen, on top of the 018–031 features. **Why** (user, 2026-10-27): every screen should read as the same Folio product.

It runs in two waves with a user checkpoint between them:

- **W1, evidence and the known gaps.**
  - A deterministic behaviour-invariant check, and capture coverage for every screen state this change touches.
  - The three known items: the hidden nav icons, the word "Send", and the crop marks.
  - The audit table of every look difference.
  - The W1 gate and push.
  - **Checkpoint:** the user approves the audit table and rules on its ambiguous rows. The pass may be cut here.
- **W2, the pass.**
  - Folio primitives in the shared class modules.
  - Four screen-family tasks. Each one closes its approved audit rows, redesigns the new components in that family, and rewrites their DESIGN_SYSTEM.md sections.
  - The final gate, screenshots, docs and push.

Behaviour does not change. Markup and visible text may change only where an audit row says so.

## Approach

- **The Folio reference** is `9f829456` (the last Folio commit before 021), `docs/ui-reference/DESIGN_SYSTEM.md` and `docs/ui-reference/direction-studies/study-b-folio.html`.
- **The behaviour baseline** is `c45ed3dc` (032 verified PASS; CI green on `468a2018`, with the same `src/` tree).
- **One register.** `audit.md` in this change folder holds every difference as a row. A row is the work list, the trace for each fix and commit, and the only place an attribute, handler or test change can be permitted (party-architect).
- **One check per promise.**
  - "Behaviour stays": `scripts/check-ui-invariants.mjs` compares attributes and handlers with `c45ed3dc`, and the NFR-01 diff stays empty.
  - "Restored files stay Folio": `check-folio-restore.mjs`.
  - "Every audit file is covered": the check's `--coverage` mode.
  - "Tokens and words": the existing guards.
- **The Folio idiom lives in the shared modules** (party-architect). Section, label, row and panel patterns are added to `src/components/ui/atoms.ts` and the existing primitives (`SectionHead`, `Panel`, `PageHead`, `Notice`, `FieldLabel`). They are not copied into components. The token guard already fails on a local copy of a shared atom.
- **The edge rule** (user, 2026-10-27). An arrangement is **deliberate**, and stays, only if a 018–031 change's `proposal.md` or `spec.md` names it. Anything else is **look**, and returns to Folio. A difference that stays unclear is **ambiguous** and goes to the user at the checkpoint.

### Sizing (party-ba: cited counts)

Run on 2026-10-27, with the command `git diff --name-status -M 9f829456 c45ed3dc -- 'src/app/(app)' 'src/app/(auth)' src/components`:

| Set                                                                                             | Count | Treatment                                               |
| ----------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------- |
| Modified (M)                                                                                    | 64    | split below                                             |
| …of which the restore check pins to `9f829456` (`scripts/check-folio-restore.mjs` lists)        | 17    | already Folio; not audited, must stay byte-equal        |
| …the **audit set**                                                                              | 47    | audited (design §2.1)                                   |
| Renamed (R): `folio.*` → `atoms.ts`, `classes.ts` ×2, `GateNotice.tsx`                          | 4     | the seam: extended in W2, not audited                   |
| Added (A): new UI components                                                                    | 12    | redesigned in W2 (design §2.2)                          |
| Added (A): helpers (`format.ts`, `brief/classes.ts`, `postStyleOptions.ts`, `useRuleReview.ts`) | 4     | behaviour or class data; changed only if a row needs it |
| Deleted (D): `admin/brandkits/googleFonts.ts`                                                   | 1     | none                                                    |

## Requirements

### Functional requirements

**W1**

- **FR-01 — The behaviour-invariant check.** `scripts/check-ui-invariants.mjs`, a pure Node script that uses the `typescript` package already in `node_modules`, parses every `.tsx` file under `src/app` and `src/components`:
  - **At HEAD and at `c45ed3dc`,** it collects each JSX attribute named `aria-*`, `data-testid`, `role`, `id`, `htmlFor`, `type`, `name`, `href` or `on[A-Z]*`, with its value text (whitespace-normalised).
  - **It compares the two multisets over the whole scope,** so an element that moves between files does not fail.
  - **It prints each added or removed attribute** with the file it came from.
  - **It exits 1 on any difference that no `audit.md` row permits.** A permit has the form `-<file>:<attr>=<value>` or `+<file>:<attr>=<value>`, in the row's Permits column.
  - **It also exits 1** when a permit cites a row that does not exist, or a row whose Status is not `approved` or `closed`.
  - **`--coverage` mode** exits 1 when a file of the audit set has no row in `audit.md`.
  - **Unit tests:** `tests/unit/uiInvariants.test.ts` covers the pure core on fixtures, one case per rule.
- **FR-02 — Capture coverage.** `scripts/capture-ui.mjs` gains the states that 032 never captured:
  - the brief wizard steps that hold the post style picker and the image look picker;
  - a brand kit's detail, with the script font picker;
  - the brand-kit assistant drawer;
  - the campaign briefing drawer;
  - the rule review panel, opened through the mock Improve reply;
  - `/admin/insights`;
  - a draft showing each of the three notices: the image-style fallback, a flagged facts check and a stale headline, each made through the existing mock sentinels against the mock server.

  Each new state is captured in light and dark, at 1440 and at 375.

- **FR-03 — Sidebar icons.** `AppShell.tsx` no longer renders a nav or Sign out icon (today they are `className="hidden"`, lines 109 and 182). The icon fields and imports used only by them are removed. This matches `9f829456` and DESIGN_SYSTEM.md §8.6.
- **FR-04 — Send shows its word.** The Send buttons in `BrandKitAssistantPanel.tsx` and `BriefingAssistantPanel.tsx` show the visible word "Send" plus the icon, as at `9f829456` (`BrandKitAssistantPanel.tsx:416`, and the matching lines in `BriefingAssistantPanel.tsx`). `aria-label="Send"` stays. The refine panel's Send keeps whatever `9f829456` showed for it.
- **FR-05 — Crop marks.** The draft page's proof plate draws the four crop marks again, with the `CROP` constant and the four `aria-hidden` spans of `9f829456` `drafts/[id]/page.tsx:66–68, 318–323`, placed on the 028+ preview container. The one `// ui-exception:` that DESIGN_SYSTEM.md §8.12 allows keeps its form.
- **FR-06 — The audit table.** `audit.md` lists every look, behaviour or ambiguous difference between each audit-set file at `c45ed3dc` and its `9f829456` version, measured against DESIGN_SYSTEM.md. The columns and statuses are in design §3. Every audit-set file has at least one row; a file with no difference gets one `none` row. Each `behaviour` row cites the change and the line in that change's proposal or spec that names the arrangement. Each `ambiguous` row states the question for the user. The audit also lists, per screen family, the 12 new components and the DESIGN_SYSTEM.md sections each will get.
- **FR-07 — The W1 gate and checkpoint.**
  - The full gate (NFR-03) runs, then the scan and the push.
  - The orchestrator gives the user the audit table's counts by class and by family, and a short list of captures to review (the three known items' screens).
  - The user's approval and every ambiguous ruling are recorded in `audit.md`, with the date. No W2 task starts before that.

**W2**

- **FR-08 — Folio primitives.** `atoms.ts` and the `ui/` primitives gain what the approved rows need to build a screen Folio's way (design §4). Each addition is named in `DESIGN_SYSTEM.md` §8.18 "Page primitives". Every existing consumer of a changed primitive is listed in the task report and checked in its capture.
- **FR-09 — Family passes.** Four tasks, one per screen family (design §5). Each one:
  - closes its family's approved `look` rows;
  - leaves its `behaviour` rows as they are;
  - applies the user's rulings on its `ambiguous` rows;
  - redesigns that family's new components (FR-10);
  - rewrites their DESIGN_SYSTEM.md sections;
  - sets each closed row to `closed` with its commit.
- **FR-10 — The 12 new components in Folio's idiom.**
  - **Structure:** numbered ruled sections where the screen numbers its sections, small-caps labels (`EYEBROW`/`FieldLabel`), Fraunces headings (`SectionHead`, `SUB_HEAD`), and flat ruled rows or `Panel`.
  - **Not used:** cards, pills, tinted badges or rounded boxes where Folio would not use them.
  - **Notices:** use `Notice`, Folio's form.
  - **Tables:** use §8.15.
- **FR-11 — DESIGN_SYSTEM.md §8.20–§8.27 rewritten.** Each section lands in the same commit as its component, so the reference never describes code that no longer exists (party-architect). Each section names its file, the primitives it uses and its states.
- **FR-12 — Tests follow the look, never the behaviour.** An E2E or unit assertion on a non-Folio look (a class, a radius, an icon-only button) may be adapted. Each adaptation cites its audit row. No behaviour assertion is weakened or deleted.
- **FR-13 — Final gate, screenshots, docs.**
  - Run the full gate.
  - Recapture `docs/ui-reference/screen-light.png` and `screen-dark.png` (the 032 method), after the last look fix.
  - Capture the full `ui-captures/033/` set, with an index of the screens that changed, for the user's review.
  - Update `CLAUDE.md` "Current state", `docs/e2e-test-plan.md` "latest gate" and `docs/history.md`.
  - Scan, push, and get CI green.

### Non-functional requirements

- **NFR-01 — No behaviour change.** `git diff --name-only c45ed3dc HEAD -- src/lib src/app/api src/providers src/scheduler src/mcp src/scripts prisma` is empty at the end of each wave.
- **NFR-02 — Light and dark.** Every changed screen is captured in both themes. The axe E2E suite runs in both themes.
- **NFR-03 — The gate.** tsc clean; lint 0 errors and no more than 7 warnings; unit at least 4581 plus the new cases; render at least 154; `test:upgrade` passes; `check-folio-restore.mjs` exits 0; `check-ui-invariants.mjs` and its `--coverage` mode exit 0; build passes; full clean mock E2E at least 598 passed / 3 skipped / 0 failed.
- **NFR-04 — Cost** (party-po).
  - Two full E2E runs, one per wave gate. Between them, each task runs only the E2E sections whose screens or locators it touches.
  - The user reviews captures twice: the W1 short list, then the index of changed screens at the end.
  - No real model or image calls; captures run against the mock server.
- **NFR-05 — Process.**
  - One task at a time: an implementer subagent, then `specclaw:code-reviewer`, then the orchestrator runs tsc, lint, unit and `check-ui-invariants.mjs` and commits to `v2`.
  - Pushes go to `origin` only; this clone blocks the company repo.
  - Fork `main` is not touched.
- **NFR-06 — Words.** Visible text follows DESIGN_SYSTEM.md §12, and `uiWordingGuard.test.ts` keeps passing. Text changes only where Folio's text differs and a row says so.

## Acceptance criteria

### W1

- **AC-01** — `node scripts/check-ui-invariants.mjs` exits 0 at the W1 tip. `tests/unit/uiInvariants.test.ts` passes. It has a failing case for each of the following:
  - a dropped `data-testid`;
  - a changed `aria-label`;
  - a removed `onClick`;
  - an added `role`;
  - a permit that cites an unknown row;
  - a permit on a row that is not approved.

  It has a passing case for an element moved between two files, and for a permitted removal.

- **AC-02** — `node scripts/check-ui-invariants.mjs --coverage` exits 0: every file in design §2.1 has a row in `audit.md`.
- **AC-03** — `capture-ui.mjs` writes each FR-02 state in both themes and both widths; the run's log lists them. The three draft notices each appear in their capture.
- **AC-04** — `AppShell.tsx` has no `className="hidden"` on an icon and no icon import used only for the nav or Sign out (`git grep -n 'className="hidden"' -- src/components/layout/AppShell.tsx` is empty). The sidebar capture shows text-only nav.
- **AC-05** — Both assistant drawers' Send buttons have the visible text "Send" (an E2E assertion `toHaveText('Send')` next to the existing `getByRole('button', { name: 'Send' })` checks in `surfaces.test.ts`), and `aria-label="Send"` is unchanged.
- **AC-06** — The draft page source carries the `CROP` constant and four crop spans equal to `9f829456` lines 66–68 and 320–323 (modulo placement), and the draft capture shows them in both themes.
- **AC-07** — `audit.md` meets FR-06: every row has a class and a status; every `behaviour` row cites a named arrangement; every `ambiguous` row states its question.
- **AC-08** — The W1 gate (NFR-03) passes. `origin/v2` equals the W1 tip and its CI run is green.
- **AC-09** — `audit.md` records the user's approval, with its date, and a ruling on every `ambiguous` row, before the first W2 commit (`git log` order).

### W2

- **AC-10** — Every addition to `atoms.ts` or `ui/` is named in DESIGN_SYSTEM.md §8.18. `uiTokenGuard.test.ts` passes, with no local copy of a shared atom.
- **AC-11** — No `audit.md` row is `approved` or `open` at the end. Each `look` row is `closed` with a commit SHA, or `cut` by the user.
- **AC-12** — Each of the 12 new components:
  - has a capture in `ui-captures/033/`;
  - is described in its rewritten §8.20–§8.27 section, which names its file and primitives;
  - uses no `rounded-full` pill, tinted badge or card box that its section does not name.
- **AC-13** — `node scripts/check-ui-invariants.mjs` exits 0 at the final tip. Every permit it used cites a `closed` row.
- **AC-14** — The NFR-01 diff is empty, and `node scripts/check-folio-restore.mjs` exits 0.
- **AC-15** — Every adapted test cites its audit row in the report. `git diff c45ed3dc HEAD -- tests/e2e` deletes no `test(` call.
- **AC-16** — The final gate (NFR-03) passes; `screen-light.png` and `screen-dark.png` are recaptured; `origin/v2` equals the final tip and CI is green.
- **AC-17** — The user approves the final captures (the index of changed screens).

## Edge cases

- **A look fix needs a new attribute,** for example a new `id` for a `<label htmlFor>`. The row's Permits column names it, and the check passes only with that permit.
- **A restored file needs a change.** The 17 files are pinned to `9f829456`, so this should not happen. If a family task needs one, it stops and asks; it never edits `check-folio-restore.mjs`'s lists to make room.
- **A row turns out to be behaviour mid-build.** The task leaves it as is, sets it to `behaviour` with the reason, and reports it. It never changes behaviour to fit a look.
- **A capture state cannot be reached on the mock server.** The task reports it and asks. It never seeds through SQL or calls a real model.
- **The user cuts the pass at the checkpoint.** W1 stands alone: the three items, the audit, the check and the captures. The remaining rows stay `approved` but unbuilt, and verify treats AC-10 to AC-17 as out of scope. That cut is recorded in `audit.md`.

## Out of scope

- Any change under the NFR-01 paths, or to routes, API, data, prompts or analytics.
- The 17 restored files (pinned), the Folio tokens and `study-b-folio.html`.
- A 018–031 arrangement that a change's proposal or spec names.
- Generated post HTML, templates and the renderer.
- Copy rewrites beyond Folio's text under §12.

## Panel findings, mapped

| Finding                                       | Where it is answered                                              |
| --------------------------------------------- | ----------------------------------------------------------------- |
| party-po BLOCK: cheaper variants              | Proposal "Panel rulings" (staging); the checkpoint (FR-07, AC-09) |
| party-po BLOCK: do-nothing value              | Overview "Why"; proposal "Panel rulings"                          |
| party-po: unbounded scope                     | The checkpoint; the user may cut rows or the pass (edge cases)    |
| party-po: proof cost                          | NFR-04                                                            |
| party-po: docs and screenshots value          | FR-11 (with each component), FR-13 (after the last fix)           |
| party-po: cut lines and order                 | The W1, checkpoint and W2 shape                                   |
| party-architect: where the idiom lives        | Approach; FR-08; AC-10                                            |
| party-architect: audit table shape            | FR-06; design §3                                                  |
| party-architect: no deterministic guard       | FR-01; AC-01, AC-13                                               |
| party-architect: NFR-01 undefined             | NFR-01                                                            |
| party-architect: renames and the 12           | Sizing table; design §2                                           |
| party-architect: docs and screenshot coupling | FR-11, FR-13                                                      |
| party-ba: no acceptance that can fail         | AC-01 to AC-17; AC-02, AC-11, AC-12                               |
| party-ba: unsourced counts                    | Sizing table                                                      |
| party-ba: "deliberate" undefined              | Approach (edge rule); FR-06                                       |
| party-ba: Send source                         | FR-04 (`9f829456` `BrandKitAssistantPanel.tsx:416`)               |

## Assumptions

- `9f829456` shows the word "Send" in both assistant drawers. The brand-kit drawer is confirmed at line 416; T3 confirms the briefing drawer before editing it.
- The mock sentinels (`__MOCK_HERO_*__`, `__MOCK_HEADLINE_HIDDEN__`, and a facts mismatch in the brief) produce the three notices through the normal create flow on the mock server, as the E2E suites already do.
- Prettier and `eslint --fix` (lint-staged) do not change JSX attribute values, so the invariant check is stable across formatting.
