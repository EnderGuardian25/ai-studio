'use client'

import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { QueryError } from '@/components/ui/QueryError'
import { apiFetch } from '@/lib/apiFetch'
import type { AdminBrandKitSummary, AdminBrandKitDetail } from '@/lib/api-types'
import { AddKitModal } from '@/components/admin/brandkits/AddKitModal'
import { KitDetail } from '@/components/admin/brandkits/KitDetail'
import { ColorSwatch } from '@/components/admin/brandkits/shared'
import { EYEBROW, FOCUS, ICON, ICON_BUTTON, PAGE_LEAD, PAGE_TITLE, rowCls } from '@/components/admin/brandkits/folio'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BrandKitsPage() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const kitsQuery = useQuery({
    queryKey: ['admin-brandkits'],
    queryFn: () => apiFetch<AdminBrandKitSummary[]>('/api/admin/brandkits'),
  })

  const selectedKitQuery = useQuery({
    queryKey: ['admin-brandkits', selectedId],
    queryFn: () => apiFetch<AdminBrandKitDetail>(`/api/admin/brandkits/${selectedId}`),
    enabled: !!selectedId,
  })

  const kits = kitsQuery.data ?? []
  const selectedKit = selectedId ? selectedKitQuery.data ?? null : null
  const loading = kitsQuery.isLoading

  function invalidateKits() {
    return queryClient.invalidateQueries({ queryKey: ['admin-brandkits'] })
  }

  function handleCreated(id: string) {
    setAdding(false)
    invalidateKits().then(() => setSelectedId(id))
  }

  function handleRefresh() {
    invalidateKits()
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: 'Delete this brand kit?', confirmLabel: 'Delete' }))) return
    try {
      await apiFetch(`/api/admin/brandkits/${id}`, { method: 'DELETE' })
      if (selectedId === id) setSelectedId(null)
      invalidateKits()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  return (
    <>
      {adding && <AddKitModal onClose={() => setAdding(false)} onCreated={handleCreated} />}

      {/* Page head (DESIGN_SYSTEM.md §6): an eyebrow, the display title, a lead. */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className={EYEBROW}>Admin</div>
          <h1 className={`mt-2 ${PAGE_TITLE}`}>Brand Kits</h1>
          <p className={PAGE_LEAD}>
            Manage brand identities, templates, and voice prompts.
          </p>
        </div>
        {/* One accent primary per view: once a kit is open, its own Save is the
            contextual primary, and Add Kit shows as an Outline button. */}
        <div>
          <Button variant={selectedId ? 'secondary' : 'primary'} onClick={() => setAdding(true)}>
            <Plus {...ICON} /> Add Kit
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* The kit list: ruled rows under a 2 px --fg rule; the open kit is
            marked by a 2 px --accent bar, as the sidebar marks the current page. */}
        <div className="min-w-0 border-t-2 border-fg">
          {loading && (
            <div className="px-2 py-4 text-ui-sm text-fg-muted">Loading…</div>
          )}
          {!loading && kitsQuery.isError && (
            <div className="pt-4">
              <QueryError error={kitsQuery.error} onRetry={() => kitsQuery.refetch()} />
            </div>
          )}
          {!loading && !kitsQuery.isError && kits.length === 0 && (
            <div className="border-b border-line-subtle py-6 text-center">
              <p className="text-ui-sm text-fg-muted">No brand kits yet.</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAdding(true)}>
                <Plus {...ICON} /> Create one
              </Button>
            </div>
          )}
          {kits.length > 0 && (
            <ul>
              {kits.map(kit => {
                const selected = selectedId === kit.id
                return (
                  // Row select is a real button (keyboard reachable); the delete
                  // button sits beside it rather than nested inside (nested
                  // interactive elements are invalid HTML).
                  <li key={kit.id} className={rowCls(selected, 'flex items-center gap-1 pr-1')}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(kit.id)}
                      aria-current={selected ? 'true' : undefined}
                      className={`min-w-0 flex-1 cursor-pointer rounded-ui-sm py-3 pl-3 text-left ${FOCUS}`}
                    >
                      <span
                        className={`block truncate text-ui-sm ${selected ? 'font-semibold text-fg' : 'font-medium text-fg'}`}
                        title={kit.name}
                      >
                        {kit.name}
                      </span>
                      <span className="mt-1.5 flex items-center gap-1.5">
                        {kit.colors.slice(0, 5).map(c => <ColorSwatch key={c} color={c} />)}
                        {kit.isDefault && (
                          <span className="ml-1 text-ui-xs font-semibold text-accent">default</span>
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(kit.id)}
                      aria-label={`Delete brand kit ${kit.name}`}
                      title="Delete"
                      className={`${ICON_BUTTON} hover:text-status-failed ${FOCUS}`}
                    >
                      <Trash2 {...ICON} />
                    </button>
                    <ChevronRight
                      {...ICON}
                      aria-hidden="true"
                      className={`flex-shrink-0 text-fg-muted transition-transform duration-fast ease-standard ${selected ? 'rotate-90' : ''}`}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Detail */}
        <div className="min-w-0">
          {selectedKit ? (
            <KitDetail kit={selectedKit} onRefresh={handleRefresh} />
          ) : (
            <div className="border-t-2 border-fg py-12 text-center text-ui-sm text-fg-muted">
              Select a brand kit to view details
            </div>
          )}
        </div>
      </div>
    </>
  )
}
