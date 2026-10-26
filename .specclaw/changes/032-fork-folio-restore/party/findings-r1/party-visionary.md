### [WARN] party-visionary — The restored Folio DESIGN_SYSTEM.md predates every component the next UI change will copy

**Quotes:**

> Restore the Folio `DESIGN_SYSTEM.md` and screenshots, and archive the Graphite version under `docs/ui-reference/archive/graphite/`.
> **Size:** architectural. It is a re-theme across about 150 files, with a Graphite → Folio mapping for components that never existed in Folio. That needs a design pass.
> **Problem:** The Folio doc and screenshots at `9f829456` were written before 023–031, so they cover none of the post styles, image looks, hero reference images, stale-headline badge or the 031 polish. The design pass that maps those components to Folio is the only place those decisions get made, and the proposal records them nowhere except the restyled code. After this change the only written description of those patterns is the archived Graphite doc. Take the next change that adds a picker or badge like these, say 020 or 009's hero imagery. Its author reads `DESIGN_SYSTEM.md`, finds nothing, and either copies the archived Graphite spec or invents a third mapping. The reference screenshots also show an app with none of the 023–031 surfaces. That gap gets wider with every change and nothing flags it.
> **Fix:** Make the output of the design pass a deliverable: a Folio `DESIGN_SYSTEM.md` section for each component type that 023–031 introduced, plus re-captured screenshots of the current app, rather than the verbatim `9f829456` doc.
> **Status:** upheld

### [WARN] party-visionary — Restyling 023–031 inside their own files rewrites most UI files, so company fixes can't be cherry-picked, and the proposal never weighs that

**Quotes:**

> There are no future company merges (user decision).
> For files 023–031 changed after 021, keep their behaviour and restyle them with the Folio primitives and tokens.
> **Problem:** The proposal covers future merges. It says nothing about cherry-picks. The company repo continues past `59f3b222`, and its later fixes will touch the same ~150 files: a race in the stale-headline badge, a security fix in an image-look route handler, a timing fix like 015's. Because this change rewrites styling inside the files that hold the behaviour, nearly every hunk in a later company fix will conflict over class strings unrelated to the fix. "Only the styling changes" is true on merge day. A year on it means the fork has given up cheap access to the company's fixes for code the two repos still share in substance. Removing the remotes can be undone. The per-file divergence only grows, and with it the cost of every port.
> **Fix:** Say plainly in the proposal that porting company fixes becomes a manual re-implementation. Alternatively, where it costs little, put the Folio styling into the `classes.ts`/`atoms.ts` layer instead of the component bodies, so behaviour hunks still apply across the two repos.
> **Status:** upheld

### [WARN] party-visionary — The fork's stack identity lives in five places, while the database names, the one thing that tells the stacks apart, stay identical

**Quotes:**

> Give the fork its own compose project name (`ai-studio`) and its own host ports for Postgres and MinIO, set through `.env` with fork defaults that do not clash with the company clone's `designer` stack. Update `.env.example`, `docs/cold-start.md`, the E2E DB scripts and the test compose file to match.
> Fork host ports: the proposal assumes Postgres `5442`, MinIO `9100`/`9101`, and test stack `5443`/`9110`. Any preference?
> on the same ports and the same database names (`bistec_studio`, `bistec_studio_test`)
> **Problem:** The port numbers and the compose project name (and with it the container name `ai-studio-postgres-1`) will be written into `.env` defaults, `.env.example`, `cold-start.md`, the E2E DB scripts and the test compose file. `.env.test` and the CI workflow's service config will probably carry them too. Nothing derives one copy from another. The proposal names the shared database names as part of the problem, but the solution leaves them as they are. So once the port or container name in a doc or script drifts, a command still works: it just runs against the company clone's `bistec_studio_test`. Take the next change that edits the E2E DB script, or an agent following the existing "drop and recreate the test DB" step, which names `designer-postgres-1`. It will drop the other repo's test database without an error. Nobody will notice until the company clone's next E2E run fails for no apparent reason.
> **Fix:** Name one source, the `.env`/compose variables, and have the scripts and docs read it rather than restate it. Also give the fork its own database names (for example `ai_studio`, `ai_studio_test`), so a misdirected command fails with "database does not exist" instead of succeeding against the wrong repo.
> **Status:** upheld

### [WARN] party-visionary — The proposal writes the same status entry and absolute local paths into several files again, the duplication that already made CLAUDE.md drift

**Quotes:**

> **`docs/handoff.md`:** the same top entry, plus a "resume after the folder move" checklist.
> Plus the new local paths: fork `D:\ai-studio`, company clone `D:\Bistec\studio`.
> `.claude/launch.json` hard-codes `D:\Bistec\designer` and must point at the new path.
> **Problem:** The "this is the fork, one-time sync, fresh start, no deploy" fact goes into `CLAUDE.md` and `docs/handoff.md` as two copies of one entry. The absolute paths go into `CLAUDE.md`, `handoff.md`, `.claude/launch.json` and the memory-folder layout. The next change that alters any of these facts, such as the user's deploy workflow (which ends "nothing deploys yet") or another folder move, has to find and edit every copy. The repo's own history shows what happens when one is missed: the current `CLAUDE.md` carries pages of "(superseded)" entries that still state company remotes, `designer-postgres-1` and Coolify to-dos as instructions. This change adds one more top entry on that pile and fixes only the references to deleted docs.
> **Fix:** Make one file authoritative for current state. Have the other link to it, not restate it. Keep absolute paths only in `launch.json`, or derive them from the repo root, so the next folder move edits one file.
> **Status:** upheld

### [NOTE] party-visionary — The neutral token modules are one step from making the next re-theme a value swap, but the guards still hard-code the theme

**Quotes:**

> **Module structure:** keep 021's neutral modules (`src/components/ui/atoms.ts`, feature-local `classes.ts`) and put Folio values in them. Do not restore the three `folio.ts` files.
> Restore the Folio guards and tests (`designTokens`, `contrast`, `uiTokenGuard`, including the legacy and Graphite deny-list). Keep 031's `uiWordingGuard`.
> **Problem:** This is the third full re-theme: 011 to Folio, 021 to Graphite, now 032 back to Folio. Each one rewrote the guard tests along with the values, and each one adds the abandoned theme to a deny-list that only grows. Keeping theme-neutral module names is the right seam. But the guards are being restored as Folio-specific assertions, and the styling is spread across many feature-local `classes.ts` files instead of being drawn from one token source. So the next theme change, or a second theme for the user's own deployment, will again touch the guards and every `classes.ts`.
> **Fix:** While the guards are being rewritten anyway, have `designTokens`/`contrast` derive their expected values from the token module rather than restating them, and have the `classes.ts` files compose from `atoms.ts` tokens instead of raw values. A future theme change then edits one file, and the guards check the structure rather than one theme's identity.
> **Status:** upheld
