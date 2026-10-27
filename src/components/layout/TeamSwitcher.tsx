'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { cn } from '@/lib/utils'

// Sits above the nav sections in the sidebar. Most users belong to exactly
// one team — a static label costs nothing and avoids a pointless dropdown.
// Multi-team users (currently only super admins, who see every team) get a
// Radix dropdown to switch the active-team cookie without leaving the page.
export function TeamSwitcher() {
  const { teams, activeTeamId, teamRole, isSuperAdmin } = useCurrentUser()
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const [switching, setSwitching] = useState(false)

  if (teams.length === 0) return null

  // activeTeamId is null while a choice is still required (parked on
  // /choose-team) — don't imply teams[0] is active in that state, show a
  // neutral label instead.
  const activeTeam = teams.find(t => t.id === activeTeamId) ?? null
  const label = activeTeam?.name ?? 'Choose a team'

  async function selectTeam(teamId: string) {
    if (teamId === activeTeamId || switching) return
    setSwitching(true)
    try {
      await apiFetch('/api/me/active-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      })
      // No key = invalidate everything: every team-scoped query in the app
      // needs to refetch under the newly active team. Awaited so the
      // ['me'] cache (and its teamChoiceRequired) is fresh before we
      // navigate — otherwise AppShell's redirect effect can read the
      // pre-switch value for a tick and bounce right back to /choose-team.
      await queryClient.invalidateQueries()
      // Switching from the chooser doesn't otherwise navigate anywhere —
      // land on the dashboard instead of leaving the user parked there.
      if (pathname === '/choose-team') {
        router.push('/')
      } else {
        router.refresh()
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to switch team')
    } finally {
      setSwitching(false)
    }
  }


  // Folio (DESIGN_SYSTEM.md §8.6): the team name in the display face over the
  // viewer's role, with a 1 px --line-subtle rule beneath. No icon on the
  // static label; the switcher shows an up-down icon.
  const roleLabel = !activeTeam
    ? null
    : isSuperAdmin
      ? 'Super admin'
      : teamRole === 'ADMIN'
        ? 'Team admin'
        : teamRole === 'EDITOR'
          ? 'Editor'
          : null
  const block = 'mx-5 mb-[22px] pb-4 border-b border-line-subtle font-text text-fg'
  const name = (
    <span className="min-w-0">
      <span className="block truncate font-display text-ui-base font-medium leading-tight [font-variation-settings:'opsz'_24]">
        {label}
      </span>
      {roleLabel && <span className="block text-ui-xs text-fg-muted">{roleLabel}</span>}
    </span>
  )

  if (teams.length === 1) {
    return <div className={block}>{name}</div>
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={switching}
          aria-label="Switch team"
          className={cn(
            block,
            'grid w-[calc(100%-40px)] grid-cols-[1fr_auto] items-end gap-2 text-left',
            'rounded-ui-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {name}
          <ChevronsUpDown size={15} strokeWidth={1.4} aria-hidden="true" className="mb-0.5 text-fg-muted" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        {/* .surface-raised: opaque menu (FR-08) with the §8.7 item styles;
            under reduced motion globals.css swaps the drop for a 150 ms fade. */}
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="surface-raised z-50 min-w-56 max-w-72 py-1.5 animate-drop"
        >
          {teams.map(team => (
            <DropdownMenu.Item
              key={team.id}
              onSelect={() => selectTeam(team.id)}
              className={cn(
                'flex items-center gap-2.5 px-3.5 py-[7px] cursor-pointer outline-none',
                'font-text text-ui-sm text-fg',
                'data-[highlighted]:bg-canvas',
              )}
            >
              <Check
                size={15}
                strokeWidth={1.4}
                aria-hidden="true"
                className={cn('flex-shrink-0 text-accent', team.id === activeTeamId ? 'opacity-100' : 'opacity-0')}
              />
              <span className="truncate">{team.name}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
