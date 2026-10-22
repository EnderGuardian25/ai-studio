# Proposal: Hero imagery Phase 2: reference images and product screenshots (009 follow-on)

**Created:** 2026-10-22
**Status:** 🟡 Draft

## Problem

Change 009 Phase 1 is VERIFIED PASS (25/25 ACs). A Path B brief can opt into `product-showcase` or `editorial-split`. The image model draws a hero subject and is told which part of the frame to leave empty. A real-pixel check fails closed to classic.

Phase 1 left one cause open on purpose. It is "cause 5": the image model gets no reference images (`009/proposal.md:25`, `009/spec.md:19`). `generateImage` takes `(prompt, brandKitId, size, options)` and no input image (`src/providers/interfaces/ImageProvider.ts:14-19`). The OpenAI provider calls `images.generate` only (`src/providers/implementations/image/openai.ts:26`). The Gemini provider sends a text-only `contents` part (`src/providers/implementations/image/gemini.ts:77-80`). `brandKitId` is accepted and ignored by both (`openai.ts:22`, `gemini.ts:66`).

So a device in the hero cannot show the real product UI. The model invents a screen, or leaves a vague glow. For a software company's marketing team, "a laptop showing our actual dashboard" is the post they want most. Phase 1 changes subject, depth and layout. It cannot change what a screen shows (`009/spec.md:19`).

**This change waits on OP-1.** Phase 2 was explicitly gated on Phase 1 being proven (`009/spec.md:106`, `009/proposal.md:168`, `docs/handoff.md:48-56`). OP-1 is the user's real-model comparison of six briefs on prod. It has not run. Without its result, we do not know the hero archetypes beat classic at all.

## Proposed Solution

Let a Path B hero post show a real product screenshot on a device screen. Pixel-exact, not redrawn.

### Two approaches

- **(a) Send the screenshot to the image model as a reference input.** The model draws a device showing it. This needs a new `ImageProvider` input (OpenAI image edits endpoint, Gemini image part in `contents`). Image models garble UI text and layout, so the "real UI" is only approximately real. It also costs more per call and needs a second code path per provider. It breaks the Phase 1 guarantee that we make exactly one plain image call.
- **(b) Composite the real screenshot into the screen region in HTML/CSS.** The image model draws only the device or scene, told to leave the screen blank. The design step places the real screenshot in that region. The UI is exact. No provider change is needed for the screenshot itself. The cost is a new region purpose and a flat, front-facing device constraint.

**Recommendation: (b).** Reasons grounded in the code:

1. Phase 1 already built the machinery. Regions are typed `{ rect, purpose, minAreaPct }`, and `composite` was reserved as a new literal with no schema change (`009/design.md:60`). `evaluateRegions` already verifies from real pixels that a region is empty (`src/lib/agent/background.ts:241-266`).
2. The pipeline stays at one image call with the existing fail-closed fallback. No new provider capability is needed, so 005's provider ownership is untouched.
3. The screenshot is the product's real UI, which is the point. Approach (a) can only promise "similar".
4. The renderer already allows our MinIO hosts (`src/lib/renderer/puppeteer.ts:82-90`), so a screenshot at a MinIO URL renders with no egress change.

Approach (a) stays a possible later addition for scene references (a mood, a style, a product photo), where fidelity does not matter. Whether to build that here is an open question.

### Where screenshots live

**Recommendation: on the brand kit, as a new artifact type** (or a reuse of `EXAMPLE_POST`/`REFERENCE_IMAGE` with a flag; see the open question). A product screenshot belongs to the brand, is reused across many posts, and the kit is already team-scoped with an upload route and MIME allow-list (`src/app/api/admin/brandkits/[id]/artifacts/route.ts:9-14`). `ArtifactType` has `REFERENCE_IMAGE` and `EXAMPLE_POST` (`prisma/schema.prisma:102-110`), but those mean "grounding for the assistant" and "style example". Reusing them would mix purposes and put a screenshot in every Path B prompt that reads `feedToAI` artifacts. A new type with its own picker keeps it out of prompts unless chosen.

The brief option is the other plausible home. `Brief.briefImages` already holds per-brief uploads with an `embed`/`reference` intent (`src/app/api/briefs/route.ts:133-142`, `src/lib/agent/prompts/pathB.ts:104-105`), stored under `briefs/<userId>/` in the IMAGES bucket. A brief image is the right place for a one-off screenshot ("this feature, this week"). It is an open question whether to support both, and whether the brief picks from the kit's screenshots, uploads its own, or both.

### Shape of the build (for planning, not a commitment)

1. Dataset: add `composite` to `Purpose` (`009/design.md:60`) and a third archetype contract (or a variant of `product-showcase`) with a screen region. The layout stays a contract in `src/lib/designData/`, so 007 extends the same module.
2. Image prompt: tell the model to draw a flat, front-facing device with a blank, evenly lit screen inside the declared rect. The prompt text is generated from the data (`src/lib/designData/promptText.ts`).
3. Verification: the existing luminance check, extended to the `composite` rect, proves the screen is blank enough. Fail closed to the classic prompt, as Phase 1 does.
4. Design step: the design prompt gets the screenshot URL and the rect, and must place it exactly there with cover-fit. The post-render layout comparison (`evaluateLayout`) can check the box.
5. Stamp: extend `compositionStampSchema` (`src/lib/designData/stamp.ts:22-30`) with an optional `references` field recording which screenshot(s) were used, and add a fallback reason such as `screen-not-blank` to `FALLBACK_REASONS` (`stamp.ts:7-16`). Both are validated in code, so no migration is needed for the stamp.
6. UI: a screenshot picker in the brief wizard, shown only for a hero style that supports it, and an admin upload on the kit.
7. Tests: a `MOCK_AI` sentinel in the style of the four `__MOCK_HERO_*__` seams (`src/lib/testHooks.ts:310`, `:351`), a real-render fixture, and an E2E section.

## Scope

### In Scope

- A `composite` region purpose and one archetype (or contract version) that uses it, SQUARE and PORTRAIT.
- Product screenshots as a team-scoped, kit-level asset (recommended), with an upload and a per-brief choice.
- Blank-screen verification, with fail-closed fallback to the classic prompt.
- Deterministic placement of the real screenshot in the design step.
- The stamp records which screenshot(s) were used and any new fallback reason.
- Tenancy: a screenshot belongs to one team's kit. A cross-team id returns 404, like every other kit asset.
- Mock seams and E2E coverage. No real model calls in the build.

### Out of Scope

- **Phase 3, the full AI render.** A later option only if still wanted after Phase 2 (`.specclaw/ROADMAP.md:100`). Not proposed here.
- Sending screenshots to the image model as a reference input (approach (a)). Listed as an open question, not planned.
- New image providers or provider capability changes. 005 owns providers (`ROADMAP.md:75`).
- Tilted, perspective or multi-device screens. The device must be flat and front-facing.
- Scheduled, MCP and ACP briefs. They stay classic, as in Phase 1.
- 9:16 (`STORY`). Phase 1 does not support it.
- Screenshot capture or auto-screenshotting a live product.
- Changing the default image style. The default stays classic.

## Impact

- **Size:** architectural. It adds a new region purpose to the dataset contract that 007 also extends, a new asset type with storage, UI and tenancy rules, and a stamp field others read.
- **Files affected:** about 20 to 30 (estimated): `src/lib/designData/*`, `background.ts`, the Path B prompts, the brief wizard, the kit admin UI and artifact route, `testHooks.ts`, tests, docs. Possibly one additive migration if screenshots get a new `ArtifactType` value.
- **Complexity:** medium to large.
- **Risk:** medium. The model may not draw a clean blank screen, so the fallback rate may be high. The new region verification is untuned on real images. A bad screenshot (wrong aspect, huge file) needs validation at upload.

### Dependency on OP-1

- **OP-1 has not run.** Planning and build should wait on its result.
- **If OP-1 passes (4 of 6 or better):** proceed. The stamps from those runs also show how often the blank-region check works, which tells us how tight a blank-screen threshold can be.
- **If OP-1 fails:** Phase 1 stays opt-in, and this change should not proceed as written. A "device scene" that does not beat classic will not be improved by putting a screenshot on it. Re-scope first: either fix Phase 1's prompts and thresholds, or drop this change.
- **Independent of OP-1** (can be done, or decided, now): the choice between (a) and (b), where screenshots live, and the tenancy and storage rules. These are decisions, not code. Anything that writes code, including the `composite` literal and the kit upload, should wait.

## Open Questions

1. Does OP-1 pass? Nothing is built until it does. Who confirms, and does a pass at exactly 4 of 6 justify the added cost?
2. Approach (b) assumes the image model can draw a flat, front-facing device with a blank screen in a declared rect. Is that true of `gpt-image-2` and Gemini on real runs? The OP-1 stamps do not measure this, so it needs its own small real-model check before planning.
3. Where should screenshots live: kit only (recommended), brief only, or both? If both, does the brief choose from the kit's screenshots?
4. A new `ArtifactType` value (needs a migration), or reuse of `REFERENCE_IMAGE` or `EXAMPLE_POST` with a flag? The new value is cleaner. The reuse avoids a migration but mixes purposes with `feedToAI` prompt inclusion (`prisma/schema.prisma:705`).
5. Should the screenshot live in the public IMAGES bucket (stable URL, simple render access) or a private bucket (signed at read)? A product screenshot may show unreleased UI. The renderer allowlist covers MinIO hosts, but a private bucket needs a signed URL that works for the render.
6. Should approach (a) also be built for scene references (mood, product photos), where UI fidelity does not matter? It needs the OpenAI edits endpoint and a Gemini image part, and it changes the one-call guarantee and the cost.
7. How many screenshots per post (one, or several for a multi-device scene)? One is the proposal's assumption.
8. What counts as a valid screenshot at upload: aspect ratio, minimum size, maximum file size? How is it fitted into the screen rect (cover, contain, crop)?
9. Cost: does a blank-screen prompt cost more than a Phase 1 hero prompt? `IMAGE_QUALITY` and the 120 s bound (`src/providers/imageCapabilities.ts:81`) still apply. OP-1 step 6 measures this for Phase 1 only.
10. Does 007 land first? Whichever of 007 and this change lands first creates or extends `src/lib/designData/` (`ROADMAP.md:62`). Is the order decided?

---

**To proceed:** Review this proposal and approve to begin planning. Planning should wait for the OP-1 result.
