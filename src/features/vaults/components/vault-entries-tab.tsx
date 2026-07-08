import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import {
  type EntryListItem,
  type Vault,
} from '../types'
import { useEntriesInfinite } from '../use-entries'
import { usePersistedEntriesList } from '../use-entries-list-ui'
import { CreateEntryModal } from './create-entry-modal'
import { EntryRow } from './entry-row'
import { LoadMoreSentinel } from '../../../shared/components/load-more-sentinel'
import { ScrollArea } from '../../../shared/components/scroll-area'
import { SearchBar } from '../../../shared/components/search-bar'

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

  const entries = useEntriesInfinite(vault.id)
  // Persist search + scroll per vault so it survives navigating into an entry.
  const { search, setSearch, scrollRef, onScroll } = usePersistedEntriesList(vault.id, !entries.isPending)
  const items = useMemo(
    () => entries.data?.pages.flatMap((p) => p.items) ?? [],
    [entries.data],
  )

  const filtered = useMemo(
    () => filterEntries(items, search),
    [items, search],
  )

  if (entries.isPending) {
    return <EntriesLoadingSkeleton />
  }

  if (entries.isError) {
    return <ErrorState message={t('vault.errorLoad')} onRetry={entries.refetch} />
  }

  if (items.length === 0) {
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
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder={t('vault.detail.entriesSearchPlaceholder')}
        className="mb-3 shrink-0"
      />

      <ScrollArea scrollRef={scrollRef} onScroll={onScroll}>
        {filtered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--cv-empty-border)]
            bg-[var(--cv-empty-bg)] p-6 text-center text-sm text-[var(--cv-t3)]">
            {t('vault.entries.emptySearch')}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((entry) => (
              <EntryRow
                key={entry.id}
                vaultId={vault.id}
                wrappedVK={vault.wrappedVK}
                entry={entry}
              />
            ))}
          </div>
        )}

        <LoadMoreSentinel
          hasNextPage={entries.hasNextPage}
          isFetchingNextPage={entries.isFetchingNextPage}
          isFetchNextPageError={entries.isFetchNextPageError}
          onLoadMore={entries.fetchNextPage}
        />
      </ScrollArea>

      <CreateEntryModal
        open={createOpen}
        vault={vault}
        onClose={() => setCreateOpen(false)}
      />
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
      <h3 className="text-[14px] font-bold text-[var(--cv-t1)]">
        {t('vault.entries.emptyTitle')}
      </h3>
      <p className="max-w-xs text-[12px] text-[var(--cv-t3)]">
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

function filterEntries(items: EntryListItem[], search: string): EntryListItem[] {
  const query = search.trim().toLowerCase()
  return items.filter((item) => {
    if (!query) return true
    return (
      item.label.toLowerCase().includes(query) ||
      (item.description?.toLowerCase().includes(query) ?? false) ||
      (item.urlDomain?.toLowerCase().includes(query) ?? false)
    )
  })
}
