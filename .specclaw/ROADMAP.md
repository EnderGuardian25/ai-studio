# bistec-studio roadmap — changes 004–023

**Updated:** 2026-10-21 · **Branch:** all of this lands on `v2` (see Branching at the bottom); handoff in `docs/handoff.md` top section.
**Status (2026-10-21):** **013–022 are verified PASS** (018, 022, 021, 019 and 020 on 2026-10-19 and 2026-10-20; see the table). **023** (scheduler heartbeat, which took over 006 item 7) is **verified PASS** (11/11). **Next: 009 hero imagery, Phase 1.** 006 (the rest), 007 and 010 stay proposals.

**(Superseded) Status (2026-10-14):** **016** (fresh-start cleanup) and **017** (publish API fixes) are **verified PASS**, with CI green. **018** (post-008 small fixes) is building; T1 is a committed WIP. **019** (claim token) and **020** (Create post button off the draft page) are approved and not yet planned. After them: 006, 007, 009 and 010 (proposals).

**(Superseded) Status (2026-10-13, later):** **004** re-verified PASS at `e88b55b6` (CI green: E2E 391/3/0/0, unit 2604, render 15/15). **008** is **verified PASS** (32/32). The new system starts teams and users fresh, so the post export/import scripts are dropped. Next: a fresh-start cleanup of old-data-only code, then the post-008 follow-ups, then 006/007/009/010.

**(Superseded) Status (2026-10-13):** **008** (model selection) is **built, 19/19**, on `v2`. Wave 1 (catalogue, resolver, `/team` → Models, stamps, time budget) gated at 383/3/0/0 with CI green; wave 2 (the pickers) gated at 391/3/0/0. T2, the operator CLI full-ID check, passed. **Next: `/specclaw:verify 008-model-selection`.** Handoff and the 008 runbook: `docs/handoff.md` top section.

**(Superseded) Status (2026-10-12, later):** **015** (the draft-page settle race behind the red fork CI) is verified PASS, and fork CI on `v2` is green again. **008** (model selection) is **approved (architectural)** after a deep party panel; its rulings are recorded in its proposal and **planning is in progress**. Work lands directly on `v2`, with no per-change PRs; one `v2`→`main` PR follows later, on request.

**(Superseded) Status (2026-10-11, later):** **004**, **005**, **011**, **013** (fork CI, checks only) and **014** (UI accessibility, shared primitives and consistency) are verified PASS. **012** (per-channel captions) is **built, 16/16, and verified PASS** (2026-10-12) on `v2`. **012 → 010 stays a hard dependency:** 010 consumes the `DraftCaption` WhatsApp row. **006–010** are proposals. Handoff: `docs/handoff.md` top section.

**(Superseded) Status (2026-10-11, earlier):** 004, 005, 011, 013 and 014 verified PASS; 012 building, T1–T7 of 16 committed.

**(Superseded) Status (2026-10-03):** **004** is done: 24/24 built, verify PARTIAL only because its Phase 0 waits on PR #42 + the Coolify token. **005** is built (9/10) on `v2`; T6 waits on one operator check (AC-16, an in-image CLI vision run with the user’s own token), then `/specclaw:verify`. Item 2 (COPY route) stays deferred to 008. **006–012** are proposals. Handoff: `docs/handoff.md` top section.

This file sequences the open changes. Each change's own `proposal.md` is the source of truth for its scope. This file only records **order, dependencies, and the boundaries between changes that touch the same code**.

## The changes

| #   | Change                                                                              | What it fixes / adds                                                                                                                                   | Size          | State                                                                  |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ---------------------------------------------------------------------- |
| 004 | [Design instruction fidelity](changes/004-design-instruction-fidelity/)             | Refine edits that don't stick; tofu glyphs; a real-render test harness                                                                                 | medium        | ✅ verified PASS (re-run 2026-10-13)                                   |
| 005 | [Provider flexibility + onboarding](changes/005-provider-flexibility-onboarding/)   | Guided Claude connect; COPY provider route; `isDefault` image bug; Gemini; CLI sandbox                                                                 | medium        | ✅ built 10/10 — verify PASS (2026-10-06)                              |
| 006 | [Product observability](changes/006-product-observability/)                         | Self-hosted PostHog, generation traces, stale-export badge (item 7, the scheduler heartbeat, **moved to 023**)                                         | large         | 📋 proposal                                                            |
| 007 | [Brand-kit design system](changes/007-brandkit-design-system/)                      | Turn adjectival kit prose into measurable rules; typography dataset                                                                                    | medium-large  | 📋 proposal                                                            |
| 008 | [Model selection](changes/008-model-selection/)                                     | Choose Haiku / Sonnet / Opus per caption, design, refine and assistant chat                                                                            | medium-large  | ✅ verified PASS (32/32)                                               |
| 009 | [Hero imagery](changes/009-hero-image-design/)                                      | Image model makes the hero subject, not wallpaper; layout archetypes; reference images                                                                 | large         | 📋 proposal (new)                                                      |
| 010 | [WhatsApp Channel posting](changes/010-whatsapp-channel-posting/)                   | WhatsApp as a channel, with assisted handoff (Meta has no official Channel posting API)                                                                | medium        | 📋 proposal (new)                                                      |
| 011 | [App visual redesign](changes/011-app-visual-redesign/)                             | New visual direction; opaque surfaces; floating bottom-right **Create post** button. The user picked Graphite on 2026-10-18, and 021 re-themed the app | large         | ✅ verified PASS (2026-10-09); superseded and finished by 021 Graphite |
| 012 | [Per-channel captions](changes/012-per-channel-captions/)                           | Instagram / LinkedIn / WhatsApp captions, each published to its own channel; copy → caption                                                            | medium        | ✅ verified PASS (28/28)                                               |
| 013 | [Fork CI, checks only](changes/013-fork-ci-checks-only/)                            | The fork's CI runs checks only: no image push, no deploy                                                                                               | bounded       | ✅ verified PASS (7/7)                                                 |
| 014 | [UI a11y and consistency pass](changes/014-ui-a11y-consistency-pass/)               | Accessible names, shared page primitives and consistency (011 follow-up)                                                                               | architectural | ✅ verified PASS (21/21)                                               |
| 015 | [Draft-action settle race](changes/015-draft-action-settle-race/)                   | The draft-page settle race behind the red fork CI                                                                                                      | bounded       | ✅ verified PASS (8/8)                                                 |
| 016 | [Fresh-start cleanup](changes/016-fresh-start-cleanup/)                             | Removes code that only served old data (repairs, conversions, rollbacks)                                                                               | bounded       | ✅ verified PASS (12/12)                                               |
| 017 | [Publish API fixes](changes/017-publish-api-fixes/)                                 | A failed publish no longer reports success                                                                                                             | bounded       | ✅ verified PASS (6/6)                                                 |
| 018 | [Post-008 small fixes](changes/018-post-008-small-fixes/)                           | The 015 tail, small 008 follow-ups and test hygiene                                                                                                    | bounded       | ✅ verified PASS (8/8)                                                 |
| 019 | [Draft-action claim token](changes/019-draft-action-claim-token/)                   | A per-claim token, so a stalled run cannot write over a newer claim                                                                                    | bounded       | ✅ verified PASS (9/9)                                                 |
| 020 | [Create post button off the draft page](changes/020-create-post-button-draft-page/) | Hides the floating button on the draft page                                                                                                            | bounded       | ✅ verified PASS (7/7)                                                 |
| 021 | [Graphite re-theme](changes/021-graphite-retheme/)                                  | Re-themes the whole app from Folio to Graphite                                                                                                         | architectural | ✅ verified PASS (19/19)                                               |
| 022 | [Prod data and deploy restore](changes/022-prod-data-and-deploy-restore/)           | Makes the adopted `v2` deployable over company prod data                                                                                               | bounded       | ✅ verified PASS (11/11)                                               |
| 023 | [Scheduler heartbeat](changes/023-scheduler-heartbeat/)                             | A `WorkerHeartbeat` per loop, a "Scheduler offline" banner on the queue panel, the retry reason (took 006 item 7)                                      | bounded       | ✅ verified PASS (11/11, 2026-10-21)                                   |

## Hard dependencies

These are "B cannot work until A lands", not just preferences.

```
B4 scheduler fix (ops) ───────────────► 010 scheduled WhatsApp handoffs
005 item 3 (isDefault image fix) ─────► 009 (else most users get no image at all)
012 (per-channel captions, built) ────► 010 (the DraftCaption WhatsApp row + per-channel publish)
004 T9 (rasterizing harness) ─────────► 009 safe-area verification
```

## Soft dependencies (ordering that avoids rework)

- **011 foundation + app shell → 008 pickers, 010 handoff screen.** Both add new UI. Build them once in the new style instead of in Frozen Light and again later.
- **008 → 005 item 2.** 008 introduces the model resolver. 005's COPY provider selector (OAuth CLI vs API key) should sit on top of it, not beside it.
- **007 ↔ 009.** 009's layout archetypes belong in the same design-system data module as 007's dataset. Whichever lands first creates the module; the other extends it.
- **008 → 006.** 006's generation traces read 008's stamps instead of re-deriving the model: `DraftCaption.model` (per caption row), `Draft.headlineModel`, `Draft.designModel` and `DraftRevision.model`. Each is the full ID that ran, with a `…SubstitutedFrom` sibling. Cost comes from the catalogue's numeric per-MTok prices (`priceInputPerMTok` / `priceOutputPerMTok` in `src/lib/models/catalogue.ts`, with a dated `priceSource`), not from the `$` / `$$` / `$$$` tier, which is computed from them.
- **012 → 008.** Build 012 first so 008 stamps `captionModel` on the new caption shape and names its surface `caption` from the start. If 008 goes first, it must use those names anyway. **Done:** 012 shipped first, and 008 stamps each caption row (`DraftCaption.model`) and the headline (`Draft.headlineModel`) under the `CAPTION` surface.
- **011 foundation → 012 caption panels.** Same reason as 008: new UI, built once in the new style.
- **~~006 item 7~~ → 023 (scheduler heartbeat) → 010.** Item 7 moved out of 006 into 023, which is verified PASS. A missed WhatsApp handoff is a missed post. It is the same "nothing self-reports" failure B4 was.

## Boundaries between overlapping changes

| Overlap             | Owner split                                                                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Caption "choice"    | **005** picks the _route_ (OAuth CLI vs a registered API key). **008** picks the _Claude model_ on that route.                                                                                                 |
| WhatsApp caption    | **012** _generates and stores_ it as the `DraftCaption` WhatsApp row (and fixes per-channel publishing). **010** _posts_ it via the handoff screen, flips its registry `publishable`, and owns the real limit. |
| Naming              | **012** renames "copy" → "caption" in UI, docs and the code it touches. The `COPY` provider slot keeps its name (it also drives brand-voice drafting).                                                         |
| Image generation    | **005** owns _providers_ (Gemini, `isDefault` resolution). **009** owns _how images are used_ (hero, archetypes, references).                                                                                  |
| Design rules        | **007** owns kit _rules and typography_. **009** owns _composition_. **004** owns _refine_.                                                                                                                    |
| Real-render testing | Built once in **004** (T9); reused by 007, 009 and 011.                                                                                                                                                        |
| UI                  | **011** owns the app's look, and the app shell's floating **Create post** button. 008, 010 and 012 add screens _in_ that look; they do not restyle.                                                            |

## Recommended order

**Stage 0 — ops + the deploy pipeline (do now).** These unblock things that are already built.

- **Swap prod MinIO to `pgsty/silo`** (`docs/minio-silo-migration.md`, PR #42 branch). This is urgent because of CVE-2026-40344.
- **Rotate the Coolify API token** (needs `deploy` + `read`, made by a team Admin/Owner). Merges to `main` currently build but do not deploy (Coolify 401 since 2026-09-15). Handoff: `docs/coolify-token-rotation.md`. Then ship **004 Phase 0** (built: **PR #42**) as its own PR to `main`: readable deploy failures, post-deploy commit verification, current actions, Node 22. It is the one exception to the `v2` rule, because the deploy steps only run on `main`.
- Fix **B4**: the Coolify scheduler resource. Read `docs/scheduler-b4-diagnosis-2026-08-03.md`; one look at its logs picks the cause.
- Set a **team Claude token** on both prod teams at `/team`.
- Mark each team's IMAGE provider **isDefault** (data fix for today's silent no-background bug, ahead of 005's code fix).

**Stage 1 — correctness and quick wins.**

- **004** in full. It is planned, it answers the one real user complaint, and it builds the render harness three later changes reuse.
- Optionally ship **011's floating Create post button** as a standalone early unit, in the current style; it restyles with the shell later.
- Pull forward **005 item 3** (`isDefault` resolver fix) and **006 item 7** (scheduler heartbeat). Both are small and independent, and both remove silent failures.

**Stage 2 — 011 foundation.** Direction study → chosen direction → tokens → opaque surface model → app shell. This fixes the see-through bars early and fixes the style before new screens are built.

**Stage 3 — 012 per-channel captions, then 008 model selection**, both built in the new style. 012 goes first, because it fixes the bug where every channel is published the combined caption, and 008 stamps its new shape.

**Stage 4 — 009 hero imagery**, Phase 1 (archetypes + layout contract + quality), then Phase 2 (reference images). Phase 3 (full AI render) only if still wanted after Phase 2.

**Stage 5 — 010 WhatsApp**, once B4 is fixed, the heartbeat is in, and **012** has landed.

**Stage 6 — the rest, parallelisable:**

- **011** remaining screens;
- **005** remainder (onboarding, COPY route on 008's resolver, Gemini, CLI sandbox);
- **007**;
- **006** PostHog + traces.

Why this order: user-visible quality and silent failures come first. Changes that other changes build on (004's harness, 011's tokens, 008's resolver) land before their dependants. The two infrastructure-heavy items, self-hosted PostHog and the CLI sandbox, go last because nothing else waits on them.

## Parallel-work caution

011's screen restyles can run beside backend-heavy work, but several files are shared. Coordinate these, or sequence them:

- the brief wizard's Review step (008 pickers + 011 restyle);
- `PublishDialog.tsx` (010 + 011);
- the refine panel (004 + 008 + 011);
- the draft page's caption area (012 + 011; 004 also edits `drafts/[id]/page.tsx`);
- the app shell `AppShell.tsx` + `ToastProvider.tsx` (011's Create post button + toast offset).

**Branching (decided 2026-09-23):** all of 004–012 lands on one integration branch **`v2`**, pushed to `origin`. `v2` merges to `main` in one go only once it is confirmed working and the user gives the go-ahead. `main` is what CI auto-deploys to prod, so nothing on `v2` reaches production before that merge — confirmation happens locally or on a separate environment. Within `v2`, each change (and each 004 phase) is its own commit series so it can still be reverted on its own.
