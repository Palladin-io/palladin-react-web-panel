import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { ErrorState } from '../../../shared/components/error-state'
import { FormSelect } from '../../../shared/components/form-select'
import { Icon } from '../../../shared/components/icon'
import { LoadMoreSentinel } from '../../../shared/components/load-more-sentinel'
import { HOVERABLE_CARD_CLASSES } from '../../../shared/lib/styles'
import { shortenKey } from '../../../shared/lib/shorten-key'
import type { Vault } from '../types'
import { usePersistedEntriesList } from '../use-entries-list-ui'
import {
  useMemberEntryList,
  type MemberEntryListItem,
  type MemberEntrySort,
} from '../sync/member-entry-list'
import { useMemberSyncStore } from '../sync/member-sync-store'
import { CreateEntryModal } from './create-entry-modal'
import { EntryRow } from './entry-row'
import { ScrollArea } from '../../../shared/components/scroll-area'
import { SearchBar } from '../../../shared/components/search-bar'
import { EntryIcon } from './entry-icon'
import { useRestoreArchivedEntries } from '../use-restore-archived-entries'
import { useDestroyEntry, useRecentlyDeletedEntries } from '../use-recently-deleted-entries'
import { DestroyEntryDialog } from './destroy-entry-dialog'

export interface VaultEntriesTabProps {
  vault: Vault
}

/**
 * Entries tab body — search + list of entries (or an empty state if the
 * vault is fresh). Tab actions in the page header (Import / Add Entry) live
 * in `vault-detail-page.tsx`; the tab body still owns its own "Add your first
 * entry" CTA inside the empty state for discoverability when there are zero rows.
 */
export function VaultEntriesTab({ vault }: VaultEntriesTabProps) {
  const { t } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)
  const [sort, setSort] = useState<MemberEntrySort>('name-asc')
  const [selectedArchived, setSelectedArchived] = useState<Set<string>>(new Set())
  const [destroyCandidate, setDestroyCandidate] = useState<MemberEntryListItem | null>(null)
  const restore = useRestoreArchivedEntries(vault.id)
  const destroy = useDestroyEntry(vault.id)

  const hasMemberProjection = useMemberSyncStore((store) => store.vaults.has(vault.id))
  // Persist list context per vault so it survives navigating into an entry.
  const {
    search,
    setSearch,
    scrollRef,
    onScroll,
    lifecycleState,
    setLifecycleState,
  } = usePersistedEntriesList(vault.id, hasMemberProjection)
  const entries = useMemberEntryList(vault.id, lifecycleState, search, sort)
  const recentlyDeleted = useRecentlyDeletedEntries(vault.id, lifecycleState === 'deleted')
  const deletedMetadata = new Map(
    recentlyDeleted.data?.pages.flatMap((page) => page.items).map((item) => [item.id, item]) ?? [],
  )
  const localDeletedById = new Map(entries.items.map((entry) => [entry.id, entry]))
  const visibleEntries = lifecycleState === 'deleted'
    ? [...deletedMetadata.keys()].flatMap((entryId): MemberEntryListItem[] => {
        const local = localDeletedById.get(entryId)
        if (local) return [local]
        // A missing or unauthenticated local projection must not hide an
        // authoritative retained row. Show only a shortened opaque identifier.
        return search ? [] : [{ id: entryId, state: 'deleted', label: shortenKey(entryId), type: 1,
          icon: null, searchFields: [], currentRevision: '0', corrupt: true }]
      })
    : entries.items
  const restorableArchived = entries.items.filter((entry) => entry.state === 'archived' && !entry.corrupt)

  const restoreEntries = async (entryIds: string[]) => {
    try {
      const result = await restore.mutateAsync(entryIds)
      setSelectedArchived((current) => new Set([...current].filter((id) => !result.restored.includes(id))))
      if (result.restored.length > 0) toast.success(t('vault.entries.restoreSuccess', { count: result.restored.length }))
      if (result.failed.length > 0) toast.error(t('vault.entries.restoreFailed', { count: result.failed.length }))
    } catch {
      toast.error(t('vault.entries.restoreFailed', { count: entryIds.length }))
    }
  }

  const destroyEntry = async () => {
    if (!destroyCandidate) return
    try {
      await destroy.mutateAsync(destroyCandidate.id)
      toast.success(t('vault.entries.destroySuccess'))
      setDestroyCandidate(null)
    } catch {
      toast.error(t('vault.entries.destroyFailed'))
    }
  }

  if ((entries.status === 'idle' || entries.status === 'syncing') && entries.vaultStatus === null) {
    return <EntriesLoadingSkeleton />
  }

  const totalCount = entries.counts.active + entries.counts.archived + entries.counts.deleted
  const selectedVaultHasError = entries.vaultStatus === null
    ? entries.status === 'error'
    : entries.vaultStatus === 'error'
  if (selectedVaultHasError && totalCount === 0) {
    return <ErrorState message={t('vault.entries.syncError')} onRetry={entries.retry} />
  }

  if (totalCount === 0) {
    return (
      <>
        <EntriesEmptyState onAdd={() => setCreateOpen(true)} />
        <CreateEntryModal
          open={createOpen}
          vault={vault}
          onClose={() => setCreateOpen(false)}
        />
      </>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {selectedVaultHasError ? (
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3 rounded-xl border border-[rgb(var(--cv-primary-rgb)/0.25)] bg-[rgb(var(--cv-primary-rgb)/0.06)] px-3 py-2 text-meta text-[var(--cv-t2)]">
          <span>{t('vault.entries.partialSyncError')}</span>
          <Button variant="ghost" size="sm" onClick={entries.retry}>{t('vault.list.retry')}</Button>
        </div>
      ) : null}
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder={t('vault.detail.entriesSearchPlaceholder')}
        className="mb-3 shrink-0"
      />

      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('vault.entries.lifecycleFilter')}>
          {(['active', 'archived', 'deleted'] as const).map((value) => (
            <Button
              key={value}
              variant={lifecycleState === value ? 'subtle' : 'outline'}
              size="sm"
              aria-pressed={lifecycleState === value}
              onClick={() => {
                setSelectedArchived(new Set())
                setLifecycleState(value)
              }}
            >
              {t(`vault.entries.state.${value}`)} ({entries.counts[value]})
            </Button>
          ))}
        </div>
        <FormSelect
          id="vault-entry-sort"
          value={sort}
          onChange={(event) => setSort(event.target.value as MemberEntrySort)}
          aria-label={t('vault.entries.sort.label')}
        >
          <option value="name-asc">{t('vault.entries.sort.nameAsc')}</option>
          <option value="name-desc">{t('vault.entries.sort.nameDesc')}</option>
          <option value="type">{t('vault.entries.sort.type')}</option>
        </FormSelect>
      </div>

      {lifecycleState === 'archived' && restorableArchived.length > 0 ? (
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3 rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] px-3 py-2">
          <label className="flex items-center gap-2 text-ui text-[var(--cv-t2)]">
            <input
              type="checkbox"
              checked={selectedArchived.size === restorableArchived.length}
              onChange={(event) => setSelectedArchived(event.target.checked
                ? new Set(restorableArchived.map((entry) => entry.id))
                : new Set())}
            />
            {t('vault.entries.selectAllArchived')}
          </label>
          <Button
            variant="outline"
            size="sm"
            icon="restore"
            disabled={selectedArchived.size === 0 || restore.isPending}
            onClick={() => restoreEntries([...selectedArchived])}
          >
            {restore.isPending
              ? t('vault.entries.restoring')
              : t('vault.entries.restoreSelected', { count: selectedArchived.size })}
          </Button>
        </div>
      ) : null}

      <ScrollArea scrollRef={scrollRef} onScroll={onScroll}>
        {lifecycleState === 'deleted' && recentlyDeleted.isLoading ? (
          <EntriesLoadingSkeleton />
        ) : lifecycleState === 'deleted' && recentlyDeleted.isError ? (
          <ErrorState message={t('vault.entries.deletedLoadError')} onRetry={() => recentlyDeleted.refetch()} />
        ) : visibleEntries.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--cv-empty-border)]
            bg-[var(--cv-empty-bg)] p-6 text-center text-ui text-[var(--cv-t3)]">
            {t('vault.entries.emptySearch')}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleEntries.map((entry) => entry.state === 'active' && !entry.corrupt ? (
              <EntryRow
                key={entry.id}
                vaultId={vault.id}
                wrappedVK={vault.wrappedVK}
                entry={{
                  id: entry.id,
                  label: entry.label,
                  type: entry.type,
                  icon: entry.icon ?? undefined,
                  createdAt: '',
                  updatedAt: '',
                  accessCount: 0,
                }}
              />
            ) : (
              <LifecycleEntryRow
                key={entry.id}
                vaultId={vault.id}
                entry={entry}
                selected={selectedArchived.has(entry.id)}
                restoring={restore.isPending}
                retentionExpiresAt={deletedMetadata.get(entry.id)?.retentionExpiresAt}
                onSelected={(selected) => setSelectedArchived((current) => {
                  const next = new Set(current)
                  if (selected) next.add(entry.id)
                  else next.delete(entry.id)
                  return next
                })}
                onRestore={() => restoreEntries([entry.id])}
                onDestroy={() => setDestroyCandidate(entry)}
              />
            ))}
            {lifecycleState === 'deleted' && recentlyDeleted.hasNextPage ? (
              <LoadMoreSentinel
                hasNextPage
                isFetchingNextPage={recentlyDeleted.isFetchingNextPage}
                isFetchNextPageError={recentlyDeleted.isFetchNextPageError}
                onLoadMore={recentlyDeleted.fetchNextPage}
              />
            ) : null}
          </div>
        )}
      </ScrollArea>

      <CreateEntryModal
        open={createOpen}
        vault={vault}
        onClose={() => setCreateOpen(false)}
      />
      {destroyCandidate ? (
        <DestroyEntryDialog
          entryName={destroyCandidate.label}
          isPending={destroy.isPending}
          onCancel={() => setDestroyCandidate(null)}
          onConfirm={destroyEntry}
        />
      ) : null}
    </div>
  )
}

function LifecycleEntryRow({ vaultId, entry, selected, restoring, retentionExpiresAt, onSelected, onRestore, onDestroy }: {
  vaultId: string
  entry: MemberEntryListItem
  selected: boolean
  restoring: boolean
  retentionExpiresAt?: string
  onSelected: (selected: boolean) => void
  onRestore: () => void
  onDestroy: () => void
}) {
  const { t, i18n } = useTranslation()
  const content = (
    <>
      <EntryIcon icon={entry.icon ?? undefined} type={entry.type} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-heading-sm font-semibold text-[var(--cv-t1)]">{entry.label}</p>
        <p className="text-meta text-[var(--cv-t3)]">
          {entry.corrupt
            ? t('vault.entries.corrupt', { id: shortenKey(entry.id) })
            : entry.state === 'deleted' && retentionExpiresAt
              ? t('vault.entries.retentionDeadline', {
                  date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })
                    .format(new Date(retentionExpiresAt)),
                })
              : t(`vault.entries.stateDescription.${entry.state}`)}
        </p>
      </div>
    </>
  )
  const staticClasses = "flex items-center gap-3 rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] px-4 py-2.5"
  const interactiveClasses = `flex items-center gap-3 px-4 py-2.5 ${HOVERABLE_CARD_CLASSES}`
  if (entry.corrupt) return (
    <div className={staticClasses}>{content}</div>
  )
  if (entry.state === 'deleted') return (
    <div className={`${interactiveClasses} cursor-default`}>
      {content}
      <Button variant="outline" size="sm" icon="restore" disabled={restoring} onClick={onRestore}>
        {t('vault.entries.restore')}
      </Button>
      <Button variant="danger" size="sm" icon="delete" disabled={restoring} onClick={onDestroy}>
        {t('vault.entries.destroy')}
      </Button>
    </div>
  )
  return (
    <div className={`${interactiveClasses} cursor-default`}>
      <input
        type="checkbox"
        aria-label={t('vault.entries.selectArchived', { name: entry.label })}
        checked={selected}
        onChange={(event) => onSelected(event.target.checked)}
      />
      <Link
        to="/vaults/$vaultId/entries/$entryId"
        params={{ vaultId, entryId: entry.id }}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        {content}
      </Link>
      <Button variant="outline" size="sm" icon="restore" disabled={restoring} onClick={onRestore}>
        {t('vault.entries.restore')}
      </Button>
    </div>
  )
}

interface EntriesEmptyStateProps {
  onAdd: () => void
}

function EntriesEmptyState({ onAdd }: EntriesEmptyStateProps) {
  const { t } = useTranslation()
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl border border-dashed
        border-[var(--cv-empty-border)] bg-[var(--cv-empty-bg)] p-10 text-center"
    >
      <span
        className="inline-flex h-12 w-12 items-center justify-center rounded-full
          bg-[rgba(16,185,129,0.12)] text-[#10B981]"
        aria-hidden
      >
        <Icon name="inbox" size={24} />
      </span>
      <h3 className="text-heading font-bold text-[var(--cv-t1)]">
        {t('vault.entries.emptyTitle')}
      </h3>
      <p className="max-w-xs text-ui text-[var(--cv-t3)]">
        {t('vault.entries.emptySubtitle')}
      </p>
      <Button variant="accent" size="sm" icon="add" onClick={onAdd}>
        {t('vault.entries.emptyCta')}
      </Button>
    </div>
  )
}

function EntriesLoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-xl bg-[var(--cv-card-bg)]"
        />
      ))}
    </div>
  )
}
