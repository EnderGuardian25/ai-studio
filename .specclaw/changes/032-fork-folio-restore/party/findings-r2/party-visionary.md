### [WARN] party-visionary — The restored Folio DESIGN_SYSTEM.md predates every component the next UI change will copy

**Quotes:**

> Restore the Folio `DESIGN_SYSTEM.md` and screenshots, and archive the Graphite version under `docs/ui-reference/archive/graphite/`.
> **Size:** architectural. It is a re-theme across about 150 files, with a Graphite → Folio mapping for components that never existed in Folio. That needs a design pass.
> **Problem:** The Folio doc and screenshots at `9f829456` were written before 023–031, so they cover none of the post styles, image looks, hero reference images, stale-headline badge or 031 polish. The design pass that maps those components to Folio is the only place those decisions are made, and the proposal records them only in the restyled code. After this change, the only written description of those component patterns is the archived Graphite doc. The next change that adds a picker or badge of this kind (020, or 009's hero imagery) will find nothing in `DESIGN_SYSTEM.md`. Its author will either copy the archived Graphite spec or invent a third mapping. The reference screenshots will show an app without any of the 023–031 surfaces, and that gap grows with every change. Round 2 note: party-po's call to drop the Graphite archive makes this sharper, not weaker. Dropping the archive removes the wrong template, but the right one still does not exist until the design pass writes it down.
> **Fix:** Make the design pass's output a deliverable: a Folio `DESIGN_SYSTEM.md` section for each component type 023–031 introduced, plus screenshots re-captured from the current app, rather than the verbatim `9f829456` doc.
> **Status:** upheld

### [WARN] party-visionary — Restyling 023–031 inside their own files rewrites most UI files, so company fixes can't be cherry-picked, and the proposal never weighs that

**Quotes:**

> There are no future company merges (user decision).
> For files 023–031 changed after 021, keep their behaviour and restyle them with the Folio primitives and tokens.
> **Problem:** The proposal rules out future merges but says nothing about cherry-picks. The company repo continues past `59f3b222`, and its later fixes will touch the same files: a race in the stale-headline badge, a fix to an image-look route, a settle-timing fix like 015's. Because this change rewrites styling inside the files that hold the behaviour, almost every hunk of a later company fix will conflict over class strings that have nothing to do with the fix. "Only the styling changes" is true on merge day. A year on, it means the fork has given up cheap access to fixes for code the two repos still share in substance. Removing the remotes can be undone; the per-file divergence cannot, and it grows. Round 2 note: party-architect's BLOCK fix (keep 021's module structure and imports, and take only the values from `9f829456`) is the same lever this finding asks for. If it is adopted, it shrinks this cost substantially, but only if the 023–031 restyle also goes through `atoms.ts`/`classes.ts` rather than component bodies. The proposal still says neither.
> **Fix:** State in the proposal that porting company fixes becomes manual re-implementation. Or, where it costs little, put the Folio styling in the `classes.ts`/`atoms.ts` layer rather than in component bodies, so behaviour hunks still apply across the two repos.
> **Status:** upheld

### [WARN] party-visionary — The fork's stack identity lives in five places, while the database names, the one thing that tells the stacks apart, stay identical

**Quotes:**

> Give the fork its own compose project name (`ai-studio`) and its own host ports for Postgres and MinIO, set through `.env` with fork defaults that do not clash with the company clone's `designer` stack. Update `.env.example`, `docs/cold-start.md`, the E2E DB scripts and the test compose file to match.
> Fork host ports: the proposal assumes Postgres `5442`, MinIO `9100`/`9101`, and test stack `5443`/`9110`. Any preference?
> on the same ports and the same database names (`bistec_studio`, `bistec_studio_test`)
> **Problem:** The port numbers and the compose project name (and the container name derived from it) get written into `.env` defaults, `.env.example`, `cold-start.md`, the E2E DB scripts and the test compose file, and probably `.env.test` and the CI service config too. Nothing derives one copy from another. The proposal names the shared database names as part of the problem, but the solution leaves them identical. So when a port or container name in any doc or script drifts, the command still succeeds: it just runs against the company clone's `bistec_studio_test`. Two future cases hit this: the next change that edits the E2E DB script, and an agent following the existing "drop and recreate the test DB" step that names `designer-postgres-1`. Either one drops the other repo's test DB with no error, and nobody notices until the company clone's next E2E run fails for no apparent reason. Round 2 note: party-security's stale-`.env` BLOCK is the merge-day instance of this, and party-architect's single-source WARN covers the variables. Distinct database names remain the one long-horizon backstop neither seat proposes: they turn every future drift into "database does not exist" instead of silent success.
> **Fix:** Name one source (the `.env`/compose variables) and have scripts and docs read it rather than restate it. Give the fork its own database names (for example `ai_studio`, `ai_studio_test`), so a misdirected command fails loudly.
> **Status:** upheld

### [WARN] party-visionary — The proposal writes the same status entry and absolute local paths into several files again, the duplication that already made CLAUDE.md drift

**Quotes:**

> **`docs/handoff.md`:** the same top entry, plus a "resume after the folder move" checklist.
> Plus the new local paths: fork `D:\ai-studio`, company clone `D:\Bistec\studio`.
> `.claude/launch.json` hard-codes `D:\Bistec\designer` and must point at the new path.
> **Problem:** The fact "this is the fork, one-time sync, fresh start, no deploy" goes into `CLAUDE.md` and `docs/handoff.md` as two copies of one entry. The absolute paths go into `CLAUDE.md`, `handoff.md`, `.claude/launch.json` and the memory-folder layout. Any later change to one of these facts has to find and edit every copy: the user's deploy workflow (which voids "nothing deploys yet"), or another folder move. The repo's history shows what happens when one copy is missed. The current `CLAUDE.md` carries pages of "(superseded)" entries that still state company remotes, `designer-postgres-1` and Coolify to-dos as instructions. This change adds one more top entry to that pile and fixes only the references to deleted docs. Round 2 note: party-security's fix (an `origin` check in both top entries) is sound, but it adds a third duplicated fact to the two copies. That makes a single authoritative entry more pressing.
> **Fix:** Make one file authoritative for current state and have the other link to it, not restate it. Keep absolute paths only in `launch.json`, or derive them from the repo root, so the next folder move edits one file.
> **Status:** upheld

### [NOTE] party-visionary — The neutral token modules are one step from making the next re-theme a value swap, but the guards still hard-code the theme

**Quotes:**

> **Module structure:** keep 021's neutral modules (`src/components/ui/atoms.ts`, feature-local `classes.ts`) and put Folio values in them. Do not restore the three `folio.ts` files.
> Restore the Folio guards and tests (`designTokens`, `contrast`, `uiTokenGuard`, including the legacy and Graphite deny-list). Keep 031's `uiWordingGuard`.
> **Problem:** This is the third full re-theme: 011 to Folio, 021 to Graphite, and now 032 back to Folio. Each one rewrote the guard tests along with the values, and each adds the abandoned theme to a deny-list that only grows. Theme-neutral module names are the right seam. But the guards are being restored as Folio-specific assertions, and the styling is spread across feature-local `classes.ts` files instead of being drawn from one token source. So the next theme change, or a second theme for the user's own deployment, will again touch the guards and every `classes.ts`. Round 2 note: party-architect's WARN that the Graphite deny-list is undefined is the merge-day face of the same problem. A guard that checks structure (tokens come from the token module) instead of identity (no Graphite names) needs no deny-list to define.
> **Fix:** While the guards are being rewritten anyway, have `designTokens`/`contrast` derive their expected values from the token module rather than restating them. Have the `classes.ts` files compose from `atoms.ts` tokens instead of raw values. A future theme change then edits one file, and the guards check structure rather than one theme's identity.
> **Status:** upheld

### [WARN] party-visionary — Rebuttal of party-po's BLOCK: deferring or dropping Folio is not cost-neutral, because every queued UI change built on Graphite in the meantime enlarges the later re-theme

**Quotes:**

> Changes 023–031 then built new UI on Graphite (about 104 files under `src/components` and `src/app` changed after 021): hero reference images, post styles, image looks, the stale-headline badge, the final polish and more.
> **Problem:** party-po's fix treats "ship items 2–4 now, and treat Folio as a separate change or drop it" as the cheap variant. On the long horizon, only "drop it" is cheap. "Defer it" is the most expensive option on the table. The proposal's own line shows how fast the cost grows: ten changes after 021 put about 104 UI files on Graphite, and that is exactly why this re-theme is sized at 150–200 files. The fork already has UI work queued: 020 (Create post button), and 009's hero imagery from the 006–010 proposals. Each of those built on Graphite becomes one more component to map later, with no Folio reference. Ordering the cheap items first is sound. Letting further UI changes land before the theme decision is not. "Drop it" has its own long-horizon cost: the fork's `DESIGN_SYSTEM.md` history, the user's recorded 2026-10-07 Folio pick, and the `uiTokenGuard` contract would all have to be rewritten to adopt Graphite deliberately. Otherwise the fork lives with code on one theme while its decisions say another. This finding does not contest the split. It contests the claim that the deferred variant is cheap.
> **Fix:** If the change is split, either decide Folio-or-Graphite now and record it, or state that no UI change (020, 009 and the rest) starts until the re-theme lands. Do not leave the theme deferred while new UI accrues on Graphite.
> **Status:** upheld
