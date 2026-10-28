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
