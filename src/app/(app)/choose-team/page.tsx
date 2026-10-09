'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { cn } from '@/lib/utils'
import { PageTitle } from '@/components/ui/PageHead'
import { FOCUS } from '@/components/ui/folio'

// Reached when /api/me reports teamChoiceRequired (AppShell redirects here).
// Deliberately fires no team-scoped query itself — useCurrentUser()'s /api/me
// call is plain withAuth and works pre-choice; every other route 409s with
// team-choice-required until a team is picked here.
export default function ChooseTeamPage() {
  const { teams } = useCurrentUser()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [pickingId, setPickingId] = useState<string | null>(null)

  async function pick(teamId: string) {
    if (pickingId) return
    setPickingId(teamId)
    try {
      await apiFetch('/api/me/active-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      })
      // Must land before the push: AppShell persists across this client nav
      // and its useCurrentUser() cache still holds the stale
      // teamChoiceRequired:true from before the pick — without this await,
      // the redirect effect sees that stale state on arrival at "/" and
      // bounces straight back here. Invalidating (and letting the refetch
      // resolve) first means the effect reads fresh data post-navigation.
      await queryClient.invalidateQueries()
      router.push('/')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to switch team')
    } finally {
      setPickingId(null)
    }
  }

  // Folio (DESIGN_SYSTEM.md §6): a display title and a muted line, then the
  // teams as ruled rows under a 2 px --fg rule, not cards. Each row is a
  // button named by its team (plus "Switching…" while it is picked).
  return (
    <div className="mx-auto w-full max-w-md py-6 md:py-12 font-text text-fg">
      <PageTitle>Choose a team</PageTitle>
      <p className="mt-3 text-ui-base text-fg-muted">
        Pick which team you want to work in. You can switch again later from the sidebar.
      </p>

      {teams.length === 0 ? (
        <p className="mt-8 pt-6 border-t-2 border-fg text-ui-sm text-fg-muted">
          You aren&apos;t a member of any team yet — ask a super admin to add you to one.
        </p>
      ) : (
        <ul className="mt-8 border-t-2 border-fg">
          {teams.map(team => (
            <li key={team.id} className="border-b border-line-subtle">
              <button
                type="button"
                onClick={() => pick(team.id)}
                disabled={pickingId !== null}
                className={cn(
                  'group flex w-full items-center gap-3 px-1 py-3.5 text-left',
                  'transition-colors duration-fast ease-standard hover:bg-surface',
                  FOCUS,
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                <span className="truncate flex-1 font-display text-ui-lg font-medium">{team.name}</span>
                {pickingId === team.id ? (
                  <span className="text-ui-xs text-fg-muted">Switching…</span>
                ) : (
                  <ArrowRight
                    size={15}
                    strokeWidth={1.4}
                    aria-hidden="true"
                    className="flex-shrink-0 text-fg-muted group-hover:text-fg"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
