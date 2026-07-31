import { memo, useCallback, useState, type UIEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import { type Vault } from '../types'
import { useEntriesListUi, usePersistedEntriesList } from '../use-entries-list-ui'
import { useMemberEntryList } from '../sync/member-entry-list'
import { useMemberSyncStore } from '../sync/member-sync-store'
import { CreateEntryModal } from './create-entry-modal'
import { EntryIcon } from './entry-icon'
import { HOVERABLE_CARD_CLASSES } from '../../../shared/lib/styles'
import { getCanonicalEntry } from '../api/vault-api'
import { entryDetailQueryKey } from '../use-entries'
import { ScrollArea } from '../../../shared/components/scroll-area'
import { SearchBar } from '../../../shared/components/search-bar'
import { usePublicEntryAssets, useReconcilePublicEntryAssets } from '../use-public-entry-assets'

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
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)

  const hasMemberProjection = useMemberSyncStore((store) => store.vaults.has(vault.id))
  // Persist search + scroll per vault so selecting an entry never resets the list.
  const { search, setSearch, scrollRef, onScroll } = usePersistedEntriesList(vault.id, hasMemberProjection)
  const [activeState] = useState(() => new Set(['active'] as const))
  const entries = useMemberEntryList(vault.id, activeState, search, 'name-asc')
  const selectedIndex = entries.items.findIndex((entry) => entry.id === selectedEntryId)
  const persistedOffset = Math.ceil((useEntriesListUi.getState().scrollTop[vault.id] ?? 0) / 64)
  const initialLimit = Math.max(50, selectedIndex + 1, persistedOffset + 50)
  const [renderWindow, setRenderWindow] = useState({ context: search, limit: initialLimit })
  const renderLimit = renderWindow.context === search ? renderWindow.limit : 50
  const renderedEntries = entries.items.slice(0, renderLimit)
  useReconcilePublicEntryAssets(entries.items.map((entry) => entry.icon))
  usePublicEntryAssets(renderedEntries.map((entry) => entry.icon))
  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    onScroll(event)
    const target = event.currentTarget
    if (target.scrollHeight - target.scrollTop - target.clientHeight > 240) return
    setRenderWindow((current) => ({
      context: search,
      limit: Math.min(entries.items.length, (current.context === search ? current.limit : 50) + 50),
    }))
  }, [entries.items.length, onScroll, search])
  const prefetchEntry = useCallback((entryId: string) => {
    void queryClient.prefetchQuery({
      queryKey: [...entryDetailQueryKey(vault.id, entryId), 'canonical'],
      queryFn: () => getCanonicalEntry(vault.id, entryId),
      staleTime: Infinity,
    })
  }, [queryClient, vault.id])

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
          <h2 className="truncate text-heading font-bold text-[var(--cv-t1)]">{vault.name}</h2>
          <p className="text-meta text-[var(--cv-t3)]">
            {t('vault.entries', { count: vault.entryCount })}
          </p>
        </div>
        <Button variant="accent" size="sm" icon="add" onClick={() => setCreateOpen(true)}>
          {t('vault.detail.addEntry')}
        </Button>
      </div>

      {entries.vaultStatus === null && (entries.status === 'idle' || entries.status === 'syncing') ? (
        <PanelLoadingSkeleton />
      ) : entries.vaultStatus === 'error' && entries.items.length === 0 ? (
        <ErrorState message={t('vault.errorLoad')} onRetry={entries.retry} />
      ) : (
        <>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder={t('vault.detail.entriesSearchPlaceholder')}
            className="mb-3 shrink-0"
          />

          {/* Only the items section scrolls — header and search stay pinned. */}
          <ScrollArea scrollRef={scrollRef} onScroll={handleScroll}>
            {entries.items.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[var(--cv-empty-border)]
                bg-[var(--cv-empty-bg)] p-6 text-center text-ui text-[var(--cv-t3)]">
                {t('vault.entries.emptySearch')}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {renderedEntries.map((entry) => (
                  <EntryNavigationRow
                    key={entry.id}
                    vaultId={vault.id}
                    entryId={entry.id}
                    label={entry.label}
                    type={entry.type}
                    icon={entry.icon}
                    username={entry.username}
                    urlDomain={entry.urlDomain}
                    isSelected={entry.id === selectedEntryId}
                    onIntent={prefetchEntry}
                  />
                ))}
              </div>
            )}
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

const EntryNavigationRow = memo(function EntryNavigationRow({
  vaultId, entryId, label, type, icon, username, urlDomain, isSelected, onIntent,
}: {
  vaultId: string
  entryId: string
  label: string
  type: 0 | 1 | 2
  icon: string | null
  username: string | null
  urlDomain: string | null
  isSelected: boolean
  onIntent: (entryId: string) => void
}) {
  const meta = [username, urlDomain].filter(Boolean).join(' · ')
  return (
    <Link
      to="/vaults/$vaultId/entries/$entryId"
      params={{ vaultId, entryId }}
      onPointerEnter={() => onIntent(entryId)}
      onFocus={() => onIntent(entryId)}
      className={`flex items-center gap-3 px-4 py-2.5 ${HOVERABLE_CARD_CLASSES}${
        isSelected ? ' !border-[var(--cv-t1)] bg-[var(--cv-btn-subtle-bg)]' : ''
      }`}
    >
      <EntryIcon icon={icon ?? undefined} type={type} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-heading-sm font-semibold text-[var(--cv-t1)]">{label}</p>
        {meta ? <p className="truncate text-meta text-[var(--cv-t3)]">{meta}</p> : null}
      </div>
    </Link>
  )
})

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
