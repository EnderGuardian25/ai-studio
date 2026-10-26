# Design: Restore the fork after the one-time company sync

**Change:** 032-fork-folio-restore · **Spec:** [`spec.md`](spec.md)
**Created:** 2026-10-27

## 1. Shape

Three waves, each ending in a full gate. W1 and W3 end in a push to `origin v2`.

| Wave | What                                                                         | Ends with            |
| ---- | ---------------------------------------------------------------------------- | -------------------- |
| W1   | No deploy workflow; fork docs; own stack; preflight; identity guard          | gate, scan, push, CI |
| W2   | Folio values; 021-only files restored; guards flipped with `PENDING_RESTYLE` | gate                 |
| W3   | 023–031 screens restyled by group; design-system sections; screenshots       | gate, scan, push, CI |

The fork has no Actions secrets, so CI can never deploy; W1's guard keeps deploy strings out of the workflows anyway.

## 2. File sets

Derived on 2026-10-27 at `aca27333` (spec "Sizing"). `9f829456` is the Folio baseline; `f8ebee25` is 021's verify commit.

### 2.1 Restored (021-only UI files; FR-11, FR-12)

**Byte-identical to `9f829456`** (FR-11): `src/app/globals.css`, `src/app/layout.tsx`, `tailwind.config.ts`, `src/components/Logo.tsx`. Deleted: `public/BistecStudioLogo.png`.

**Identical under the import map (§3):**

- Pages: `src/app/(app)/admin/teams/page.tsx`, `src/app/(app)/choose-team/page.tsx`, `src/app/(app)/projects/[id]/page.tsx`, `src/app/(app)/settings/page.tsx`, `src/app/(auth)/login/page.tsx`.
- Primitives: `src/components/ui/{Button,FieldLabel,ImageLightbox,Input,Modal,Notice,PageHead,Panel,QueryError,SectionHead,SegmentedToggle,Select,StatusChip,index}.tsx|ts`.
- Screens: `src/components/admin/brandkits/ColorEditor.tsx`; `src/components/brief/{CampaignRow,ReviewRow,StepHead,Stepper,TemplateCard}.tsx`, `src/components/brief/cardCls.ts`; `src/components/dashboard/NoTeamNotice.tsx`; `src/components/drafts/NotAppliedCard.tsx`; `src/components/layout/TeamSwitcher.tsx`; `src/components/library/{PostCard,PublishHistoryDrawer}.tsx`; `src/components/providers/ToastProvider.tsx`; `src/components/settings/{ChangePasswordCard,ClaudeTokenCard,ClaudeTokenPrompt}.tsx`; `src/components/team/{ApiKeysCard,ModelsCard}.tsx`; `src/components/theme/ThemeToggle.tsx`.

**Restored by value (§3.2):** `src/components/ui/atoms.ts`, `src/components/ui/GateNotice.tsx`, `src/components/admin/brandkits/classes.ts`, `src/components/campaigns/classes.ts`.

**Tests 021 changed alone** (`contrast`, `designTokens`, `noTeamNotice`): rewritten in T7 per FR-14, not restored (their 9f829456 form imports `folio`, and `designTokens` moves to the study-file structure).

`scripts/check-folio-restore.mjs` holds the "identical under the import map" list as data and checks it (FR-12).

### 2.2 Restyled (FR-13, W3)

Every file under `src/components`, `src/app/(app)`, `src/app/(auth)` that a change after 021 added or modified, **and** that holds a class string. Files with no class string (`brief/constants.ts`, `brief/useBriefWizard.ts`, `admin/insights/format.ts`, `campaigns/postStyleOptions.ts`, `textUpgrade/useRuleReview.ts`) are out of the set unless a grep finds one.

- **Overlap with 021 (38):** the `src/` lines of the overlap list in the spec's sizing (e.g. `drafts/[id]/page.tsx`, `AppShell.tsx`, `RefinementPanel.tsx`, `ModelPicker.tsx`). For each, the `9f829456` version is the Folio reference for the parts that existed then.
- **Added after 021 (15):** `admin/insights/page.tsx` and `admin/insights/{DataTable,InsightSection,RateBar,sections}.tsx`, `brandkits/{AddKitModal,ScriptFontPicker}.tsx`, `brief/PostStylePicker.tsx`, `campaigns/QueueEntryModal.tsx`, `drafts/{CompositionNotice,FactsCheckNotice,GeneratedWith,HeadlineImageNotice}.tsx`, `team/CaptionRouteCard.tsx`, `textUpgrade/RuleReviewPanel.tsx`. (`AddKitModal`, `QueueEntryModal` and `GeneratedWith` may have existed earlier under these names; T5 checks with `git log --follow` and the 9f829456 version, if any, is their reference.)

The W3 groups (§5) partition this set.

## 3. The import map and helper values

### 3.1 Import map (the only allowed difference for a restored file)

| `9f829456` specifier                                                  | HEAD specifier                                      |
| --------------------------------------------------------------------- | --------------------------------------------------- |
| `@/components/ui/folio`                                               | `@/components/ui/atoms`                             |
| `./folio` (inside `src/components/ui/`)                               | `./atoms`                                           |
| `@/components/campaigns/folio`                                        | `@/components/campaigns/classes`                    |
| `@/components/admin/brandkits/folio`, `./folio` (inside `brandkits/`) | `@/components/admin/brandkits/classes`, `./classes` |
| `@/components/team/folio` → `GateNotice`                              | `@/components/ui/GateNotice`                        |
| `@/components/team/folio` → `BLOCK`, `ROW`                            | `@/components/ui/atoms`                             |

A `team/folio` import line that names both kinds becomes two lines. `check-folio-restore.mjs` stores, per file, the exact rewritten import lines, so the check is a literal comparison, not a parser.

**Kept addition:** `src/components/ui/index.ts` adds `export { GateNotice } from './GateNotice'` before `export * from './atoms'`. It is the one allowed extra line, listed in the script.

### 3.2 Helper values

- **`atoms.ts`** = every export of the 9f829456 `ui/folio.ts` with its Folio value and comment (`FOCUS`, `SCROLL_FOCUS`, `SMALL_CAPS`, `EYEBROW`, `PAGE_TITLE`, `PAGE_LEAD`, `SECTION_NUMERAL`, `SECTION_HEAD`, `SUB_HEAD`, `NOTICE`, `ICON`, `ICON_SM`, `ICON_BUTTON`, `TEXT_LINK`, `TAG`, `TABLE_HEAD_ROW`, `COMPACT_FIELD`, `COMPACT_TEXTAREA`), plus `BLOCK` and `ROW` from the 9f829456 `team/folio.tsx`, plus `PILL_BADGE`. The header comment says Folio and keeps 021's rule that a single-group atom lives in its `classes.ts`.
- **`PILL_BADGE`** (021 added it for "Current", "active", "Default"): T5 finds what the 9f829456 call sites used for those badges (`git grep -n 'Current\|Default\|active' 9f829456 -- src/components src/app`) and uses that class. If the call sites differ, it uses the one in the primitives or `brandkits/folio.ts` and records the choice in the report.
- **`GateNotice.tsx`** = the 9f829456 `team/folio.tsx` `GateNotice` function, as its own module.
- **`campaigns/classes.ts`**, **`brandkits/classes.ts`** = the 9f829456 `campaigns/folio.ts` and `admin/brandkits/folio.ts` values (e.g. `ASIDE_BLOCK` returns to `'border-b border-line-subtle py-4'`).
- **`brief/cardCls.ts`** is in the import-map set (§2.1).

## 4. The guards

### 4.1 `designTokens.test.ts`

021's structure stays: `blockVars(source, selector)` over `globals.css` and over the study file. `STUDY_PATH` becomes `docs/ui-reference/direction-studies/study-b-folio.html`. The study's `--font-*` lines are not compared (next/font serves them); `--control-*` are compared against 014's values as today. The Graphite-specific assertions (two families, `ui-xl`, the `12` opacity, `label` tracking) are replaced by Folio ones: three families (`Fraunces`, `Instrument_Sans`, `JetBrains_Mono` in `layout.tsx`), `font-display` and `font-text` in the Tailwind config, and no Graphite key in it.

### 4.2 `contrast.test.ts`

Back to the 9f829456 pairs (status text on its 10 % tint, `fg` and `fg-muted` on canvas and both surfaces, `accent-fg` on `accent`, focus on canvas), reading values from `globals.css` as both versions do.

### 4.3 `uiTokenGuard.test.ts`

- Drop the Folio deny-list entries (the fonts, `font-display`, `font-text`, `SECTION_NUMERAL`, the numeral prop, `folio` imports other than none).
- Keep the `folio.ts` import ban (021's module rule): no file imports a path ending in `/folio`.
- Add the Graphite deny-list:

  ```ts
  // 032 FR-14: the Tailwind keys 021 added and Folio does not have, the
  // Graphite font, and the PNG logo. Derived by diffing the two configs.
  const GRAPHITE_DENY = [
    /\brounded-ui-xl\b/,
    /\btracking-label\b/,
    /\b[\w:-]+\/12\b/, // the 021 status-tint alpha
    /Plus Jakarta/,
    /BistecStudioLogo/,
  ]
  ```

  Scope: `src/app/**`, `src/components/**`, `tailwind.config.ts`, including `atoms.ts` and every `classes.ts`. Out of scope: `src/lib/fonts/catalogue.json` (post font data).

- `PENDING_RESTYLE: readonly string[]` lists repo-relative paths exempt from the Graphite deny-list and from the atom-copy check. `W3_DONE = false`. One extra case: `if (W3_DONE) expect(PENDING_RESTYLE).toEqual([])`. T12 sets `W3_DONE = true`.
- The `/12` pattern must not match prose in comments. The guard already strips comments before matching; T7 confirms it on `src/lib/drafts/refineAttempt.ts`-style text in a negative case.

### 4.4 `forkIdentity.test.ts` (W1)

Reads files with `readFileSync` and globs with `readdirSync` (no git), so it runs on CI's depth-1 checkout. One `describe` per FR-02 bullet, each with a negative case built from an in-memory string.

## 5. W3 groups

Each group task restyles its files, moves shared styling into `atoms.ts` or its `classes.ts` (FR-18), removes them from `PENDING_RESTYLE`, writes its `DESIGN_SYSTEM.md` sections (FR-19), runs its E2E sections, and captures its screens in both themes.

| Group                    | Files                                                                                                                                                                                                                                                                                                                                                 | DESIGN_SYSTEM sections                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| G1 Draft page            | `drafts/[id]/page.tsx`; `drafts/{BackgroundNotice,CaptionPanel,CaptionPanels,CompositionNotice,ElementEditPanel,FactsCheckNotice,GeneratedWith,HeadlineImageNotice,HeadlinePanel,InlineEditModal,RefinementPanel}.tsx`; `library/PublishDialog.tsx`                                                                                                   | composition notice; facts-check notice; stale-headline badge and Apply to image |
| G2 Create flow and shell | `(app)/page.tsx`, `brief/page.tsx`, `library/page.tsx`; `brief/{CampaignStep,ContentStep,ImagesStep,PostStylePicker,ReviewStep,SizeDesignStep}.tsx`; `dashboard/RecentDraftsCard.tsx`; `layout/{AppShell,CreatePostButton}.tsx`; `ui/ModelPicker.tsx`                                                                                                 | post style picker; image look picker                                            |
| G3 Campaigns and kits    | `campaigns/page.tsx`, `campaigns/[id]/page.tsx`, `projects/page.tsx`, `admin/brandkits/page.tsx`; `campaigns/{BriefingAssistantPanel,CampaignBriefingSection,QueueEntryModal,ScheduledQueueSection}.tsx`; `brandkits/{AddKitModal,BrandKitAssistantPanel,FontEditor,KitDetail,PromptSection,ScriptFontPicker}.tsx`; `textUpgrade/RuleReviewPanel.tsx` | rule review panel; script-font picker                                           |
| G4 Team, settings, admin | `team/page.tsx`, `admin/layout.tsx`, `admin/users/page.tsx`, `admin/insights/page.tsx`; `admin/insights/{DataTable,InsightSection,RateBar,sections}.tsx`; `team/{CaptionRouteCard,TeamClaudeTokenCard}.tsx`; `settings/{ClaudeConnectGuide,OpenAiKeyCard}.tsx`                                                                                        | caption route card; insights page                                               |

**How to restyle a file** (the brief each group task gets):

1. Diff it against its 9f829456 version, if any. Every class string that 021 changed and the file still carries goes back to its Folio form, with the `numeral` props the 9f829456 version passed.
2. For parts added after 021, map each Graphite pattern to its Folio counterpart: cards → ruled rows or `Panel` (DESIGN_SYSTEM §6); pill buttons → `Button` (Folio radii); a status tint `/12` → the `Notice` or `StatusChip` primitive (10 %); sentence-case table heads → `TABLE_HEAD_ROW` (small caps); section heads → `SectionHead` with a numeral where the screen numbers its sections.
3. Never change copy, `aria-*`, `data-testid`, handlers or control flow (FR-13). The reviewer checks the diff for anything outside `className`, atom references and imports.

## 6. The stack

### 6.1 Variables and defaults

| Variable                                                                            | Default                                              | Read by                                  |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------- |
| `COMPOSE_PROJECT_NAME`                                                              | `ai-studio`                                          | `docker-compose.yml` `name:`, preflight  |
| `POSTGRES_HOST_PORT`                                                                | `5442`                                               | compose, preflight                       |
| `MINIO_HOST_PORT`                                                                   | `9100`                                               | `docker-compose.override.yml`, preflight |
| `MINIO_CONSOLE_HOST_PORT`                                                           | `9101`                                               | compose                                  |
| `COMPOSE_TEST_PROJECT_NAME`                                                         | `ai-studio-test`                                     | `docker-compose.test.yml` `name:`        |
| `POSTGRES_TEST_HOST_PORT` / `MINIO_TEST_HOST_PORT` / `MINIO_TEST_CONSOLE_HOST_PORT` | `5443` / `9110` / `9111`                             | test compose                             |
| `POSTGRES_DB`                                                                       | `ai_studio` (`.env`), `ai_studio_test` (`.env.test`) | compose, scripts                         |
| `DATABASE_URL`                                                                      | `postgresql://bistec:<pw>@localhost:5442/ai_studio`  | app, prisma, scripts                     |
| `MINIO_ENDPOINT`, `MINIO_PUBLIC_ENDPOINT`                                           | `http://localhost:9100`                              | app                                      |

Node's `--env-file` does not expand `${…}`, so `DATABASE_URL` repeats the port. The preflight's port-agreement rule (FR-08) is what keeps the copies equal.

### 6.2 The preflight

```js
// scripts/lib/stackPreflight.mjs — pure, no I/O.
export const COMPANY_PG_PORTS = [5432, 5433]
export const COMPANY_MINIO_PORTS = [9000, 9010]
export function checkStack(env) {
  /* returns string[] of refusals */
}
```

`scripts/stack-preflight.mjs` loads the env file named by `--env-file` (default `.env`), merges `process.env` over it (so CI's env wins), calls `checkStack`, prints and exits. A missing env file is not an error (CI has no `.env.test`); a missing `DATABASE_URL` after the merge is a refusal. `package.json`:

```json
"db:migrate": "node scripts/stack-preflight.mjs && prisma migrate deploy",
"db:seed": "node scripts/stack-preflight.mjs && node --env-file=.env scripts/seed-admin.mjs && …",
"test:e2e:db": "node scripts/stack-preflight.mjs --env-file .env.test && node scripts/setup-test-db.mjs",
"test:upgrade": "node scripts/stack-preflight.mjs --env-file .env.test && <existing command>"
```

`prisma migrate deploy` in `db:migrate` reads `.env` through Prisma's own loader, which is the file the preflight checked.

### 6.3 `setup-test-db.mjs`

- `CONTAINER` and `docker exec` go. Postgres is reached with `docker compose exec -T postgres psql -U <user> -d postgres -c …`, run from the repo root, so compose resolves the project from `name:`/`COMPOSE_PROJECT_NAME`.
- `--reset` drops the test DB with `DROP DATABASE IF EXISTS <name> WITH (FORCE)` before the create. It refuses any name that does not end in `_test`.
- The fallback URL becomes `postgresql://bistec:bistec@localhost:5442/ai_studio_test`.

### 6.4 Local env rewrite

The task reads each file line by line and replaces only the stack keys of §6.1, keeping order, comments and every other value. It reports which keys changed by name. It writes no value to the report or the console. `COMPOSE_PROJECT_NAME=ai-studio` is added to `.env`.

The company clone keeps its volumes through its own `.env` pin (`COMPOSE_PROJECT_NAME=designer`, set by the user's move script). The fork's first `docker compose up -d` creates new, empty `ai-studio_*` volumes (fresh start), then `npm run db:migrate` and `npm run db:seed`.

### 6.5 CI

`e2e.yml`: the Postgres service maps `5442:5432` with `POSTGRES_DB: ai_studio_test`; the `docker run` for MinIO maps `-p 9100:9000`; the env block's `DATABASE_URL`, `POSTGRES_DB` and `MINIO_ENDPOINT` follow; the comments naming `bistec_studio_upgrade` and "company prod" are corrected. `test:upgrade`'s scratch DB is `ai_studio_upgrade`. The other jobs (render, build, docker build) are unchanged.

## 7. Docs

- `CLAUDE.md`: the title line, a "Current state" section (FR-04), the existing reference sections with the design-system lines corrected in T7, and one line linking `docs/history.md`. Everything from "✅ Outstanding work" down to the end of the dated entries moves to `docs/history.md` verbatim (company prod to-dos included, as history).
- `docs/handoff.md`: a first section, "Current state lives in `CLAUDE.md`", then the existing text under the history banner.
- `docs/fork-history.md`: links to deleted docs become plain text.
- `docs/cold-start.md`: FR-09.
- `docs/e2e-test-plan.md` §0: the clean-gate steps (`npm run test:e2e:db -- --reset`).
- Memory (outside the repo): after W1, the orchestrator updates the memory file for the one-time sync with the new state. Not a repo change.

## 8. Risks

| Risk                                                                                                    | Mitigation                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A restored primitive drops a prop or variant that post-021 code passes (e.g. a `Button` size 021 added) | T5 runs tsc after the restore; a missing prop is a type error. It then adds the prop to the restored primitive with a Folio value and lists it as a kept addition in `check-folio-restore.mjs`. |
| E2E locators or axe rules depend on Graphite styling                                                    | T7's full run; adapted cases listed, none deleted.                                                                                                                                              |
| Contrast fails for a 023–031 status colour use that Graphite's 12 % tint passed                         | The `Notice`/`StatusChip` primitives carry Folio's checked pairs; restyles route status tints through them.                                                                                     |
| The local `.env` rewrite loses a value                                                                  | Line-preserving rewrite of named keys only (§6.4); the old files are copied to the scratchpad first and deleted after the gate passes.                                                          |
| A guard regex matches prose                                                                             | Comment stripping plus negative cases (§4.3).                                                                                                                                                   |
| Fork CI differs from the local run (port mapping)                                                       | CI uses the same ports; the preflight runs in CI too.                                                                                                                                           |

## 9. Grounding sources

- `CLAUDE.md`, top entry: "W1: its first commit deletes `docker-publish.yml`." and "ports 5442 (Postgres), 9100/9101 (MinIO), test 5443/9110; DB names `ai_studio`/`ai_studio_test`; local `.env`/`.env.test` rewritten; a preflight that refuses the `designer` stack." → FR-01, FR-07, FR-08.
- `CLAUDE.md`, top entry: "⚠️ Until W1 lands, do not run `docker compose`, `npm run test:e2e:db` or any migrate/seed command in the fork." → T2 runs no DB command until the env rewrite and the preflight are in.
- `CLAUDE.md`, Gotchas: "`npm run test:e2e:db` does not drop the test DB. A clean gate first runs `docker exec designer-postgres-1 psql …`" → FR-07 `--reset`.
- `CLAUDE.md`, Gotchas: "**A `page.waitForResponse` must be created before the action that triggers the request.**" → carried into the T7 and W3 briefs where E2E cases are adapted.
- `CLAUDE.md`, UI section: "`tests/unit/uiTokenGuard.test.ts` fails on any Folio leftover (its deny-list, DESIGN_SYSTEM.md §11) … a line opts out of the colour guard only with `// ui-exception: <reason>`" → §4.3 keeps the guard's other checks.
- `CLAUDE.md`, UI section: "AC-05 carve-out: 'Instrument Sans' stays in `src/components/admin/brandkits/googleFonts.ts` (post font data)" → §4.3's carve-out, now `src/lib/fonts/catalogue.json` (031 replaced `googleFonts.ts`).
- `tests/unit/designTokens.test.ts` (HEAD): "the values are Graphite's, checked against the study file itself, so a hand-typed digit fails here." → §4.1 keeps that structure.
- `docker-compose.yml` (HEAD): the `pgsty/silo:RELEASE.2026-09-16T00-00-00Z@sha256:6351…` pin → FR-02's silo check.
- `scripts/test-upgrade-path.mjs`: "The database name is always replaced by the hard-coded SCRATCH_DB below and asserted before anything connects" → §6.5 renames `SCRATCH_DB` and its assertion together.
- `memory/feedback_merge_caution.md`: "never merge to main without go-ahead; commit straight to v2" → NFR-05.
