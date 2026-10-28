# Proposal: Replace campaigns with projects

**Created:** 2026-10-28
**Status:** 🟡 Draft

## Problem

The user (2026-10-28) wants the campaign system removed entirely. Campaigns carry four things the user wants to keep: a default brand kit, a briefing injected into generation, reference documents for the facts check, and a default post style and tone. Projects are the grouping the user wants instead. Today a project reaches a post only through a campaign (campaign → `ProjectCampaign` → project). `Brief` and `Draft` have no `projectId`, so a post cannot be assigned to a project at all.

Campaigns also decide who can see a post. In `src/lib/authz/visibility.ts`, used by about 24 files, an editor sees a teammate's post only when its brief has a `campaignId`. Removing campaigns without replacing that rule would make every post private to its author.

This is change 2 of 3. It depends on 037, which removes the campaign queue.

## Proposed Solution

1. **A post belongs to zero or one project.**
   - Add a nullable `projectId` on the post (on `Brief`, unless the plan finds `Draft` the better owner).
   - Deleting a project unassigns its posts.
   - The wizard's first step, "Campaign", becomes an optional project picker.
   - On the post page and in the library, any team member can assign a post to a project, move it or remove it.
   - The project page lists its posts, and the library filters by project.
2. **Projects take over the campaign's generation inputs:**
   - **Default brand kit.** The field exists already and now applies directly. Kit precedence becomes: explicit brief kit → project default kit → team default kit.
   - **Briefing.** The versioned free-text briefing moves to projects, with its assistant, chat, Improve and upgrade routes. It is injected wherever the campaign briefing is today: Path A, Path B, the background art director, captions and the facts-check sources.
   - **Documents.** Uploaded reference documents move to projects, and the facts check compares against them.
   - **Default post style and tone.** Post-style precedence becomes: explicit → project default → `general`. `resolvePostStyle` stays the only resolver.
3. **Permissions.** Team admins create, rename and delete projects and edit their briefing, documents and defaults. Any team member can assign or move a post.
4. **Visibility.** Every member of a team sees every post in that team. `visibility.ts` is rewritten around team membership, and the "has a campaign" rule goes.
5. **Removal.**
   - A migration drops `Campaign`, `CampaignBriefing`, `CampaignDocument`, `ProjectCampaign` and `Brief.campaignId`, and creates the project equivalents. It ships a manual down script. The system starts fresh, so no data is carried over.
   - The campaign pages, nav entry, routes, components and `src/lib/campaign/*` are removed or moved under projects.
   - The dashboard's recent-drafts Campaign column becomes Project, and the dashboard gains a "Projects" count (moved here from 037 by the 037 party review).
6. **MCP and ACP.** `generate_post` takes an optional project instead of a campaign. The ACP manifest version goes up.
7. **Analytics.** Any event field that names a campaign is replaced by the project, with a `schemaVersion` bump. Insights loses anything campaign-based.
8. **Docs and tests.**
   - Update `CLAUDE.md`, `docs/mcp-acp-guide.md` and `docs/e2e-test-plan.md`.
   - Move the E2E suites `briefing-assistant`, `briefing-upgrade` and the campaign parts of `team-isolation`, `surfaces` and `library` to projects.
   - Rewrite the unit tests `visibility`, `campaignBriefing` and `campaignDocuments`.
   - The full mock suite stays green.

## Scope

### In Scope

- Everything listed under Proposed Solution.
- Project create, rename and delete, a briefing section, a documents section, defaults, and the post list on the project page.

### Out of Scope

- Scheduling and publishing removal (037, which comes first).
- Caption rework, Facebook and the caption Insights metrics (039).
- Nested projects, and a post in several projects.

## Impact

- **Size:** architectural (it changes the sharing model, the kit and post-style resolver tiers, the schema and the MCP/ACP contract)
- **Files affected:** ~80 (estimated, including tests and docs)
- **Complexity:** large
- **Risk:** medium-high. The visibility rewrite touches about 24 routes, and the team-isolation E2E suite is the guard. The resolver signature change touches every caller, and `postStylesBoundary.test.ts` is the guard.

## Open Questions

- **Decided (user, 2026-10-28):** with every member seeing every post, only the author and team admins may edit, refine, regenerate, change the kit of or delete a post. Other members can view, download, copy captions and assign it to a project.
- The plan must confirm the right owner for `projectId` (`Brief` or `Draft`) from how regenerate and revisions use them.
