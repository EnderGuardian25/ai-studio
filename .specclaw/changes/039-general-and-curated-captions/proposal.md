# Proposal: One general caption, curated channel captions on demand

**Created:** 2026-10-28
**Status:** 🟡 Draft

## Problem

Every post today gets an on-image headline plus an Instagram caption and a LinkedIn caption, generated together. The channels are picked up front in the wizard. With publishing gone (037), the user (2026-10-28) wants:

- one general caption by default;
- a small option under it to generate a curated caption for Instagram, LinkedIn or Facebook separately, saved under the post next to the general caption.

Facebook does not exist in the system. Captions are tied to the `Channel` enum and `CAPTION_CHANNELS`, which `channels.ts` defines as the publish channels. `FACT_WHERE`, `CaptionKey` and the caption prompt's token budget are hard-coded to two channels.

This is change 3 of 3. It depends on 037 (Download replaces Export, and publishing is gone) and on 038 (the project briefing feeds the caption prompt).

## Proposed Solution

1. **Default generation.** The on-image headline stays, and one platform-neutral general caption is generated with every post. No channel caption is generated until asked for. The wizard's channel picker goes, and `Brief.channels` is dropped or ignored (the plan decides).
2. **Curated captions on demand.**
   - Under the general caption, three actions: Curate for Instagram, LinkedIn or Facebook.
   - Each produces one caption for that channel, written from the post (the brief, kit voice, post style, project briefing and the general caption).
   - It is saved on the post next to the general caption, at most one per channel.
   - The user can edit it inline, copy it, regenerate it (which replaces it; the draft's history allows undo) or delete it.
   - Channel rules:
     - **Instagram and LinkedIn:** today's rules.
     - **Facebook:** 40 to 120 words, a clear call to action with the website link, and 0 to 3 hashtags.
3. **Data.**
   - The general caption and Facebook are added to the caption vocabulary: new `Channel` values, or a separate caption-kind column, whichever the plan finds cleaner. Each `ALTER TYPE … ADD VALUE` goes in its own migration, with a down script.
   - `CAPTION_CHANNELS` is no longer the publish list. `CaptionKey`, `FACT_WHERE` and the prompt budget come from the registry.
   - All reads still go through `loadDraftCaptions`.
4. **Copy.** Every caption (general and curated) has a Copy button. Download is 037's single button.
5. **Facts check.** It runs on the headline, the general caption and every curated caption. It recomputes on curate, regenerate and edit. It shows a notice only; nothing is held.
6. **Caption route and models.** `selectRoute('CAPTION')`, `resolveModel` and the route stamps apply to curated captions as they do today. `CAPTION_PROMPT_VERSION` goes up.
7. **Analytics and Insights.**
   - New events for a curated caption generated (with its channel and outcome), a caption copied (with its channel, general included) and a post downloaded. Each event has one emitter and carries no text.
   - These events become the `Channel` carrier `analyticsCoverage.test.ts` needs.
   - Insights adds a small section: curated captions per channel, and downloads and copies per day.
8. **MCP and ACP.** `get_draft` returns the general caption plus any curated ones. `generate_post` makes the general caption only. The ACP manifest version goes up.
9. **Docs and tests.**
   - Rewrite the E2E suites `captions` and `caption-route`, and add Facebook and copy cases.
   - Update the unit tests `channels`, `caption*` and `analyticsCoverage`, and add wording-guard-clean UI copy.
   - Update `CLAUDE.md` (026, 024) and `docs/e2e-test-plan.md`.
   - The full mock suite stays green.

## Scope

### In Scope

- Everything listed under Proposed Solution.
- Old drafts that already have Instagram or LinkedIn caption rows show them as curated captions. Such a draft offers "Generate general caption".

### Out of Scope

- Publishing to any channel (removed by 037).
- Projects and briefings (038).
- Caption languages other than English, and hashtag research.

## Impact

- **Size:** architectural (it changes the caption data model, the generation contract, the analytics vocabulary and the MCP/ACP response shape)
- **Files affected:** ~50 (estimated, including tests and docs)
- **Complexity:** medium-large
- **Risk:** medium. Shared enums and the caption store invariants (the FAILED-row CHECK, the claim and settle actions) are the risk areas, and the caption E2E suites are the guard.

## Open Questions

- **Decided (user, 2026-10-28):** a curated caption is written from the brief, the kit voice, the post style and the project briefing, with the general caption passed in as context so the facts and offers stay consistent.
- Can the general caption be regenerated on its own? The proposed default is yes, using today's per-channel regenerate route, with general as one more target.

### Party review (2026-10-30): CHANGES_REQUESTED, 34 upheld (3 BLOCK, 25 WARN, 6 NOTE), 0 withdrawn — see party-report.md

- (party-visionary, BLOCK) Whether the general caption is a `Channel` value or a caption kind is one-way (enum rows, event payloads, the `get_draft` contract); decide it in the proposal, not the plan.
- (party-security, BLOCK) The Facebook link has no stated source, so the model would invent one; take it from one stored, validated field (code inserts or checks it), leave it out when none exists, and never ask the model for it.
- (party-security, BLOCK) Regenerate and delete can destroy a hand-edited caption; record the previous text so undo restores it, replace only after a successful settle, and make delete recoverable.
- (party-architect) The caption vocabulary choice decides four contracts (uniqueness key, FAILED-row CHECK, coverage test, copy event field); choose it in the proposal.
- (party-architect) Decide drop or ignore for `Brief.channels`, and list every surface that writes or reads it.
- (party-architect) Name the route and claim action for curate, regenerate and delete, what history records for a caption change, and whether delete can be undone.
- (party-architect) The facts check must recompute on every write to the caption set (delete, undo and the general-caption backfill included), or through one function every writer calls.
- (party-architect) Say what curate does on an old draft with no general caption, and what `get_draft` returns there.
- (party-architect) Name the field the Facebook link comes from and whether the Facebook limits are checked in code (a pure function), so tests do not only test the mock.
- (party-architect) Name the emitter of the download event (037's route or this change) and the path that records the client-side copy event.
- (party-architect) Write the new `get_draft` caption JSON shape, including the old-draft null case, for both MCP and ACP.
- (party-architect, NOTE) If sliced, the vocabulary, its migration and the full `get_draft` shape land with the general caption; only Facebook and curation paths belong to slice 2.
- (party-security) Only the author and team admins may curate, regenerate, edit or delete a caption (server-checked 403); one in-flight curate per draft and channel, plus a per-user rate limit.
- (party-security) The facts check sources stay the brief, kit voice text and project briefing and documents, never a caption; show a flagged general caption before curate runs.
- (party-security) `get_draft` and ACP return each caption's facts status and matched values; clients treat `flagged` and `error` as needing review.
- (party-security) The copy event goes through the session-scoped client-event path, checked against the caller's team and the registry, rate-limited; download is emitted by the server route.
- (party-security) The enum down script must fail closed (count rows, refuse without an explicit flag); prefer ignoring `Brief.channels`, or document a pre-drop dump.
- (party-security, NOTE) Dropping `Brief.channels` is safe only with a documented dump; ignoring it should mark it deprecated.
- (party-ba) Define "curated" in one sentence and state each channel's measurable rules.
- (party-ba) Add falsifiable criteria: Facebook word and hashtag limits, the link's source and its absent case, and how consistency with the general caption is observed.
- (party-ba) State the general caption's own rules, whether it is a channel or a kind, and the old-draft behaviour.
- (party-ba, NOTE) State what usage would show the feature is not wanted (e.g. a curate rate).
- (party-po) Weigh a minimal variant (curate, which replaces on re-run, plus copy) against edit, delete and a separate regenerate.
- (party-po) Ship only the events the coverage test needs; defer the Insights section until a question needs it.
- (party-po) State model calls and approximate tokens per post, default and worst case.
- (party-po, NOTE) Name a cut line (general caption first, curated captions second) and decide `Brief.channels` as ignored.
- (party-visionary) Make the caption's identity a key that can grow, e.g. (kind, channel), with room for a language.
- (party-visionary) Guard the registry against the `Channel` enum with a test that fails when they disagree.
- (party-visionary) Commit `get_draft` to an open keyed list, with general as a kind, so later kinds and fields are additive.
- (party-visionary) Count the old drafts with no general caption; backfill, freeze as history, or name the one reader that hides the branch.
- (party-visionary) Decide `Brief.channels`; if kept, mark it deprecated, stop all writers and remove it from `generate_post`.
- (party-visionary, NOTE) Store a hash or revision of the general caption on each curated caption, for a later staleness notice.
- (party-visionary, NOTE) Put each channel's measurable rules (word range, hashtags, link and its source field) in the registry, feeding both the prompt and a code check.
- (party-visionary) Rebuttal: slice only after the vocabulary and the `get_draft` shape are decided, so slice 2 is additive.
