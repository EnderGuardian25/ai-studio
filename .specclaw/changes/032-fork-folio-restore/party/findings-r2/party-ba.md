### [WARN] party-ba — The re-theme is justified by a design preference, but "Folio" is the success target and is never defined for components that never existed in it

**Quotes:**

> For files 023–031 changed after 021, keep their behaviour and restyle them with the Folio primitives and tokens.
> Changing app ports 3000/3001.
> Size:** architectural. It is a re-theme across about 150 files, with a Graphite → Folio mapping for components that never existed in Folio. That needs a design pass.
> **Problem:** "Folio" carries two meanings in the build. One is the tree at `9f829456`: a literal restore of files. The other is a design language to apply to roughly 100 components that have no Folio reference. The proposal says "Folio back, on every screen", but "every screen" includes screens that never had a Folio version. The fork's guards (`uiTokenGuard`, `contrast`) can only check tokens, so "looks like Folio" has no observable test for the new components. The "Decisions" section also says "Put Folio values in" 021's neutral modules, which is a third reading: module names stay Graphite-era but the values are Folio. Two builders would produce different results.
> **Fix:** Define "restored" (byte-identical to `9f829456`) separately from "restyled" (token-compliant only). State which guards decide the second category.
> **Status:** upheld

### [WARN] party-ba — The stated problem (Graphite, company deploy, company identity, shared stack) has no acceptance criteria, and the main goal "every screen is Folio" cannot fail

**Quotes:**

> Folio back, on every screen.
> Items 1–4 above, in light and dark themes, with the full gate: tsc, lint, unit, `test:render`, and a full clean mock E2E on the fork's own stack.
> **Problem:** The proposal has no acceptance-criteria section. The only ship-time check named is the existing gate, and that gate passes whatever theme is shipped. Restoring `uiTokenGuard` makes the guard pass on Folio, but the proposal never says which screens or which observation would show a screen is still on Graphite. There is also no check that no company reference remains in the docs or CI, and none that the two Docker stacks do not clash. The gate's green result cannot fail on any of the four stated problems.
> **Fix:** Add falsifiable criteria. For example: a grep for Graphite classes or `BistecStudioLogo` returns nothing. `docker-publish.yml` is absent. No `bistec-oss` or `studio.bistecglobal.com` string remains in the live docs. Both stacks can run `docker compose up` at once without a port or volume conflict.
> **Status:** upheld

### [WARN] party-ba — The counts that size the work are unsourced and internally inconsistent

**Quotes:**

> 021 touched about 94 files under `src/` and `tests/`.
> about 104 files under `src/components` and `src/app` changed after 021
> **Files affected:** about 150–200 (estimated)
> **Problem:** The figures are given as "about" and "estimated", with no derivation. Even on the proposal's own numbers, 94 files from 021 plus 104 from 023–031 is up to 198 before the docs, tests and CI work. The restore-versus-restyle split depends on how many of 021's 94 files were later touched, and the proposal never gives that overlap. The scope and the "architectural" label rest on these numbers.
> **Fix:** Cite the commands that produced the counts (for example `git diff --stat 9f829456..021`), and give the overlap between the two sets.
> **Status:** upheld

### [NOTE] party-ba — "Fresh start" is assumed to carry over to a database that already has the 022 migration applied

**Quotes:**

> Keep 022's caption backfill migration: it is a no-op on a fresh DB and keeps migration history intact.
> The fork starts with empty volumes (fresh start).
> **Problem:** The claim that the migration is a no-op rests on the DB being empty. Nothing says every environment the fork will meet is empty, so a developer with an old fork DB could see a different result. This is probably safe, because the user chose a fresh start. It is also not actually verified: no check states that the migration runs cleanly on an empty DB.
> **Fix:** Add a criterion that a `migrate deploy` on an empty DB succeeds.
> **Status:** upheld
