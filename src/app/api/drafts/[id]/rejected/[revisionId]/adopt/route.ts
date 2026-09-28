import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { dimensionsFor } from '@/lib/aspectRatio'
import { resolveExportUrl } from '@/lib/storage/minio'
import { commitDraftRevision, AdoptConflictError } from '@/lib/drafts/revisions'

// "Use anyway" (change 004 Phase 2, T19, FR-14a): adopts a twice-failed
// refine's retained rejected render as a normal, committed chain revision.
//
// Synchronous — no model call and no re-render, the rejected row's own
// stored export is reused as-is (Ruling D: a row with no export has nothing
// to adopt) — so, unlike refine/regenerate-design, this route never claims
// Draft.pendingAction: no DraftAction enum value describes "adopt a stored
// render" honestly (it is neither a regenerate nor a refine), and adding one
// would need a new migration on top of T15's — which the task's ruling says
// to avoid. Single-flight instead comes from two layers:
//   1. a route-level pendingAction check (mirrors inline-edit's
//      inlineEditBlockReason) — 409s while another action is genuinely
//      running, same message as refine/regenerate use for the same case;
//   2. the load-bearing guard: an atomic conditional UPDATE inside
//      commitDraftRevision's own transaction (adoptRejectedRevisionId) that
//      flips the rejected row's adoptedAt from NULL exactly once. Two
//      concurrent adopts of the same row can never both win — the loser's
//      commit aborts with AdoptConflictError, mapped to 409 below.
export const POST = withTeamAuth<{ id: string; revisionId: string }>(async (_req, { params }, user) => {
  const draft = await prisma.draft.findUnique({
    where: { id: params.id },
    include: { brief: true },
  })
  if (
    !draft ||
    !canAccessContent(user, {
      teamId: draft.teamId,
      ownerId: draft.brief.userId,
      campaignId: draft.brief.campaignId,
    })
  ) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  if (draft.pendingAction !== null) {
    return NextResponse.json({ error: 'Another action is already running on this draft' }, { status: 409 })
  }

  const row = await prisma.draftRevision.findUnique({
    where: { id: params.revisionId },
    select: {
      id: true,
      draftId: true,
      instruction: true,
      htmlSnapshot: true,
      exportUrl: true,
      rejectedAt: true,
      adoptedAt: true,
      discardedAt: true,
    },
  })
  // A genuinely unknown row id parallels the draft-not-found 404 above — a
  // resource that simply does not exist.
  if (!row) {
    return NextResponse.json({ error: 'Rejected render not found' }, { status: 404 })
  }
  // The row exists, but some precondition fails: it belongs to a different
  // draft, it isn't (or is no longer) THIS draft's live not-applied outcome,
  // it was already adopted or discarded, or it was never a usable rejected
  // render at all (no export — Ruling D). All of these are 409, matching the
  // task's own enumerated preconditions verbatim. A revisionId only ever
  // reaches a client via ITS OWN draft's poll response, so there is no
  // cross-tenant secret a 404 would additionally protect here — the draft
  // visibility check above is what keeps this team-scoped.
  const eligible =
    row.draftId === draft.id &&
    row.id === draft.notAppliedRevisionId &&
    row.rejectedAt !== null &&
    row.adoptedAt === null &&
    row.discardedAt === null &&
    row.exportUrl !== null
  if (!eligible) {
    return NextResponse.json({ error: 'This render can no longer be adopted' }, { status: 409 })
  }

  const { width, height } = dimensionsFor(draft.brief.aspectRatio)

  try {
    const { revisionId, exportKey } = await commitDraftRevision({
      draftId: draft.id,
      // Recognizably user-accepted despite a failed check (FR-14a).
      instruction: `Use anyway: ${row.instruction}`,
      html: row.htmlSnapshot,
      width,
      height,
      // The rejected row's own export, reused as-is — nothing re-renders.
      exportKey: row.exportUrl as string,
      adoptRejectedRevisionId: row.id,
    })
    return NextResponse.json({
      reply: 'Design updated',
      revisionId,
      exportUrl: await resolveExportUrl(exportKey),
    })
  } catch (err) {
    if (err instanceof AdoptConflictError) {
      return NextResponse.json({ error: 'This render can no longer be adopted' }, { status: 409 })
    }
    throw err
  }
})
