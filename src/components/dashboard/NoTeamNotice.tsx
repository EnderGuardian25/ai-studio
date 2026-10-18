import Link from 'next/link'
import { Users } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'

// The dashboard for a signed-in user who resolves to no team (016 FR-09). A
// fresh system has no team at all (016 FR-08), so the super admin is the one
// who creates the first: they get a link to /admin/teams. Everyone else is
// told to ask a super admin, as before.
export function NoTeamNotice({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  return (
    <Panel className="mx-auto mt-12 max-w-md p-8 text-center">
      <Users size={28} strokeWidth={1.4} className="mx-auto mb-3 text-fg-muted" />
      {isSuperAdmin ? (
        <>
          <h2 className="text-ui-lg font-medium text-fg">No teams yet</h2>
          <p className="mt-2 text-ui-sm text-fg-muted">
            Create the first team, then add yourself and others to it to start creating posts.
          </p>
          {/* Folio's primary button (§8.2), drawn on a link. */}
          <Link
            href="/admin/teams"
            className="mt-5 inline-flex h-control-md items-center justify-center gap-2 whitespace-nowrap rounded-ui-md border border-accent bg-accent px-5 text-ui-sm font-semibold text-accent-fg transition-[box-shadow] duration-fast ease-standard hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            Create a team
          </Link>
        </>
      ) : (
        <>
          <h2 className="text-ui-lg font-medium text-fg">
            You&rsquo;re not in a team yet
          </h2>
          <p className="mt-2 text-ui-sm text-fg-muted">
            Ask a super admin to add you to a team before you can create or view posts.
          </p>
        </>
      )}
    </Panel>
  )
}
