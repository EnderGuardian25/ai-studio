# Design: Folio fidelity pass on top of 018–031

**Change:** 033-folio-fidelity-pass · **Size:** architectural · **Spec:** [`spec.md`](spec.md)

## 1. Shape

| Wave | Tasks                                                                                                                                           | Ends with                                                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| W1   | T1 the invariant check · T2 capture coverage · T3 the three known items · T4 the audit · T5 W1 gate and push                                    | **Checkpoint:** the user approves `audit.md` and rules on ambiguous rows |
| W2   | T6 Folio primitives · T7 G1 draft page · T8 G2 create flow and shell · T9 G3 campaigns and kits · T10 G4 team, settings, admin · T11 final gate | The user's review of the changed-screen index                            |

The check comes first, so every later commit is guarded by it. The audit comes after the three known items, so their rows are recorded as `closed` and not proposed.

## 2. File sets

Derived on 2026-10-27, with the command `git diff --name-status -M 9f829456 c45ed3dc -- 'src/app/(app)' 'src/app/(auth)' src/components`.

### 2.1 The audit set (47 files, by family)

| Family                           | Files (`src/` prefix dropped)                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G1 Draft page** (10)           | `app/(app)/drafts/[id]/page.tsx`; `components/drafts/{BackgroundNotice,CaptionPanel,CaptionPanels,ElementEditPanel,GeneratedWith,HeadlinePanel,InlineEditModal,RefinementPanel}.tsx`; `components/library/PublishDialog.tsx`                                                                                                                                                      |
| **G2 Create flow, shell** (17)   | `app/(app)/page.tsx`, `app/(app)/brief/page.tsx`, `app/(app)/library/page.tsx`; `components/brief/{CampaignStep,ContentStep,ImagesStep,ReviewStep,SizeDesignStep}.tsx`, `components/brief/{constants,useBriefWizard}.ts`; `components/dashboard/RecentDraftsCard.tsx`; `components/layout/{AppShell,CreatePostButton}.tsx`; `components/ui/{ModelPicker,PageHead,FieldLabel}.tsx` |
| **G3 Campaigns, kits** (13)      | `app/(app)/campaigns/page.tsx`, `app/(app)/campaigns/[id]/page.tsx`, `app/(app)/projects/page.tsx`, `app/(app)/admin/brandkits/page.tsx`; `components/campaigns/{BriefingAssistantPanel,CampaignBriefingSection,QueueEntryModal,ScheduledQueueSection}.tsx`; `components/admin/brandkits/{AddKitModal,BrandKitAssistantPanel,FontEditor,KitDetail,PromptSection}.tsx`             |
| **G4 Team, settings, admin** (7) | `app/(app)/team/page.tsx`, `app/(app)/admin/layout.tsx`, `app/(app)/admin/users/page.tsx`; `components/settings/{ClaudeConnectGuide,OpenAiKeyCard}.tsx`; `components/team/TeamClaudeTokenCard.tsx`; `components/ui/{Notice,StatusChip}.tsx`                                                                                                                                       |

`ui/{Notice,StatusChip,PageHead,FieldLabel}.tsx` are primitives with consumers in every family. Their rows are audited in the family named above, and any change to them lands in T6, not in a family task.

### 2.2 The 12 new components

| Family | Components                                                                                                                                               | DESIGN_SYSTEM.md |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| G1     | `components/drafts/{CompositionNotice,FactsCheckNotice,HeadlineImageNotice}.tsx`                                                                         | §8.20, §8.21     |
| G2     | `components/brief/PostStylePicker.tsx` (the image look picker lives in `SizeDesignStep.tsx`, an audit file)                                              | §8.22, §8.23     |
| G3     | `components/admin/brandkits/ScriptFontPicker.tsx`, `components/textUpgrade/RuleReviewPanel.tsx`                                                          | §8.24, §8.25     |
| G4     | `components/team/CaptionRouteCard.tsx`; `app/(app)/admin/insights/page.tsx`, `components/admin/insights/{DataTable,InsightSection,RateBar,sections}.tsx` | §8.26, §8.27     |

### 2.3 Pinned (not touched)

These 17 files are pinned to `9f829456` by `scripts/check-folio-restore.mjs`:

- `admin/teams`, `choose-team` and `projects/[id]` pages;
- `ColorEditor`, `ReviewRow`, `StepHead`, `Stepper` and `cardCls.ts`;
- `NotAppliedCard`;
- `ChangePasswordCard`, `ClaudeTokenCard` and `ClaudeTokenPrompt`;
- `ApiKeysCard` and `ModelsCard`;
- `ui/index.ts`, `Panel` and `SectionHead`.

The 4 renamed class modules are the seam (§4).

## 3. `audit.md`, the register

One file, `.specclaw/changes/033-folio-fidelity-pass/audit.md`.

**The header** carries:

- the baseline commits (`9f829456`, `c45ed3dc`);
- the counts by class and by family;
- after the checkpoint, the line `Approved by the user: <date>`, with any cut.

**One table per family**, with these columns:

| Column    | Content                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| ID        | `A-001` upward, never reused                                                                                                |
| File      | path from `src/`                                                                                                            |
| Element   | the JSX element or line range at `c45ed3dc`                                                                                 |
| Class     | `look` · `behaviour` · `ambiguous` · `none`                                                                                 |
| Reference | `9f829456:<file>:<line>` or `DS §x.y`; for `behaviour`, the change and the proposal or spec line that names the arrangement |
| Fix       | what changes (for `look`), the question (for `ambiguous`), or `—`                                                           |
| Permits   | space-separated `-<file>:<attr>=<value>` / `+<file>:<attr>=<value>` tokens, or `—`                                          |
| Status    | `proposed` (T4) · `approved` / `cut` (the checkpoint) · `closed <sha>` (W2) · `behaviour` (kept)                            |

**Rules:**

- A test adaptation cites its row ID in its task report.
- A row's Fix and Permits are fixed at approval. A task that needs a different fix adds a new row (`proposed`) and asks; it never edits an approved row.
- The rows for the three known items (T3) are written by T4 as `closed <sha>`, with their permits.

## 4. The seam: Folio primitives

- **No new module.** `src/components/ui/atoms.ts` (class strings) and the `ui/` primitives (`SectionHead`, `Panel`, `PageHead`, `Notice`, `FieldLabel`, `StatusChip`) are where the idiom lives. `campaigns/classes.ts`, `admin/brandkits/classes.ts` and `brief/classes.ts` hold family-specific class data only.
- **What T6 adds** is what at least two approved rows need, lifted from a `9f829456` usage. Each addition cites the `9f829456` file and line in its JSDoc comment and is named in DESIGN_SYSTEM.md §8.18. Expected candidates, confirmed by the audit:
  - a ruled field row: label left, value right, as on Folio's settings and team pages;
  - a section block with an optional numeral;
  - Folio's quiet list row.
- **Pinned primitives.** `Panel.tsx` and `SectionHead.tsx` are pinned (§2.3). T6 adds to `atoms.ts`, `PageHead`, `Notice`, `FieldLabel` and `StatusChip` only. If an approved row needs `Panel` or `SectionHead` to change, T6 stops and asks.
- **Consumers.** T6's report lists every importer of each changed primitive (`git grep -l`), and its capture run covers their screens.

## 5. The invariant check

### 5.1 Files

| File                              | Role                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `scripts/lib/uiInvariants.mjs`    | pure: `collectAttrs(source, file)`, `diffAttrs(base, head)`, `parsePermits(auditMd)`, `judge(diff, permits)`, `AUDIT_SET` |
| `scripts/check-ui-invariants.mjs` | CLI: file lists via `git ls-tree -r --name-only <ref> src/app src/components`, sources via `git show`, the audit via `fs` |
| `tests/unit/uiInvariants.test.ts` | the pure core on inline fixtures (AC-01)                                                                                  |

### 5.2 Rules

- **Parse:** `ts.createSourceFile(file, text, Latest, true, TSX)`. Walk `JsxAttribute` nodes and keep the names `aria-*`, `data-testid`, `role`, `id`, `htmlFor`, `type`, `name`, `href` and `/^on[A-Z]/`.
- **The value** is the string literal's text, or the expression's `getText()` with whitespace collapsed. A spread attribute (`{...props}`) is recorded as `...<expr>`, so a dropped spread is caught.
- **Key:** `attr=value`, counted over the whole scope. The diff is per key, as `+n` or `-n`. The file is reported for the reader but is not part of the key, so a move between files passes.
- **Permits** come from the `Permits` column of rows whose Status is `approved` or `closed …`. Each token is `±file:attr=value`. A permit consumes one count of its key. A permit that cites a row with any other status fails. A token that no diff consumes is reported as unused; that is a warning, not a failure.
- **Baseline:** the constant `BASE = 'c45ed3dc'`, the same convention as `check-folio-restore.mjs`. The script belongs to this change's gate. It is not added to `test:unit` or CI, because its baseline is change-specific; a later change retires it or rebases it.
- **`--coverage`** fails for any `AUDIT_SET` path with no row.
- **Output:** key names and file paths only. Nothing in scope is secret.

### 5.3 What it does not cover

Visible text and control flow inside handlers are out of its reach. They stay with the reviewer, the wording guard and E2E. The spec says so; review is the backstop for those, and the attribute set is the deterministic floor.

## 6. Capture coverage (T2)

`scripts/capture-ui.mjs` gains a `states` pass after the screen loop. It creates its data through the same API calls `findOrCreateDraft` uses, against the mock server.

| State                    | How                                                                                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| brief steps 2–4          | `/brief`, clicking through the wizard with the same locators `post-styles.test.ts` and `image-looks.test.ts` use                                                                                                                                                                           |
| kit detail, script fonts | `/admin/brandkits`, opening the first kit                                                                                                                                                                                                                                                  |
| kit assistant drawer     | the kit detail's assistant trigger (locator from `surfaces.test.ts`)                                                                                                                                                                                                                       |
| briefing drawer          | campaign detail's briefing assistant (locator from `surfaces.test.ts`)                                                                                                                                                                                                                     |
| rule review panel        | the kit's Improve action under `MOCK_AI` (flow from `kit-upgrade.test.ts`)                                                                                                                                                                                                                 |
| insights                 | `/admin/insights`                                                                                                                                                                                                                                                                          |
| three draft notices      | three briefs with the sentinel topics that `post-styles.test.ts`, `hero-image.test.ts` and `headline-badge.test.ts` use (`__MOCK_HERO_BUSY__` for the image-style fallback, `__MOCK_HEADLINE_HIDDEN__` for the stale headline, a figure mismatch for the facts check), then `/drafts/<id>` |

- **Locators** are copied from the E2E suites named, never invented.
- **Unreachable states:** a state the mock server cannot reach is logged as `skipped: <reason>`, and T2 reports it (spec edge case).
- **Index:** the run writes `index.md` in the output folder, listing every file.

## 7. Families (T7 to T10)

Each family task:

1. Applies its family's `approved` look rows and the user's rulings on its `ambiguous` rows, then sets each to `closed <sha>` after the commit. It uses a follow-up docs commit if the SHA is needed.
2. Redesigns its new components (§2.2) with the T6 primitives, to FR-10.
3. Rewrites their DESIGN_SYSTEM.md sections in the same commit.
4. Adapts only the tests whose look assertions its rows change, citing the row.
5. Runs the E2E sections for its screens, the axe suite in both themes for its screens, `check-ui-invariants.mjs`, and `capture-ui.mjs` for its screens and states.

**How to apply a row** (the brief each family task gets):

- Open the `9f829456` version at the cited line and DESIGN_SYSTEM.md at the cited section.
- Change the element to Folio's structure.
- Keep every attribute the check guards, unless the row permits it.
- Keep every condition and handler.
- Keep the 018–031 arrangement when the row's class is `behaviour`.

## 8. Gate and process

- **The gate script** is the 032 scratchpad `gate.sh` with two new steps: `node scripts/check-ui-invariants.mjs` and `--coverage` after the restore check. `CAPTURE=1` captures into `ui-captures/033/`.
- **Two full E2E runs:** T5 and T11. A family task runs its own suites (§7) only.
- **Before each push,** the orchestrator checks `git remote get-url origin` and scans the range (patterns, plus the fixed-string env check). After each push it checks `gh run list --branch v2`.
- **Models:**

  | Task       | Model                                                                                                |
  | ---------- | ---------------------------------------------------------------------------------------------------- |
  | T1, T2, T6 | sonnet                                                                                               |
  | T3         | haiku (mechanical, cited lines)                                                                      |
  | T4         | opus (a judgement over 47 files and the 018–031 proposals; one agent, so the classes are consistent) |
  | T7–T10     | sonnet                                                                                               |
  | T5, T11    | the orchestrator, with the gate script in the background                                             |

  Reviews use `specclaw:code-reviewer` on sonnet.

## 9. Risks

| Risk                                                                       | Containment                                                                                                                              |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| A markup change breaks an E2E locator that is not in the family's sections | The T11 full run; locators are guarded attributes (`data-testid`, roles, names) or visible text, and the check catches the attributes    |
| axe regressions (contrast, landmark, label)                                | the axe suite per family in both themes; Folio's tokens already pass 032's contrast test                                                 |
| The audit misclassifies behaviour as look                                  | `behaviour` needs a cited arrangement; ambiguous goes to the user; the invariant check and E2E catch a behaviour slip                    |
| The rows are too many to review                                            | counts at the checkpoint; the user may cut by family or by row                                                                           |
| A primitive change ripples into the pinned files                           | pinned files import primitives by name, and the restore check pins their source, not the rendering. T6 lists consumers and captures them |

## 10. Grounding sources

- **`docs/ui-reference/DESIGN_SYSTEM.md`:**
  - §8.12 "The post preview ("proof plate")";
  - §8.6 "Sidebar nav and team switcher";
  - §8.18 "Page primitives";
  - §8.20–§8.27;
  - §12 "Words".
- **`scripts/check-folio-restore.mjs`:** its `BASE = '9f829456'` constant convention and its pinned lists (§2.3, §5.2).
- **`scripts/capture-ui.mjs`:** `findOrCreateDraft`, whose API sequence §6 reuses.
- **`src/lib/testHooks.ts:445–454`:** the `__MOCK_HERO_*__` sentinels.
- **`9f829456`:**
  - `src/app/(app)/drafts/[id]/page.tsx:66–68, 318–323`, the crop marks;
  - `src/components/admin/brandkits/BrandKitAssistantPanel.tsx:413–417`, the word "Send".
- **`CLAUDE.md` "Working rules":** "One task at a time…", "Route to the cheapest workable model…", "A report footer needs a `## Verification` heading exactly."
