'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Button } from '@/components/ui/Button'
import { inputClasses, fieldEdge } from '@/components/ui/Input'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { QueryError } from '@/components/ui/QueryError'
import { PageHead } from '@/components/ui/PageHead'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { PostCard } from '@/components/library/PostCard'
import { PublishDialog } from '@/components/library/PublishDialog'
import { PublishHistoryDrawer } from '@/components/library/PublishHistoryDrawer'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import type { DraftRecord, PostRecord, LibraryResponse } from '@/lib/api-types'

// ── Types ─────────────────────────────────────────────────────────────────────

type StatusFilter = 'ALL' | 'READY' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED'

// Flatten brandKitName from the brief's campaign for PostCard
function toBriefCardProps(draft: DraftRecord) {
  const brandKitName = draft.brief.campaign?.brandKit?.name ?? null
  return { ...draft, brandKitName }
}

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Ready', value: 'READY' },
  { label: 'Scheduled', value: 'SCHEDULED' },
  { label: 'Published', value: 'PUBLISHED' },
  { label: 'Failed', value: 'FAILED' },
]

const PAGE_SIZE = 20

// ── Skeleton loader ───────────────────────────────────────────────────────────

// The shape of a library tile (PostCard): a thumbnail, a title, a meta line
// and the action row. No card box (DESIGN_SYSTEM.md §8.12).
function SkeletonCard() {
  return (
    <div className="flex flex-col animate-pulse">
      <div className="aspect-square w-full bg-surface outline outline-1 outline-offset-[3px] outline-line-subtle" />
      <div className="pt-4 flex flex-col gap-2">
        <div className="h-4 rounded-ui-sm bg-line-subtle w-3/4" />
        <div className="h-3 rounded-ui-sm bg-line-subtle w-1/2" />
        <div className="h-[30px] rounded-ui-md bg-line-subtle w-1/2 mt-1" />
      </div>
    </div>
  )
}

// Tiles: a contact sheet with room between frames for the 3 px outline offset.
const GRID = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10'

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [activeStatus, setActiveStatus] = useState<StatusFilter>('ALL')
  const [searchInput, setSearchInput] = useState('')
  const searchId = React.useId()
  const [search, setSearch] = useState('')
  const { isTeamAdmin } = useCurrentUser()

  const [selectedDraft, setSelectedDraft] = useState<{
    id: string
    posts: PostRecord[]
  } | null>(null)
  const [showPublishDialog, setShowPublishDialog] = useState<{
    draftId: string
    exportUrl: string
  } | null>(null)

  // Debounce search input
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput])

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['library', activeStatus, search],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        pageSize: String(PAGE_SIZE),
        status: activeStatus,
        ...(search ? { search } : {}),
      })
      return apiFetch<LibraryResponse>(`/api/library?${params}`)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      allPages.length * PAGE_SIZE < lastPage.total ? allPages.length + 1 : undefined,
  })

  const drafts = data?.pages.flatMap((p) => p.drafts) ?? []

  function invalidateLibrary() {
    return queryClient.invalidateQueries({ queryKey: ['library'] })
  }

  async function handleRetry(postId: string) {
    await apiFetch(`/api/posts/${postId}/publish`, { method: 'POST' })
    invalidateLibrary()
  }

  async function handleDelete(draftId: string) {
    const ok = await confirm({
      title: 'Delete this post?',
      description:
        'This permanently removes the draft, its revisions, its publish history (any scheduled publish is cancelled), and its brief. This cannot be undone.',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await apiFetch(`/api/drafts/${draftId}`, { method: 'DELETE' })
      toast.success('Post deleted')
      invalidateLibrary()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <>
      {/* Page header */}
      <PageHead
        eyebrow="Posts"
        title="Library"
        lead="All exported drafts and published posts."
        className="mb-8"
        actionsClassName="min-w-0"
        actions={
          // The label sits above the icon's relative box, so the icon stays
          // centred on the field (014 FR-12 row 3).
          <div className="flex w-full flex-col gap-1.5 sm:w-72">
            <FieldLabel htmlFor={searchId}>Search by topic</FieldLabel>
            <div className="relative">
              <Search
                size={15}
                strokeWidth={1.4}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none"
              />
              <input
                id={searchId}
                type="search"
                placeholder="Search by topic…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className={cn(inputClasses, fieldEdge(), 'pl-10')}
              />
            </div>
          </div>
        }
      />

      {/* Status tabs, over the 2 px --fg rule that opens the sheet */}
      <div className="pb-4 mb-8 border-b-2 border-fg">
        <SegmentedToggle
          options={STATUS_TABS.map(({ label, value }) => ({ value, label }))}
          value={activeStatus}
          onChange={(v) => setActiveStatus(v as StatusFilter)}
          label="Filter by status"
        />
      </div>

      {/* Grid */}
      {isPending ? (
        <div className={GRID}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : isError ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : drafts.length === 0 ? (
        <p className="py-12 text-center text-ui-sm text-fg-muted">No posts found.</p>
      ) : (
        <>
          <div className={GRID}>
            {drafts.map((draft) => (
              <PostCard
                key={draft.id}
                draft={toBriefCardProps(draft)}
                isTeamAdmin={isTeamAdmin}
                onPublish={(draftId, exportUrl) =>
                  setShowPublishDialog({ draftId, exportUrl })
                }
                onViewHistory={(draftId, posts) =>
                  setSelectedDraft({ id: draftId, posts: posts as PostRecord[] })
                }
                onDelete={handleDelete}
              />
            ))}
          </div>

          {/* Load more */}
          {hasNextPage && (
            <div className="mt-10 flex justify-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Publish dialog */}
      {showPublishDialog && (
        <PublishDialog
          draftId={showPublishDialog.draftId}
          onClose={() => setShowPublishDialog(null)}
          onSuccess={() => {
            setShowPublishDialog(null)
            invalidateLibrary()
          }}
        />
      )}

      {/* Publish history drawer */}
      <PublishHistoryDrawer
        draftId={selectedDraft?.id ?? null}
        posts={selectedDraft?.posts ?? []}
        isTeamAdmin={isTeamAdmin}
        onClose={() => setSelectedDraft(null)}
        onRetry={handleRetry}
      />
    </>
  )
}
