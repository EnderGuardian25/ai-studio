# Proposal: Hero imagery and product-showcase design

**Created:** 2026-09-23
**Status:** 🟡 Draft

## Problem

**The image model is used as wallpaper, so posts are clean but flat.** A side-by-side comparison on 2026-09-23 made the gap concrete (`evidence/`):

- `bistec-studio-launch-v2.png`: a Bistec Studio post, hand-polished, with HTML/CSS cards over an AI background.
- `chatgpt-product-showcase.png`: ChatGPT, from a short prompt. A photoreal laptop shows the product UI, with a 3-step "brief → AI creates → publish" row, a call-to-action pill, depth and lighting.
- `chatgpt-glow-cards.png`: ChatGPT's generic glow style. 3D icons, neon, glassy feature cards.

The ChatGPT images have a **hero subject** with depth, lighting and physical objects. Ours never can, because of how the pipeline divides the work:

1. **The image step is constrained to backgrounds.** `prompts/background.ts:19-21` asks for a _"full-bleed BACKGROUND image"_ with _"NO text, NO logos"_. `prompts/pathB.ts:35` then tells the design model to use it _"as the full-bleed background layer"_ with _"a subtle scrim"_. Nothing ever asks for a subject, an object or a scene with a focal point.
2. **The image and the layout are decided blind to each other.** The background is generated first (`pathB.ts:73`). The design model then has to fit text over whatever came back, so it reaches for scrims. The grey, washed-out middle band in our launch post is exactly that.
3. **The image model gets no reference images.** `ImageProvider.generateImage(prompt, _brandKitId, size)` ignores the kit (`_brandKitId`) and calls `images.generate` only (`providers/implementations/image/openai.ts:11-19`). It can never show the **real** product UI on a device screen, match a reference style, or respect a real logo.
4. **Image quality is never set.** `openai.ts` passes no `quality`, so every image runs at the provider default.
5. **There is no composition vocabulary.** Path B re-invents the layout on every generation. Proven structures such as a steps row, a device showcase or a CTA pill appear only by chance. That is the adjective problem **007** documents, applied to layout instead of kit rules.

## Proposed Solution

Let the image model make the **hero**, keep HTML for everything that must be exact, and bind the two with a **measurable layout contract**.

1. **Layout archetypes as data.** A small, versioned set of composition archetypes. Each one states in measurable terms where the text sits, where the image subject sits, and what must stay empty. Starting set:

   | Archetype            | Contract (example)                                                          |
   | -------------------- | --------------------------------------------------------------------------- |
   | `product-showcase`   | device/subject in right ~55%; left ~45% empty and dark for text             |
   | `hero-centre`        | subject centred in middle ~50% height; top ~20% and bottom ~25% kept clear  |
   | `editorial-split`    | image confined to its own ~40% band; soft-masked edge (the proven IRP rule) |
   | `typographic`        | no image; today's CSS/SVG-only behaviour                                    |
   | `classic-background` | today's full-bleed background + scrim; the backwards-compatible default     |

   A brand kit lists which archetypes it allows and its default. A brief can pick one or leave it on **auto**.

2. **The art-director step returns a layout, not just a prompt.** The decision gains `{ archetype, role: 'hero' | 'background', safeArea }`. The image prompt states the empty region as a measurement ("the left 45% of the frame must be an empty dark gradient"). The design prompt receives **the same** archetype and safe area, so text lands where the image is empty by construction, not by scrim.
3. **Verify the contract, don't assume it.** After the image returns, sample luminance and variance inside the text safe area (the existing `sampleImageColors` machinery in `renderer/puppeteer.ts`). If the region is busy or fails contrast, regenerate once, then fall back to `classic-background`. This follows the 2026-08-03 lesson: **a prompt rule is not an invariant; check the output.**
4. **Reference images into the image model.** Extend `ImageProvider` with optional `references: { url, role: 'product-ui' | 'style' | 'logo' }[]`. The OpenAI implementation uses the image-edit endpoint with input images when references are present. A brand kit gains **product screenshots** (a new artifact role, or `REFERENCE_IMAGE` + `feedToAI`), so a device screen shows the real product.
5. **The logo and all text stay in HTML.** In hero mode the image model still never renders text or logos. The real kit logo and exact copy are layered by the design step, which preserves correct spelling, logo fidelity, inline edit (PR #36), refine and version history.
6. **`quality: 'high'` for hero images**, configurable per team, with the latency and cost measured before it becomes the default.
7. **Experimental: full AI render (Phase 3, off by default).** For teams that want the ChatGPT look outright, the image model renders the entire post (text included) with the kit logo and colours as references. The trade-offs are stated in the UI:
   - text may be misspelled;
   - the logo may drift;
   - inline edit is unavailable;
   - refine becomes an image edit, not an HTML edit.

   Enabled per team by an admin, and stamped on the draft so it can't be mistaken for a normal render.

**Decisions (user, 2026-10-21):**

- **This change is Phase 1 only.** Phases 2 and 3 become their own changes later, proposed when Phase 1 is proven. Items 4 and 7 above, and the product-screenshot part of the reference images, are out of scope here.
- **On a failed safe-area check, fall back directly** to `classic-background`, with no regenerate. Open question 4 is answered.
- **Quality: keep the provider default.** Add a per-team quality setting whose default is today's behaviour, and teams opt into `high` after it is measured on prod. The build makes no real model calls, so nothing can be measured first. Item 6 is reworded and open question 2 is answered.
- **Size: architectural.** The change adds a new design-data module, schema for the brief's archetype and the kit's allow-list, and prompt changes.

**Phasing (each phase independently revertible):**

- **Phase 1:** archetypes, the layout contract, safe-area verification, quality. `classic-background` stays the default until the archetypes are proven.
- **Phase 2:** reference images and product screenshots.
- **Phase 3:** experimental full AI render.

## Scope

### In Scope

**Phase 1 only:**

- a composition archetype dataset, a kit-level allow-list and default, and a brief-level choice (auto by default);
- the art-director decision schema extension, and matching image and design prompt builders (`PROMPT_VERSION` bump);
- post-generation safe-area verification, with a **direct fallback** to `classic-background`;
- a per-team `quality` setting for hero images, defaulting to today's behaviour;
- real-render tests of the safe-area check, using **004**'s rasterizing harness (`npm run test:render`).

### Out of Scope

- **Phase 2:** `ImageProvider` reference images, the OpenAI edit endpoint and product-screenshot kit artifacts (a later change).
- **Phase 3:** the experimental full AI render (a later change).
- Regenerate-once on a failed safe-area check (the user chose a direct fallback).
- New image **providers** (Gemini) and the `isDefault` resolution fix — proposal **005** (the fix is a **prerequisite**, see Dependencies)
- Converting kit prose into measurable rules and the typography dataset — proposal **007** (this proposal adds a **composition** section alongside it)
- Refine instruction fidelity — proposal **004**
- Video, motion or animated posts
- The app's own UI — proposal **011**

## Dependencies

- **005 item 3 (`isDefault` fix) is a hard prerequisite.** Today a teammate without a personal OpenAI key gets **no image at all**, silently. Ship hero mode before that fix and most users would see no change, only the CSS fallback.
- **004 T3 (rasterizing harness)** is needed to test the safe-area check against real pixels. The mock suite cannot see this class of bug (`MOCK_PUPPETEER` never rasterizes).
- **007** is soft: archetypes can land first, but should live in the same design-system data module 007 introduces, not a parallel one.

## Impact

- **Files affected:** ~20–30 (estimated) — background/pathB prompt builders, `background.ts`, `ImageProvider` + OpenAI impl, renderer sampling, brand-kit artifacts + admin UI, brief wizard, schema (brief archetype, kit allow-list, Phase 3 flag), tests
- **Complexity:** large
- **Risk:** medium-high. This changes the look of every Path B post, adds image cost (high quality, possible regenerate-once), and adds latency to an already ~5-minute pipeline. Mitigated by `classic-background` as the default until proven, per-kit opt-in, `PROMPT_VERSION` stamping, and phase independence.

## Open Questions

- Does **gpt-image-2** accept multiple input images on the edit endpoint, and does it support `background: 'transparent'`? Transparent hero cut-outs would allow subjects to be composited over **exact** CSS brand gradients, which is stronger than any prompt-described colour. Confirm against current API docs at design time.
- What does `quality: 'high'` cost in latency and price per image? Measure before making it the default.
- Should the art-director step stay on Haiku, or move to Sonnet for hero mode, where the layout decision matters more? That becomes a **008** surface question if it is made user-selectable.
- Is regenerate-once on a failed safe-area check worth the extra image cost, or should it fall straight back to `classic-background`?
- For product screenshots on device screens: should the image model receive the screenshot as a reference (it may redraw it inaccurately), or should the design step composite the **real** screenshot into a device frame the image model leaves blank? The second is exact but needs a screen-region contract.

**Party panel (2026-10-21, deep, CHANGES_REQUESTED): the upheld findings.**

- (party-architect, BLOCK) The safe area has two sources of truth: the archetype dataset and the model's decision — see party-report.md
- (party-architect, BLOCK) The per-team quality setting has no named storage or route to the provider, and the Impact list does not match the Phase 1 decisions — see party-report.md
- (party-architect, BLOCK) The archetype that actually rendered is never recorded, and refine and regenerate are unnamed co-changes — see party-report.md
- (party-architect, WARN) Nobody owns the design-data module: this change creates it, but 007 is said to own it — see party-report.md
- (party-architect, WARN) The rules for picking an archetype (auto, kit default, allow-list) are not specified — see party-report.md
- (party-architect, WARN) The safe-area check has no thresholds, no coordinate space, and no text colour to measure contrast against — see party-report.md
- (party-architect, WARN) It is not defined what the fallback to `classic-background` renders, or what happens when no image comes back — see party-report.md
- (party-architect, WARN) The only named test seam is a real-render test; the decision and fallback logic has no stub seam — see party-report.md
- (party-architect, NOTE) Rebuttal to party-visionary: an emptiness check on the final render is not the same check, so it cannot cover both halves — see party-report.md
- (party-ba, BLOCK) The central evidence is one informal comparison against a different product, with no baseline showing users see "flat" posts as a problem — see party-report.md
- (party-ba, WARN) The proposal's Phase 1 contradicts its own evidence: the ChatGPT look depends on a photoreal hero subject and real product UI, which are excluded — see party-report.md
- (party-ba, WARN) No acceptance criteria, so the main claim (posts look less flat) has nothing to fail against — see party-report.md
- (party-ba, WARN) The proposal's own text still asserts the decided-against behaviour and the per-team Phase 3 and quality scope, so the stated scope is inconsistent — see party-report.md
- (party-ba, WARN) "Auto" archetype selection has no stated chooser or behaviour, and "safe area" and "measurable" are undefined — see party-report.md
- (party-ba, NOTE) The assumption that a safe-area luminance and variance check detects a usable text region is unverified — see party-report.md
- (party-po, BLOCK) Phase 1 ships a new look with zero default exposure and no stated value for what it builds — see party-report.md
- (party-po, WARN) Per-kit allow-list, kit default, and brief-level picker are optionality nobody asked for — see party-report.md
- (party-po, WARN) Running cost is unstated and the Impact section contradicts the decisions — see party-report.md
- (party-po, NOTE) Quality setting could be an env or config value instead of a per-team setting — see party-report.md
- (party-po, NOTE) The safe-area check is a separable cut line, and 005 item 3 should ship first — see party-report.md
- (party-security, BLOCK) The verifier's region comes from the model it is checking — see party-report.md
- (party-security, WARN) The check reads the image and never where the text actually landed — see party-report.md
- (party-security, WARN) An archetype from the brief or from auto is not stated to be checked against the kit allow-list — see party-report.md
- (party-security, WARN) The fallback to classic-background is silent and leaves no record — see party-report.md
- (party-security, WARN) The fallback only fires on a measured failure, so a check that cannot run passes — see party-report.md
- (party-security, WARN) The per-team quality setting spends money but names no permission gate — see party-report.md
- (party-security, NOTE) Rebuttal to party-po: shipping archetype prompts before the verifier ships the unchecked failure mode as the live state — see party-report.md
- (party-visionary, WARN) The layout decision is used once and thrown away, so every later edit of the draft works blind to it — see party-report.md
- (party-visionary, WARN) "Until proven" is the gate for the default flip and for Phase 2, and nothing records the evidence — see party-report.md
- (party-visionary, WARN) Archetype keys become persisted references with no rule for retiring or revising them, which breaks the "independently revertible" claim — see party-report.md
- (party-visionary, WARN) Layout now has two sources of truth: the archetype contract and the kit and briefing prose that already state layout rules — see party-report.md
- (party-visionary, WARN) The layout contract allows one region, but the starting set already needs two and Phase 2 needs a third kind — see party-report.md
- (party-visionary, WARN) The archetype contracts are percentages with no post size, so every future size change must re-audit every archetype — see party-report.md
- (party-visionary, WARN) The per-team `quality` setting stores one provider's parameter in a provider-neutral place — see party-report.md
- (party-visionary, WARN) Rebuttal of party-po's prompt-only variant: cheap to build, but it leaves layout as prose in the prompt builders, the pattern this proposal names as the cause — see party-report.md

---

**To proceed:** Review this proposal and approve to begin planning.
