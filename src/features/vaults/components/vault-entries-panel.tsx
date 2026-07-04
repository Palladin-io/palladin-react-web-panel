import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import {
  type EntryListItem,
  type Vault,
} from '../types'
import { useEntriesInfinite } from '../use-entries'
import { CreateEntryModal } from './create-entry-modal'
import { EntryRow } from './entry-row'
import { LoadMoreSentinel } from '../../../shared/components/load-more-sentinel'
import { ScrollArea } from '../../../shared/components/scroll-area'
import { SearchBar } from '../../../shared/components/search-bar'

export interface VaultEntriesPanelProps {
  vault: Vault
  selectedEntryId: string
}

/**
 * Compact left-side panel of the entry detail split view. Renders a
 * back link to the vault list, the vault title, an Add Entry CTA, and
 * the searchable entry list — highlighting the currently viewed row.
 *
 * Search logic mirrors {@link VaultEntriesTab} verbatim so the
 * panel and the full-page tab stay in lockstep. Owns its own
 * `CreateEntryModal` because the right-side panel has no knowledge of
 * the left side's lifecycle.
 */
export function VaultEntriesPanel({ vault, selectedEntryId }: VaultEntriesPanelProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const entries = useEntriesInfinite(vault.id)
  const items = useMemo(
    () => entries.data?.pages.flatMap((p) => p.items) ?? [],
    [entries.data],
  )

  const filtered = useMemo(
    () => filterEntries(items, search),
    [items, search],
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex h-10 shrink-0 items-center gap-2">
        <Link
          to="/vaults/$vaultId"
          params={{ vaultId: vault.id }}
          aria-label={t('vault.backToDetail')}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md
            text-[var(--cv-t3)] transition-colors hover:bg-[var(--cv-btn-ghost-hover)]
            hover:text-[var(--cv-t1)]"
        >
          <Icon name="arrow_back" size={16} />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14px] font-bold text-[var(--cv-t1)]">{vault.name}</h2>
          <p className="text-[11px] text-[var(--cv-t3)]">
            {t('vault.entries', { count: vault.entryCount })}
          </p>
        </div>
        <Button variant="accent" size="sm" icon="add" onClick={() => setCreateOpen(true)}>
          {t('vault.detail.addEntry')}
        </Button>
      </div>

      {entries.isPending ? (
        <PanelLoadingSkeleton />
      ) : entries.isError ? (
        <ErrorState message={t('vault.errorLoad')} onRetry={entries.refetch} />
      ) : (
        <>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder={t('vault.detail.entriesSearchPlaceholder')}
            className="mb-3 shrink-0"
          />

          {/* Only the items section scrolls — header and search stay pinned. */}
          <ScrollArea>
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
                    isSelected={entry.id === selectedEntryId}
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
        </>
      )}

      <CreateEntryModal
        open={createOpen}
        vault={vault}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  )
}

function PanelLoadingSkeleton() {
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
