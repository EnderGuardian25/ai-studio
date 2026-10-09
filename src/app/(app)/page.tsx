import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  FilePlus2,
  BookOpen,
  Palette,
  Users,
} from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { listBriefDrafts } from '@/lib/brief/briefDrafts'
import { resolveTeamForServerComponent } from '@/lib/authz/serverTeam'
import { draftVisibilityWhere, postVisibilityWhere } from '@/lib/authz/visibility'
import type { TeamAuthedUser } from '@/lib/api/handler'
import { Panel } from '@/components/ui/Panel'
import { PageHead } from '@/components/ui/PageHead'
import { EYEBROW, SECTION_HEAD } from '@/components/ui/folio'
import { RecentDraftsCard } from '@/components/dashboard/RecentDraftsCard'
import { channelLabel as sharedChannelLabel } from '@/lib/channels'
import { relativeTime } from '@/lib/format'

// Dashboard renders live data; never cache it.
export const dynamic = 'force-dynamic'

// ── Helpers ─────────────────────────────────────────────────────────────────

function channelLabel(channels: string[]): string {
  if (!channels?.length) return '—'
  return channels.map(sharedChannelLabel).join(', ')
}

// ── Data ────────────────────────────────────────────────────────────────────

async function getDashboardData(user: TeamAuthedUser) {
  const teamId = user.teamId
  const [
    draftsReady,
    postsPublished,
    activeCampaigns,
    aiProviders,
    recentDrafts,
    recentPublished,
    recentProviders,
  ] = await Promise.all([
    // KPI counts use the same D6 visibility as the library/posts listings —
    // a bare { teamId } count shows an editor team-wide numbers their own
    // list pages then contradict ("13 drafts ready", library shows 2).
    prisma.draft.count({ where: { ...draftVisibilityWhere(user), status: 'EXPORTED' } }),
    prisma.post.count({ where: { ...postVisibilityWhere(user), status: 'PUBLISHED' } }),
    prisma.campaign.count({ where: { isDeleted: false, teamId } }),
    prisma.availableProvider.count({ where: { isEnabled: true, teamId } }),
    // D6 visibility (fixes the prior leak: this used to show every team's
    // drafts to every signed-in user, no scoping at all).
    prisma.draft.findMany({
      where: draftVisibilityWhere(user),
      // 25, not 8: the Recent Drafts card shows 8 collapsed and the full list
      // when expanded (RecentDraftsCard) — one query serves both states.
      take: 25,
      orderBy: { createdAt: 'desc' },
      include: {
        brief: {
          select: {
            topic: true,
            designMode: true,
            channels: true,
            campaign: { select: { name: true } },
          },
        },
      },
    }),
    prisma.post.findMany({
      where: { ...postVisibilityWhere(user), status: 'PUBLISHED' },
      take: 5,
      orderBy: { publishedAt: 'desc' },
      include: { draft: { include: { brief: { select: { topic: true } } } } },
    }),
    // AvailableProvider is team-wide (no personal ownership concept).
    prisma.availableProvider.findMany({ where: { teamId }, take: 5, orderBy: { createdAt: 'desc' } }),
  ])

  // The viewer's own unfinished (autosaved) briefs, scoped to the active team
  // (a multi-team user's other-team drafts must not surface here — Resume
  // would otherwise dead-end on the briefs POST route's cross-team 404).
  // listBriefDrafts also runs the lazy 7-day TTL sweep.
  const unfinishedBriefs = await listBriefDrafts(user.userId, user.teamId)

  // Build a merged, chronological activity feed from the available signals.
  type Event = { id: string; at: Date; text: string; kind: 'draft' | 'post' | 'provider' }
  const events: Event[] = [
    ...recentDrafts.map(d => ({
      id: `draft-${d.id}`,
      at: d.createdAt,
      text: `Draft generated — “${d.brief?.topic ?? 'Untitled'}”`,
      kind: 'draft' as const,
    })),
    ...recentPublished.map(p => ({
      id: `post-${p.id}`,
      at: p.publishedAt ?? p.createdAt,
      text: `Published to ${channelLabel([p.channel])} — “${p.draft?.brief?.topic ?? 'Untitled'}”`,
      kind: 'post' as const,
    })),
    ...recentProviders.map(p => ({
      id: `prov-${p.id}`,
      at: p.createdAt,
      text: `${p.slot === 'COPY' ? 'Copy' : 'Image'} provider added — ${p.label}`,
      kind: 'provider' as const,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8)

  return {
    draftsReady,
    postsPublished,
    activeCampaigns,
    aiProviders,
    recentDrafts,
    unfinishedBriefs,
    events,
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

// A KPI: a small-caps label over a display numeral, on a ruled row (no box).
function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-b border-line-subtle py-4">
      <div className={EYEBROW}>{label}</div>
      <div className="mt-2 font-display text-ui-2xl font-normal leading-none tabular-nums [font-variation-settings:'opsz'_144]">
        {value}
      </div>
    </div>
  )
}

// A quick action: a link drawn as Folio's Outline button (§8.2). The floating
// Create post button is the view's one primary, so these stay outline.
function QuickAction({
  href,
  label,
  icon,
}: {
  href: string
  label: string
  icon: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-ui-md border border-line px-3.5 text-ui-sm font-semibold text-fg transition-[border-color] duration-fast ease-standard hover:border-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    >
      {icon}
      {label}
    </Link>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const resolution = await resolveTeamForServerComponent()

  if (resolution?.team.kind === 'choice-required') {
    redirect('/choose-team')
  }

  if (!resolution || resolution.team.kind === 'no-team') {
    return (
      <Panel className="mx-auto mt-12 max-w-md p-8 text-center">
        <Users size={28} strokeWidth={1.4} className="mx-auto mb-3 text-fg-muted" />
        <h2 className="font-display text-ui-lg font-medium text-fg">
          You&rsquo;re not in a team yet
        </h2>
        <p className="mt-2 text-ui-sm text-fg-muted">
          Ask a super admin to add you to a team before you can create or view posts.
        </p>
      </Panel>
    )
  }

  const teamUser: TeamAuthedUser = {
    userId: resolution.userId,
    teamId: resolution.team.teamId,
    teamRole: resolution.team.teamRole,
    isSuperAdmin: resolution.isSuperAdmin,
  }
  const data = await getDashboardData(teamUser)

  return (
    <>
      <PageHead
        eyebrow="Overview"
        title="Dashboard"
        lead="At-a-glance status across drafts, posts, and campaigns."
        className="mb-8"
      />

      {/* KPI summary: a 2 px --fg rule opens the block; ruled cells, no boxes */}
      <div className="grid grid-cols-2 gap-x-6 border-t-2 border-fg lg:grid-cols-4">
        <KpiCard label="Drafts Ready" value={data.draftsReady} />
        <KpiCard label="Posts Published" value={data.postsPublished} />
        <KpiCard label="Active Campaigns" value={data.activeCampaigns} />
        <KpiCard label="AI Providers" value={data.aiProviders} />
      </div>

      {/* Quick actions */}
      <div className="mt-6 flex flex-wrap gap-2">
        <QuickAction href="/brief" label="Create Post" icon={<FilePlus2 size={15} strokeWidth={1.4} />} />
        <QuickAction href="/library" label="View Library" icon={<BookOpen size={15} strokeWidth={1.4} />} />
        <QuickAction
          href="/admin/brandkits"
          label="Manage Brand Kits"
          icon={<Palette size={15} strokeWidth={1.4} />}
        />
      </div>

      <div className="mt-12 grid grid-cols-1 gap-x-12 gap-y-12 lg:grid-cols-3">
        {/* Recent drafts — collapsed 8 / expandable to the full fetched list */}
        <RecentDraftsCard
          className="min-w-0 lg:col-span-2"
          unfinished={data.unfinishedBriefs.map(u => ({
            id: u.id,
            topic: u.topic,
            updatedAtLabel: relativeTime(u.updatedAt),
          }))}
          drafts={data.recentDrafts.map(d => ({
            id: d.id,
            status: d.status,
            createdAtLabel: relativeTime(d.createdAt),
            brief: d.brief
              ? {
                  topic: d.brief.topic,
                  designMode: d.brief.designMode,
                  channels: d.brief.channels,
                  campaign: d.brief.campaign,
                }
              : null,
          }))}
        />

        {/* Activity feed */}
        <div className="min-w-0">
          <h2 className={`${SECTION_HEAD} pb-2.5`}>Activity</h2>

          {data.events.length === 0 ? (
            <p className="border-t-2 border-fg py-8 text-center text-ui-sm text-fg-muted">
              No recent activity.
            </p>
          ) : (
            <ul className="border-t-2 border-fg">
              {data.events.map(e => (
                <li key={e.id} className="min-w-0 border-b border-line-subtle py-2.5">
                  <p className="truncate text-ui-sm text-fg">{e.text}</p>
                  <p className="text-ui-xs text-fg-muted">{relativeTime(e.at)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
