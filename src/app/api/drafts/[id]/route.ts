import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { DraftAction, DraftStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, withTeamAdmin, parseBody } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { resolveExportUrl } from '@/lib/storage/minio'
import { planDraftRecovery, STUCK_ACTION_REASON, STUCK_REASON } from '@/lib/drafts/recovery'
import { COMMITTED_REVISION, resolveNotAppliedOutcome } from '@/lib/drafts/revisions'
import { backgroundSkippedFor } from '@/lib/drafts/backgroundNotice'
import { parseCaptionPatch } from '@/lib/captions/requests'
import { validateHeadline } from '@/lib/captions/headline'
import { loadDraftCaptions, saveCaptionEdit, saveHeadlineEdit, settlePendingCaptions } from '@/lib/captions/store'
import { copyProviderIsClaude } from '@/providers/registry'

type Params = { id: string }

// The fields recoverIfStuck reads and writes. Structurally satisfies the pure
// planner's RecoverableDraft, but with the Prisma enum types the writes need.
interface DraftRecoveryRow {
  id: string
  status: DraftStatus
  failureReason: string | null
  pendingAction: DraftAction | null
  pendingActionError: string | null
  updatedAt: Date
}

// Applies the recovery plan (decided purely in lib/drafts/recovery.ts) and
// returns the EFFECTIVE status/reason + pending-action fields, so the response
// reflects the recovery immediately with no extra round-trip. Every write guards
// on the value that was observed, so a concurrent transition always wins. No
// branch here touches draft CONTENT — only status/reason bookkeeping.
async function recoverIfStuck(draft: DraftRecoveryRow): Promise<{
  status: DraftStatus
  failureReason: string | null
  pendingAction: DraftAction | null
  pendingActionError: string | null
}> {
  const { id, status, pendingAction } = draft
  const plan = planDraftRecovery(draft)
  const effective = {
    status,
    failureReason: draft.failureReason,
    pendingAction,
    pendingActionError: draft.pendingActionError,
  }

  // Caption rows the swept run left PENDING settle as a failed write, keeping
  // any text they had (012 FR-11). Done BEFORE the run is failed or its claim
  // cleared: until then no new run can mark rows PENDING, so only the swept
  // run's rows are settled.
  if (plan.settlePendingCaptions) {
    await settlePendingCaptions(id, plan.failStuckGeneration ? STUCK_REASON : STUCK_ACTION_REASON).catch(() => {
      /* best-effort recovery */
    })
  }

  // A draft stranded IN_PROGRESS by an interrupted run (e.g. a server restart)
  // → FAILED, so the preview page shows the inline error card + Retry instead of
  // an eternal skeleton.
  if (plan.failStuckGeneration) {
    await prisma.draft
      .updateMany({
        where: { id, status: 'IN_PROGRESS' },
        data: { status: 'FAILED', failureReason: STUCK_REASON },
      })
      .catch(() => {
        /* best-effort recovery */
      })
    effective.status = 'FAILED'
    effective.failureReason = STUCK_REASON
  }

  if (plan.clearStuckAction) {
    await prisma.draft
      .updateMany({
        where: { id, pendingAction },
        data: { pendingAction: null, pendingActionError: STUCK_ACTION_REASON },
      })
      .catch(() => {
        /* best-effort recovery */
      })
    effective.pendingAction = null
    effective.pendingActionError = STUCK_ACTION_REASON
  }

  return effective
}

async function loadDraft(id: string) {
  const draft = await prisma.draft.findUnique({
    where: { id },
    include: {
      brief: true,
      posts: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          channel: true,
          status: true,
          scheduledAt: true,
          publishedAt: true,
        },
      },
      // revisionCount counts the chain only — rejected refine renders are not
      // versions (change 004 FR-13).
      _count: { select: { revisions: { where: COMMITTED_REVISION } } },
    },
  })
  if (!draft) return null

  // Sweep one stranded IN_PROGRESS by an interrupted run → FAILED, and clear a
  // stale in-flight action, so the effective fields below reflect the recovery.
  const effective = await recoverIfStuck(draft)

  // The one caption reader (012 FR-13), after the sweep, so a row it just
  // settled reads settled.
  const captions = await loadDraftCaptions(id)

  // Surface a refine brand-kit conflict to the poll WITHOUT the stored
  // pendingHtml — it can be huge and is server-side only (the Override path
  // reads it from the DB).
  const pendingConflict = draft.pendingConflict as unknown as {
    conflictId: string
    explanation: string
  } | null

  // Three independent reads, run together (018 FR-04: this GET is the 4 s poll).
  const [kit, notApplied, captionProviderIsClaude] = await Promise.all([
    resolveBrandKit(draft.teamId, draft.brief.campaignId ?? undefined, draft.brief.brandKitId ?? undefined),
    // FR-14/AC-18: a twice-failed refine is a distinct outcome, not the
    // existing error channel — re-derived from the retained rejected row on
    // every poll (Ruling E), never trusted off the stored FK alone.
    resolveNotAppliedOutcome(draft),
    // 008 FR-20: the caption pickers hide when this draft's own caption
    // provider isn't Claude — the same lookup regenerate-copy refuses a pick on
    // (the brief's key, else the team default), not GET /api/models' team
    // default. It selects the provider name only.
    copyProviderIsClaude(draft.brief.teamId, draft.brief.copyProviderKey ?? undefined),
  ])

  return {
    ownerId: draft.brief.userId,
    teamId: draft.teamId,
    campaignId: draft.brief.campaignId,
    data: {
    id: draft.id,
    briefId: draft.briefId,
    headline: draft.headline,
    // 008 FR-16: the stamps (additive; captions[] carry their own).
    headlineModel: draft.headlineModel,
    headlineModelSubstitutedFrom: draft.headlineModelSubstitutedFrom,
    designModel: draft.designModel,
    designModelSubstitutedFrom: draft.designModelSubstitutedFrom,
    captions: captions?.captions ?? [],
    captionProviderIsClaude,
    imageUrl: draft.imageUrl,
    htmlContent: draft.htmlContent,
    // exportUrl is stored as an EXPORTS object key — sign it for the browser.
    exportUrl: await resolveExportUrl(draft.exportUrl),
    status: effective.status,
    failureReason: effective.failureReason,
    pendingAction: effective.pendingAction,
    pendingActionError: effective.pendingActionError,
    conflict: pendingConflict
      ? { conflictId: pendingConflict.conflictId, explanation: pendingConflict.explanation }
      : null,
    notApplied,
    // 005 FR-07: why there is no AI background, when that was not the
    // model's choice. The message is a fixed per-reason sentence.
    backgroundSkipped: backgroundSkippedFor(draft.backgroundSkipReason, draft.backgroundSkipDetail),
    createdAt: draft.createdAt,
    revisionCount: draft._count.revisions,
    currentRevisionNumber: draft.currentRevisionNumber,
    brandKitName: kit?.name ?? null,
    brief: {
      id: draft.brief.id,
      topic: draft.brief.topic,
      goal: draft.brief.goal,
      tone: draft.brief.tone,
      channels: draft.brief.channels,
      aspectRatio: draft.brief.aspectRatio,
      designMode: draft.brief.designMode,
    },
    posts: draft.posts,
    },
  }
}

export const GET = withTeamAuth<Params>(async (_req, { params }, user) => {
  const result = await loadDraft(params.id)
  if (
    !result ||
    !canAccessContent(user, { teamId: result.teamId, ownerId: result.ownerId, campaignId: result.campaignId })
  ) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  return NextResponse.json(result.data)
})

// Team tenancy fix: this handler used to run under plain withAuth + the
// old ownership helper (a platform-role-only check with no team dimension —
// it let any admin/super-admin bypass ownership entirely), so an admin of
// ANY team could edit ANY other team's draft copy. Task 8/9's sweeps
// covered this file's GET and DELETE but missed PATCH. Now withTeamAuth +
// canAccessContent, matching the GET handler above (the old helper,
// forbiddenIfNotOwner, has since been deleted from src/lib/auth.ts — this
// was its last real caller).
//
// 012 FR-12: the body is exactly one of { channel, text } (one caption,
// stored as typed) or { headline } (validated). A legacy { copyText } is 400.
export const PATCH = withTeamAuth<Params>(async (req, { params }, user) => {
  const body = await parseBody(req, z.unknown())
  if (body.response) return body.response
  const patch = parseCaptionPatch(body.data)
  if (!patch.ok) return NextResponse.json({ error: patch.error }, { status: 400 })

  const existing = await prisma.draft.findUnique({
    where: { id: params.id },
    select: { status: true, pendingAction: true, teamId: true, brief: { select: { userId: true, campaignId: true } } },
  })
  if (
    !existing ||
    !canAccessContent(user, { teamId: existing.teamId, ownerId: existing.brief.userId, campaignId: existing.brief.campaignId })
  ) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  // The published captions live only on the draft — editing them after publish
  // would silently desynchronize the record from what was actually posted.
  if (existing.status === 'PUBLISHED') {
    return NextResponse.json(
      { error: 'This draft has been published — its captions can no longer be edited' },
      { status: 409 }
    )
  }

  const beingGenerated = () => NextResponse.json({ error: 'This caption is being generated' }, { status: 409 })
  if ('headline' in patch.value) {
    const headline = validateHeadline(patch.value.headline)
    if (!headline.ok) {
      return NextResponse.json({ error: `The headline was not saved (${headline.reason})` }, { status: 400 })
    }
    // Refused while anything may be writing the headline — a caption action,
    // or a generation (IN_PROGRESS, retry included) — so neither overwrites
    // the other.
    if (
      existing.pendingAction === 'REGENERATE_COPY' ||
      existing.status === 'IN_PROGRESS' ||
      !(await saveHeadlineEdit(params.id, headline.text))
    ) {
      return beingGenerated()
    }
  } else {
    // Load first, so every registry channel has its row; a PENDING row is
    // being written and is refused.
    const { channel, text } = patch.value
    const loaded = await loadDraftCaptions(params.id)
    const row = loaded?.captions.find((c) => c.channel === channel)
    if (!row || row.status === 'PENDING' || !(await saveCaptionEdit(params.id, channel, text))) {
      return beingGenerated()
    }
  }

  // Captions and design are independent artifacts — a caption is what is
  // posted, the export is the rendered image — so a caption edit must NOT
  // touch Draft.status (TC-ASYNC-10). The pre-012 copy edit used to flip
  // EXPORTED → IN_PROGRESS to signal "the export is stale", but IN_PROGRESS
  // means "generation is running", and every consumer read it that way: the
  // draft dropped out of the library (it filters on EXPORTED), Refine design
  // and Edit inline vanished, Regenerate answered 409 'Draft is not ready', a
  // cleared caption left the page stuck on an eternal skeleton with no way
  // back, and after 15 minutes the lazy sweep marked the draft FAILED. Nothing
  // was regenerating, so the only escape was to regenerate the whole post.
  // regenerate-copy leaves status alone too (§Q TC-ASYNC-02). A "your export
  // predates this caption" nudge belongs in the UI, not in the status field.
  // Editing the headline does not re-render the design either.

  const result = await loadDraft(params.id)
  return NextResponse.json(result?.data)
})

// Admin-only hard delete: removes the draft with its publish history (Post rows —
// a SCHEDULED post is thereby cancelled), revisions, and the parent Brief when no
// other draft references it. No cascades exist on these relations, so children
// are deleted first, all in one transaction — except the caption rows
// (DraftCaption), which cascade with the draft (012 D11).
export const DELETE = withTeamAdmin<Params>(async (_req, { params }, user) => {
  const draft = await prisma.draft.findUnique({
    where: { id: params.id },
    select: { id: true, briefId: true, teamId: true },
  })
  if (!draft || draft.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  const briefDeleted = await prisma.$transaction(async (tx) => {
    await tx.post.deleteMany({ where: { draftId: draft.id } })
    // Deliberately UNFILTERED: a hard delete removes every revision row,
    // rejected refine renders included (the FK would otherwise block the draft
    // delete). Draft.notAppliedRevisionId is ON DELETE SET NULL, so removing the
    // rejected row it references first is safe.
    await tx.draftRevision.deleteMany({ where: { draftId: draft.id } })
    await tx.draft.delete({ where: { id: draft.id } })

    // Sweep the brief only when it has become an orphan (the schema allows
    // multiple drafts per brief, so count before deleting).
    const remaining = await tx.draft.count({ where: { briefId: draft.briefId } })
    if (remaining === 0) {
      await tx.brief.delete({ where: { id: draft.briefId } })
      return true
    }
    return false
  })

  return NextResponse.json({ deleted: true, briefDeleted })
})
